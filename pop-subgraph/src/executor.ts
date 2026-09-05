import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  Initialized as InitializedEvent,
  CallerSet as CallerSetEvent,
  CallerChangeProposed as CallerChangeProposedEvent,
  CallerChangeCancelled as CallerChangeCancelledEvent,
  BatchExecuted as BatchExecutedEvent,
  CallExecuted as CallExecutedEvent,
  Swept as SweptEvent,
  HatsSet as HatsSetEvent,
  HatsRepointed as HatsRepointedEvent,
  HatMinterAuthorized as HatMinterAuthorizedEvent,
  HatsMinted as HatsMintedEvent,
  Paused as PausedEvent,
  Unpaused as UnpausedEvent,
  OwnershipTransferred as OwnershipTransferredEvent
} from "../generated/templates/Executor/Executor";
import {
  ExecutorContract,
  Organization,
  CallerChange,
  BatchExecution,
  CallExecution,
  ExecutorSweep,
  HatMinterAuthorization,
  HatsMintedEvent as HatsMintedEntity,
  ExecutorOwnershipTransfer,
  Proposal,
  DDVProposal,
  Account
} from "../generated/schema";
import { getUsernameForAddress, loadExistingUser, createUserOnJoin, createPauseEvent, getOrCreateRoleWearer, recordUserHatChange, shouldCreateRoleWearer } from "./utils";

export function handleInitialized(event: InitializedEvent): void {
  // Initialization handled in org-deployer.ts
  // This event just confirms the contract is initialized
}

export function handleCallerSet(event: CallerSetEvent): void {
  let contractAddress = event.address;

  // Update the ExecutorContract entity
  let executor = ExecutorContract.load(contractAddress);
  if (executor) {
    executor.allowedCaller = event.params.caller;
    // Clear pending caller change state when caller is actually set
    executor.pendingCaller = null;
    executor.callerChangeEffectiveAt = null;
    executor.save();
  }

  // Create historical record
  let changeId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let change = new CallerChange(changeId);

  change.executor = contractAddress;
  change.newCaller = event.params.caller;
  change.changedAt = event.block.timestamp;
  change.changedAtBlock = event.block.number;
  change.transactionHash = event.transaction.hash;

  change.save();
}

export function handleCallerChangeProposed(event: CallerChangeProposedEvent): void {
  let executor = ExecutorContract.load(event.address);
  if (executor) {
    executor.pendingCaller = event.params.newCaller;
    executor.callerChangeEffectiveAt = event.params.effectiveAt;
    executor.save();
  }
}

export function handleCallerChangeCancelled(event: CallerChangeCancelledEvent): void {
  let executor = ExecutorContract.load(event.address);
  if (executor) {
    executor.pendingCaller = null;
    executor.callerChangeEffectiveAt = null;
    executor.save();
  }
}

/**
 * Deterministic BatchExecution id, derivable from BOTH BatchExecuted and CallExecuted.
 *
 * Must not use logIndex: a CallExecuted at index i cannot know how many logs the remaining
 * len-1-i targets will emit before the trailing BatchExecuted (only the LAST call sits at
 * BatchExecuted.logIndex - 1, which is why the old `logIndex + 1` link happened to work for
 * single-call batches and broke for every longer one). A proposal executes at most once, so
 * (txHash, executor, proposalId) is unique and available on both events.
 */
function batchExecutionId(
  executor: Address,
  txHash: Bytes,
  proposalId: BigInt
): Bytes {
  return txHash
    .concat(executor)
    .concat(Bytes.fromByteArray(Bytes.fromBigInt(proposalId)));
}

export function handleBatchExecuted(event: BatchExecutedEvent): void {
  let contractAddress = event.address;
  let proposalId = event.params.proposalId;

  let batchId = batchExecutionId(
    contractAddress,
    event.transaction.hash,
    proposalId
  );
  let batch = new BatchExecution(batchId);

  batch.executor = contractAddress;
  batch.proposalId = proposalId;
  batch.callCount = event.params.calls;
  batch.executedAt = event.block.timestamp;
  batch.executedAtBlock = event.block.number;
  batch.transactionHash = event.transaction.hash;

  // Attribute the batch to the proposal that authorised it. Executor.execute() reverts unless
  // msg.sender == allowedCaller ("sole authorised governor"), so allowedCaller IS the governance
  // contract that ran this batch — use it to pick the relation. Matching on proposalId alone would
  // be wrong: HybridVoting and DirectDemocracyVoting keep independent proposal counters, so both
  // typically have a proposal 0, 1, 2 ... and every execution would be attached to both.
  //
  // On current deployments allowedCaller is the HybridVoting proxy, so the DDV branch is
  // defensive: a permanently null ddvProposal is expected, not an indexing bug.
  let executor = ExecutorContract.load(contractAddress);
  if (executor) {
    let org = Organization.load(executor.organization);
    if (org) {
      let callerOrNull = executor.allowedCaller;
      let hv = org.hybridVoting;
      let ddv = org.directDemocracyVoting;

      // allowedCaller is nullable until the first CallerSet; without it there is nothing to
      // disambiguate on, so leave both relations unset rather than guess.
      if (callerOrNull !== null) {
        let caller = callerOrNull as Bytes;
        let matched = false;

        if (hv !== null) {
          let hvAddress = hv as Bytes;
          if (caller.equals(hvAddress)) {
            matched = true;
            let hybridId = hvAddress.toHexString() + "-" + proposalId.toString();
            if (Proposal.load(hybridId) != null) {
              batch.hybridProposal = hybridId;
            }
          }
        }

        if (!matched && ddv !== null) {
          let ddvAddress = ddv as Bytes;
          if (caller.equals(ddvAddress)) {
            let ddvId = ddvAddress.toHexString() + "-" + proposalId.toString();
            if (DDVProposal.load(ddvId) != null) {
              batch.ddvProposal = ddvId;
            }
          }
        }
      }
    }
  }

  batch.save();
}

export function handleCallExecuted(event: CallExecutedEvent): void {
  let contractAddress = event.address;
  let proposalId = event.params.proposalId;
  let callIndex = event.params.index;

  // Create call execution record
  // Use txHash-logIndex-callIndex for unique ID since multiple calls in same tx
  let callId = event.transaction.hash.concatI32(event.logIndex.toI32()).concat(
    Bytes.fromByteArray(Bytes.fromBigInt(callIndex))
  );
  let call = new CallExecution(callId);

  call.executor = contractAddress;
  call.proposalId = proposalId;
  call.callIndex = callIndex;
  call.target = event.params.target;
  call.value = event.params.value;
  call.executedAt = event.block.timestamp;
  call.executedAtBlock = event.block.number;
  call.transactionHash = event.transaction.hash;

  // BatchExecuted is emitted after the calls, so the row may not exist yet — graph-node resolves
  // the reference at query time.
  call.batch = batchExecutionId(
    contractAddress,
    event.transaction.hash,
    proposalId
  );

  call.save();
}

export function handleSwept(event: SweptEvent): void {
  let contractAddress = event.address;

  // Create sweep record
  let sweepId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let sweep = new ExecutorSweep(sweepId);

  sweep.executor = contractAddress;
  sweep.to = event.params.to;
  sweep.amount = event.params.amount;
  sweep.sweptAt = event.block.timestamp;
  sweep.sweptAtBlock = event.block.number;
  sweep.transactionHash = event.transaction.hash;

  sweep.save();
}

export function handleHatsSet(event: HatsSetEvent): void {
  let contractAddress = event.address;

  // Update the ExecutorContract entity
  let executor = ExecutorContract.load(contractAddress);
  if (executor) {
    executor.hatsContract = event.params.hats;
    executor.save();
  }
}

/** Access-v2 repoints Executor's IHats-shaped surface to MembershipAuthority. */
export function handleHatsRepointed(event: HatsRepointedEvent): void {
  let executor = ExecutorContract.load(event.address);
  if (executor != null) {
    executor.hatsContract = event.params.hats;
    executor.save();
  }
}

export function handleHatMinterAuthorized(event: HatMinterAuthorizedEvent): void {
  let contractAddress = event.address;
  let minter = event.params.minter;

  // Create or update minter authorization
  let authId = contractAddress.toHexString() + "-" + minter.toHexString();
  let auth = HatMinterAuthorization.load(authId);

  if (!auth) {
    auth = new HatMinterAuthorization(authId);
    auth.executor = contractAddress;
    auth.minter = minter;
  }

  auth.authorized = event.params.authorized;
  auth.updatedAt = event.block.timestamp;
  auth.updatedAtBlock = event.block.number;
  auth.transactionHash = event.transaction.hash;

  auth.save();
}

export function handleHatsMinted(event: HatsMintedEvent): void {
  let contractAddress = event.address;
  let recipient = event.params.user;

  // Create hats minted event record
  let mintId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let mint = new HatsMintedEntity(mintId);

  mint.executor = contractAddress;
  mint.recipient = recipient;
  mint.recipientUsername = getUsernameForAddress(recipient);
  mint.hatIds = event.params.hatIds;
  mint.mintedAt = event.block.timestamp;
  mint.mintedAtBlock = event.block.number;
  mint.transactionHash = event.transaction.hash;

  // Link to Account if exists
  let account = Account.load(recipient);
  if (account) {
    mint.recipientAccount = recipient;
  }

  // Link to User entity if we can determine the organization
  let executor = ExecutorContract.load(contractAddress);
  if (executor) {
    // Skip RoleWearer creation if Executor is minting to itself (system contract)
    // This avoids timing issues with Organization entity not being fully saved yet
    if (recipient.equals(contractAddress)) {
      mint.save();
      return;
    }

    // Try to load existing user first
    let user = loadExistingUser(
      executor.organization,
      recipient,
      event.block.timestamp,
      event.block.number
    );

    // If user doesn't exist, check if they have a registered Account
    // This handles deployer mints during org deployment - deployers register their
    // username before hats are minted, creating an Account entity
    // System contracts won't have Account entities, so they're filtered out
    if (user == null) {
      let account = Account.load(recipient);
      if (account != null) {
        user = createUserOnJoin(
          executor.organization,
          recipient,
          "ExecutorMint",
          event.block.timestamp,
          event.block.number
        );
      }
    }

    if (user) {
      mint.recipientUser = user.id;

      // Create RoleWearers for each minted hat (only for user-facing hats to non-system addresses)
      let hatIds = event.params.hatIds;
      for (let i = 0; i < hatIds.length; i++) {
        let hatId = hatIds[i];
        // Only create RoleWearer for eligible combinations (not system contracts, not system hats)
        if (shouldCreateRoleWearer(executor.organization, hatId, recipient)) {
          getOrCreateRoleWearer(
            executor.organization,
            hatId,
            recipient,
            event
          );
          recordUserHatChange(user, hatId, true, event);
        }
      }
      user.save();
    }
  }

  mint.save();
}

export function handlePaused(event: PausedEvent): void {
  let executor = ExecutorContract.load(event.address);
  if (!executor) {
    return;
  }

  // Update contract
  executor.isPaused = true;
  executor.save();

  // Create pause event record using consolidated PauseEvent entity
  createPauseEvent(
    event.address,
    "Executor",
    executor.organization,
    true,
    event.params.account,
    event
  );
}

export function handleUnpaused(event: UnpausedEvent): void {
  let executor = ExecutorContract.load(event.address);
  if (!executor) {
    return;
  }

  // Update contract
  executor.isPaused = false;
  executor.save();

  // Create unpause event record using consolidated PauseEvent entity
  createPauseEvent(
    event.address,
    "Executor",
    executor.organization,
    false,
    event.params.account,
    event
  );
}

export function handleOwnershipTransferred(event: OwnershipTransferredEvent): void {
  let contractAddress = event.address;

  // Update contract
  let executor = ExecutorContract.load(contractAddress);
  if (executor) {
    executor.owner = event.params.newOwner;
    executor.save();
  }

  // Create transfer record
  let transferId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let transfer = new ExecutorOwnershipTransfer(transferId);

  transfer.executor = contractAddress;
  transfer.previousOwner = event.params.previousOwner;
  transfer.newOwner = event.params.newOwner;
  transfer.transferredAt = event.block.timestamp;
  transfer.transferredAtBlock = event.block.number;
  transfer.transactionHash = event.transaction.hash;

  transfer.save();
}
