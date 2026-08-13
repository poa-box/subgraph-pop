import { Address, Bytes, BigInt, DataSourceContext } from "@graphprotocol/graph-ts";
import {
  HybridVoting as HybridVotingAbi,
  Initialized,
  ExecutorUpdated,
  ThresholdPctSet,
  QuorumSet,
  HatSet,
  HatToggled,
  NewProposal,
  NewHatProposal,
  VoteCast,
  Winner,
  ProposalExecuted,
  ProposalExecutionFailed,
  ClassesReplaced,
  ClassHatSet,
  ProposalConfigV2,
  ConfigAdminSet
} from "../generated/templates/HybridVoting/HybridVoting";
import {
  HybridVotingContract,
  HybridVotingThresholdChange,
  HybridVotingQuorumChange,
  HatPermission,
  Proposal,
  Vote,
  VotingClass,
  VotingClassChange,
  ProposalMetadata
} from "../generated/schema";
import { ProposalMetadata as ProposalMetadataTemplate } from "../generated/templates";
import { getUsernameForAddress, loadExistingUser, createHatPermission, createExecutorChange, getOrCreateRole, backfillVotingHatPermissions } from "./utils";

// Zero hash constant for comparison
const ZERO_HASH = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000");

/**
 * Convert bytes32 sha256 digest to IPFS CIDv0.
 * CIDv0 = base58( 0x1220 + sha256_digest )
 */
function bytes32ToCid(hash: Bytes): string {
  let prefix = Bytes.fromHexString("0x1220");
  let multihash = new Bytes(34);
  for (let i = 0; i < 2; i++) {
    multihash[i] = prefix[i];
  }
  for (let i = 0; i < 32; i++) {
    multihash[i + 2] = hash[i];
  }
  return multihash.toBase58();
}

/**
 * Create IPFS data source for proposal metadata.
 */
function createProposalMetadataDataSource(descriptionHash: Bytes, proposalEntityId: string): void {
  // Skip if hash is empty (all zeros)
  if (descriptionHash.equals(ZERO_HASH)) {
    return;
  }

  // Convert bytes32 to IPFS CIDv0
  let ipfsCid = bytes32ToCid(descriptionHash);

  // Use proposalEntityId as the metadata entity ID (not CID) so each proposal
  // gets its own immutable entity — avoids INSERT conflicts when the same CID
  // is reused across proposals in different blocks (offchain causality regions)
  let existingMetadata = ProposalMetadata.load(proposalEntityId);
  if (existingMetadata != null) {
    return;
  }

  // Create context to pass proposal info to the IPFS handler
  let context = new DataSourceContext();
  context.setString("proposalEntityId", proposalEntityId);
  context.setString("proposalType", "hybrid");

  // Create the file data source
  ProposalMetadataTemplate.createWithContext(ipfsCid, context);
}

/**
 * Handler for Initialized event
 * Updates the HybridVotingContract entity with initialization data and
 * backfills the creator-hat permissions seeded during initialize().
 * The entity should already exist, created by handleOrgDeployed.
 */
export function handleInitialized(event: Initialized): void {
  let contract = HybridVotingContract.load(event.address);

  if (!contract) {
    // Edge case: contract doesn't exist yet (OrgDeployed not processed)
    // Skip this update - the contract will be created by OrgDeployed
    return;
  }

  // Creator hats are seeded inside initialize() WITHOUT emitting HatSet, so
  // handleHatSet never sees deploy-time grants — a role that can create
  // proposals would otherwise be missing from the permissions matrix. Read the
  // authoritative on-chain set now (initialize() has run by this point) and
  // backfill. HV voters are class-based (see handleClassesReplaced), so there
  // is no voting-hat array to read here.
  let bound = HybridVotingAbi.bind(event.address);
  let creatorHats = bound.try_creatorHats();
  if (!creatorHats.reverted) {
    backfillVotingHatPermissions(
      event.address,
      "HybridVoting",
      contract.organization,
      creatorHats.value,
      "Creator",
      event
    );
  }

  // Note: executor, quorum, hats will be set by their respective events
  contract.save();
}

/**
 * Handler for ExecutorUpdated event
 * Updates the executor address and creates a historical record
 */
export function handleExecutorUpdated(event: ExecutorUpdated): void {
  let contract = HybridVotingContract.load(event.address);

  if (!contract) {
    // Edge case: contract doesn't exist yet (OrgDeployed not processed)
    // Skip this update - the contract will be created by OrgDeployed
    return;
  }

  // Update current executor
  contract.executor = event.params.newExec;
  contract.save();

  // Create historical record using consolidated ExecutorChange entity
  createExecutorChange(
    event.address,
    "HybridVoting",
    contract.organization,
    event.params.newExec,
    event
  );
}

/**
 * Handler for ThresholdPctSet event
 * Updates the threshold percentage and creates a historical record
 */
export function handleThresholdPctSet(event: ThresholdPctSet): void {
  let contract = HybridVotingContract.load(event.address);

  if (!contract) {
    return;
  }

  contract.thresholdPct = event.params.pct;
  contract.save();

  let changeId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let change = new HybridVotingThresholdChange(changeId);

  change.hybridVoting = event.address;
  change.newThresholdPct = event.params.pct;
  change.changedAt = event.block.timestamp;
  change.changedAtBlock = event.block.number;
  change.transactionHash = event.transaction.hash;

  change.save();
}

/**
 * Handler for QuorumSet event
 * Updates the minimum voter count quorum and creates a historical record
 */
export function handleQuorumSet(event: QuorumSet): void {
  let contract = HybridVotingContract.load(event.address);

  if (!contract) {
    return;
  }

  contract.quorum = event.params.quorum.toI32();
  contract.save();

  let changeId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let change = new HybridVotingQuorumChange(changeId);

  change.hybridVoting = event.address;
  change.newQuorum = event.params.quorum.toI32();
  change.changedAt = event.block.timestamp;
  change.changedAtBlock = event.block.number;
  change.transactionHash = event.transaction.hash;

  change.save();
}

/**
 * Handler for HatSet event
 * Creates or updates hat permissions with type information
 */
export function handleHatSet(event: HatSet): void {
  let contract = HybridVotingContract.load(event.address);
  if (!contract) {
    return;
  }

  // Determine role based on hatType: 0 = Creator, 1+ = Voter classes
  let permissionRole = event.params.hatType == 0 ? "Creator" : "Voter";

  // Create or update consolidated HatPermission entity
  let permissionId =
    event.address.toHexString() +
    "-" +
    event.params.hat.toString() +
    "-" +
    permissionRole;

  let permission = HatPermission.load(permissionId);
  if (!permission) {
    permission = new HatPermission(permissionId);
    permission.contractAddress = event.address;
    permission.contractType = "HybridVoting";
    permission.organization = contract.organization;
    permission.hatId = event.params.hat;
    permission.permissionRole = permissionRole;
  }

  // Link to Role entity
  let role = getOrCreateRole(contract.organization, event.params.hat, event);
  permission.role = role.id;

  permission.allowed = event.params.allowed;
  permission.hatType = event.params.hatType;
  permission.setAt = event.block.timestamp;
  permission.setAtBlock = event.block.number;
  permission.transactionHash = event.transaction.hash;
  permission.save();
}

/**
 * Handler for HatToggled event
 * Creates or updates hat permissions (without type information)
 */
export function handleHatToggled(event: HatToggled): void {
  let contract = HybridVotingContract.load(event.address);
  if (!contract) {
    return;
  }

  // HatToggled doesn't have hatType, default to Voter role
  let permissionRole = "Voter";

  // Create or update consolidated HatPermission entity
  let permissionId =
    event.address.toHexString() +
    "-" +
    event.params.hatId.toString() +
    "-" +
    permissionRole;

  let permission = HatPermission.load(permissionId);
  if (!permission) {
    permission = new HatPermission(permissionId);
    permission.contractAddress = event.address;
    permission.contractType = "HybridVoting";
    permission.organization = contract.organization;
    permission.hatId = event.params.hatId;
    permission.permissionRole = permissionRole;
  }

  // Link to Role entity
  let role = getOrCreateRole(contract.organization, event.params.hatId, event);
  permission.role = role.id;

  permission.allowed = event.params.allowed;
  permission.setAt = event.block.timestamp;
  permission.setAtBlock = event.block.number;
  permission.transactionHash = event.transaction.hash;
  permission.save();
}

// ============================================================================
// PROPOSAL HANDLERS
// ============================================================================

/**
 * Handler for NewProposal event
 * Creates a new unrestricted proposal
 */
export function handleNewProposal(event: NewProposal): void {
  let contractAddress = event.address.toHexString();
  let proposalId = contractAddress + "-" + event.params.id.toString();

  let proposal = new Proposal(proposalId);

  proposal.proposalId = event.params.id;
  proposal.hybridVoting = event.address;
  // Creator is no longer in event, use transaction.from
  proposal.creator = event.transaction.from;
  proposal.creatorUsername = getUsernameForAddress(event.transaction.from);
  // Frontend-facing aliases (proposer/proposerUsername) populated identically to creator
  proposal.proposer = event.transaction.from;
  proposal.proposerUsername = getUsernameForAddress(event.transaction.from);

  // Link to User entity
  let votingContract = HybridVotingContract.load(event.address);
  if (votingContract) {
    let user = loadExistingUser(
      votingContract.organization,
      event.transaction.from,
      event.block.timestamp,
      event.block.number
    );
    if (user) {
      proposal.creatorUser = user.id;
    }
  }

  // Snapshot the voting-class config this proposal was created under.
  // classesVersion defaults to 0 if the contract entity or its classVersion is not yet set;
  // classesChange is the exact pointer, since two setClasses in one block share a version.
  proposal.classesVersion = votingContract ? votingContract.classVersion : BigInt.fromI32(0);
  if (votingContract) {
    proposal.classesChange = votingContract.classesChange;
  }

  proposal.title = event.params.title.toString();
  proposal.descriptionHash = event.params.descriptionHash;
  proposal.numOptions = event.params.numOptions;
  proposal.startTimestamp = event.params.created;
  proposal.endTimestamp = event.params.endTs;
  proposal.isHatRestricted = false;
  proposal.restrictedHatIds = [];
  proposal.status = "Active";
  proposal.wasExecuted = false;
  proposal.executionFailed = false;
  proposal.createdAtBlock = event.block.number;
  proposal.transactionHash = event.transaction.hash;

  // Link metadata by proposalId (not CID) — each proposal gets its own metadata entity
  if (!event.params.descriptionHash.equals(ZERO_HASH)) {
    proposal.metadata = proposalId;
  }

  proposal.save();

  // Trigger IPFS fetch for proposal metadata (description and option names)
  createProposalMetadataDataSource(event.params.descriptionHash, proposalId);
}

/**
 * Handler for NewHatProposal event
 * Creates a new hat-restricted proposal
 */
export function handleNewHatProposal(event: NewHatProposal): void {
  let contractAddress = event.address.toHexString();
  let proposalId = contractAddress + "-" + event.params.id.toString();

  let proposal = new Proposal(proposalId);

  proposal.proposalId = event.params.id;
  proposal.hybridVoting = event.address;
  // Creator is no longer in event, use transaction.from
  proposal.creator = event.transaction.from;
  proposal.creatorUsername = getUsernameForAddress(event.transaction.from);
  // Frontend-facing aliases (proposer/proposerUsername) populated identically to creator
  proposal.proposer = event.transaction.from;
  proposal.proposerUsername = getUsernameForAddress(event.transaction.from);

  // Link to User entity
  let votingContract = HybridVotingContract.load(event.address);
  if (votingContract) {
    let user = loadExistingUser(
      votingContract.organization,
      event.transaction.from,
      event.block.timestamp,
      event.block.number
    );
    if (user) {
      proposal.creatorUser = user.id;
    }
  }

  // Snapshot the voting-class config this proposal was created under.
  // classesVersion defaults to 0 if the contract entity or its classVersion is not yet set;
  // classesChange is the exact pointer, since two setClasses in one block share a version.
  proposal.classesVersion = votingContract ? votingContract.classVersion : BigInt.fromI32(0);
  if (votingContract) {
    proposal.classesChange = votingContract.classesChange;
  }

  proposal.title = event.params.title.toString();
  proposal.descriptionHash = event.params.descriptionHash;
  proposal.numOptions = event.params.numOptions;
  proposal.startTimestamp = event.params.created;
  proposal.endTimestamp = event.params.endTs;
  proposal.isHatRestricted = true;
  proposal.restrictedHatIds = event.params.hatIds;
  proposal.status = "Active";
  proposal.wasExecuted = false;
  proposal.executionFailed = false;
  proposal.createdAtBlock = event.block.number;
  proposal.transactionHash = event.transaction.hash;

  // Link metadata by proposalId (not CID)
  if (!event.params.descriptionHash.equals(ZERO_HASH)) {
    proposal.metadata = proposalId;
  }

  proposal.save();

  // Trigger IPFS fetch for proposal metadata (description and option names)
  createProposalMetadataDataSource(event.params.descriptionHash, proposalId);
}

/**
 * Handler for VoteCast event
 * Records a vote on a proposal
 */
export function handleVoteCast(event: VoteCast): void {
  let contractAddress = event.address.toHexString();
  let proposalId = contractAddress + "-" + event.params.id.toString();
  let voterAddress = event.params.voter.toHexString();
  let voteId = proposalId + "-" + voterAddress;

  // Vote is immutable - check if already exists to prevent duplicate creation
  let existingVote = Vote.load(voteId);
  if (existingVote != null) {
    return;
  }

  let vote = new Vote(voteId);

  vote.proposal = proposalId;
  vote.voter = event.params.voter;
  vote.voterUsername = getUsernameForAddress(event.params.voter);

  // Link to User entity and increment totalVotes
  let votingContract = HybridVotingContract.load(event.address);
  if (votingContract) {
    let user = loadExistingUser(
      votingContract.organization,
      event.params.voter,
      event.block.timestamp,
      event.block.number
    );
    if (user) {
      vote.voterUser = user.id;
      user.totalVotes = user.totalVotes.plus(BigInt.fromI32(1));
      user.save();
    }
  }

  // Convert uint8[] arrays to Int arrays for optionIndexes and optionWeights
  let indexes: i32[] = [];
  for (let i = 0; i < event.params.idxs.length; i++) {
    indexes.push(event.params.idxs[i]);
  }
  vote.optionIndexes = indexes;

  let weights: i32[] = [];
  for (let i = 0; i < event.params.weights.length; i++) {
    weights.push(event.params.weights[i]);
  }
  vote.optionWeights = weights;

  vote.classRawPowers = event.params.classRawPowers;
  vote.votedAt = event.params.timestamp;
  vote.votedAtBlock = event.block.number;
  vote.transactionHash = event.transaction.hash;

  vote.save();
}

/**
 * Handler for Winner event
 * Marks the winning option and updates proposal status
 */
export function handleWinner(event: Winner): void {
  let contractAddress = event.address.toHexString();
  let proposalId = contractAddress + "-" + event.params.id.toString();

  let proposal = Proposal.load(proposalId);

  if (!proposal) {
    // Edge case: proposal not found, skip
    return;
  }

  proposal.winningOption = event.params.winningIdx;
  proposal.isValid = event.params.valid;
  proposal.winnerAnnouncedAt = event.params.timestamp;

  // Update status based on whether it was executed
  if (event.params.executed) {
    proposal.status = "Executed";
    proposal.wasExecuted = true;
  } else {
    proposal.status = "Ended";
  }

  proposal.save();
}

/**
 * Handler for ProposalExecuted event
 * Marks the proposal as executed and records execution details
 */
export function handleProposalExecuted(event: ProposalExecuted): void {
  let contractAddress = event.address.toHexString();
  let proposalId = contractAddress + "-" + event.params.id.toString();

  let proposal = Proposal.load(proposalId);

  if (!proposal) {
    // Edge case: proposal not found, skip
    return;
  }

  proposal.wasExecuted = true;
  proposal.status = "Executed";
  proposal.executedAt = event.block.timestamp;
  proposal.executedCallsCount = event.params.numCalls;

  proposal.save();
}

export function handleProposalExecutionFailed(event: ProposalExecutionFailed): void {
  let contractAddress = event.address.toHexString();
  let proposalId = contractAddress + "-" + event.params.id.toString();

  let proposal = Proposal.load(proposalId);
  if (!proposal) return;

  proposal.executionFailed = true;
  proposal.executionError = event.params.reason;
  // Status is set to "Ended" by handleWinner (didExecute=false), which fires after this event
  proposal.save();
}

// ============================================================================
// CLASS CONFIGURATION HANDLERS
// ============================================================================

/**
 * Handler for ClassesReplaced event
 * Creates VotingClass entities for each class in the configuration
 * and records the change in VotingClassChange
 */
export function handleClassesReplaced(event: ClassesReplaced): void {
  let contract = HybridVotingContract.load(event.address);

  if (!contract) {
    // Edge case: contract doesn't exist yet (OrgDeployed not processed)
    // Skip this update - the contract will be created by OrgDeployed
    return;
  }

  let version = event.params.version;
  let contractAddress = event.address.toHexString();

  // setClasses REPLACES the whole array on chain, so every row an earlier ClassesReplaced
  // wrote is dead now — and no per-row event says so. Consumers filtering on isActive would
  // otherwise keep seeing superseded configs.
  // Sweep BEFORE the create loop, never after: `version` is the emitting block number, so two
  // setClasses in one block reuse the same ids and a post-hoc sweep would flip the rows this
  // handler just wrote. Sweeping first also leaves no orphan when the new config has FEWER
  // classes than the old one — rows whose index no longer exists stay false.
  // Sweeping ALL rows rather than just contract.classVersion's is deliberate: it self-heals any
  // version left active by an earlier miss, which the bounded form cannot. The isActive check is
  // only there to skip redundant writes.
  let superseded = contract.votingClasses.load();
  for (let i = 0; i < superseded.length; i++) {
    let stale = superseded[i];
    if (!stale.isActive) continue;
    stale.isActive = false;
    stale.save();
  }

  // Immutable record of this emission. Written before the class rows only so changeId is
  // defined before use — graph-node buffers writes and resolves @derivedFrom at query time,
  // so the order carries no store-level meaning.
  let classes = event.params.classes;
  let changeId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let change = new VotingClassChange(changeId);

  change.hybridVoting = event.address;
  change.version = version;
  change.logIndex = event.logIndex;
  change.classesHash = event.params.classesHash;
  change.numClasses = classes.length;
  change.changedAt = event.block.timestamp;
  change.changedAtBlock = event.block.number;
  change.transactionHash = event.transaction.hash;

  change.save();

  // Create VotingClass entities for each class in the new configuration.
  // Keyed on the INDEXED coordinates (block, logIndex), not on `version`. `version` is the
  // contract's block.number, which on Arbitrum is the L1 block — one value there covers ~48 L2
  // blocks, so several emissions share it. Keying on version would let a later setClasses
  // overwrite the rows a proposal created earlier was snapshotted against, and VotingClassChange
  // keeps only the hash, so those contents would be unrecoverable. (block, logIndex) is unique
  // on every network.
  for (let i = 0; i < classes.length; i++) {
    let classConfig = classes[i];
    let classId =
      contractAddress +
      "-" +
      event.block.number.toString() +
      "-" +
      event.logIndex.toString() +
      "-" +
      i.toString();

    let votingClass = new VotingClass(classId);
    votingClass.hybridVoting = event.address;
    votingClass.change = changeId;
    votingClass.version = version;
    votingClass.classIndex = i;

    // Map strategy enum: 0 = DIRECT, 1 = ERC20_BAL
    if (classConfig.strategy == 0) {
      votingClass.strategy = "DIRECT";
    } else {
      votingClass.strategy = "ERC20_BAL";
    }

    votingClass.slicePct = classConfig.slicePct;
    votingClass.quadratic = classConfig.quadratic;
    votingClass.minBalance = classConfig.minBalance;
    votingClass.asset = classConfig.asset;
    votingClass.hatIds = classConfig.hatIds;
    votingClass.isActive = true; // New classes are active
    votingClass.createdAt = event.block.timestamp;
    votingClass.createdAtBlock = event.block.number;
    votingClass.transactionHash = event.transaction.hash;

    votingClass.save();
  }

  // Update the contract's pointers to the live config. classesChange is the precise one —
  // classVersion cannot distinguish two setClasses that share a block.
  contract.classVersion = version;
  contract.classesChange = changeId;
  contract.save();
}

/**
 * Handler for ClassHatSet(classIdx, hatId, added) — an incremental class edit (addHatToClass /
 * removeHatFromClass), which changes a SINGLE class's hatIds without a full setClasses.
 *
 * The existing VotingClass model is drift-safe: a Proposal snapshots the exact ClassesReplaced
 * emission (VotingClassChange) it was created under, and consumers reconstruct the config by joining
 * through Proposal.classesChange. Mutating the live rows in place would retroactively change the
 * config already-created proposals point at. So we mirror handleClassesReplaced: sweep the live rows,
 * write a NEW VotingClassChange, and re-emit a full snapshot with the one class's hatIds edited.
 * Proposals created before this edit keep their old (immutable) pointer; new proposals pick up the
 * new change. classVersion is set to the emitting block number, coherent with ClassesReplaced.
 */
export function handleClassHatSet(event: ClassHatSet): void {
  let contract = HybridVotingContract.load(event.address);
  if (!contract) {
    return;
  }

  let contractAddress = event.address.toHexString();
  let classIdx = event.params.classIdx;
  let editedHatId = event.params.hatId;
  let added = event.params.added;

  // Capture the live (isActive) rows before sweeping. addHatToClass validates classIdx on-chain, so
  // the snapshot should contain that index; if the subgraph missed the seeding ClassesReplaced there
  // is nothing to edit — bail rather than invent class parameters.
  let allRows = contract.votingClasses.load();
  let liveCount = 0;
  for (let i = 0; i < allRows.length; i++) {
    if (allRows[i].isActive) liveCount++;
  }
  if (liveCount == 0) {
    return;
  }

  // Snapshot the live rows into parallel arrays keyed by classIndex (0..liveCount-1).
  let strategies = new Array<string>(liveCount);
  let slicePcts = new Array<i32>(liveCount);
  let quadratics = new Array<bool>(liveCount);
  let minBalances = new Array<BigInt>(liveCount);
  let assets = new Array<Bytes>(liveCount);
  let hatIdsPerClass = new Array<Array<BigInt>>(liveCount);
  for (let i = 0; i < allRows.length; i++) {
    let row = allRows[i];
    if (!row.isActive) continue;
    let ci = row.classIndex;
    if (ci < 0 || ci >= liveCount) continue;
    strategies[ci] = row.strategy;
    slicePcts[ci] = row.slicePct;
    quadratics[ci] = row.quadratic;
    minBalances[ci] = row.minBalance;
    assets[ci] = row.asset;
    hatIdsPerClass[ci] = row.hatIds;
  }

  // Apply the single-hat edit to the target class.
  if (classIdx >= 0 && classIdx < liveCount) {
    let current = hatIdsPerClass[classIdx];
    let next = new Array<BigInt>(0);
    if (added) {
      let present = false;
      for (let j = 0; j < current.length; j++) {
        next.push(current[j]);
        if (current[j].equals(editedHatId)) present = true;
      }
      if (!present) next.push(editedHatId);
    } else {
      for (let j = 0; j < current.length; j++) {
        if (!current[j].equals(editedHatId)) next.push(current[j]);
      }
    }
    hatIdsPerClass[classIdx] = next;
  }

  // Sweep the live rows (they are superseded by the new snapshot below).
  for (let i = 0; i < allRows.length; i++) {
    if (!allRows[i].isActive) continue;
    allRows[i].isActive = false;
    allRows[i].save();
  }

  // New change-log entry. No classesHash in the event, so use the zero hash as an opaque tag; the
  // synthetic version is the emitting block number (coherent with ClassesReplaced semantics).
  let version = event.block.number;
  let changeId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let change = new VotingClassChange(changeId);
  change.hybridVoting = event.address;
  change.version = version;
  change.logIndex = event.logIndex;
  change.classesHash = ZERO_HASH;
  change.numClasses = liveCount;
  change.changedAt = event.block.timestamp;
  change.changedAtBlock = event.block.number;
  change.transactionHash = event.transaction.hash;
  change.save();

  for (let ci = 0; ci < liveCount; ci++) {
    let classId =
      contractAddress + "-" + event.block.number.toString() + "-" + event.logIndex.toString() + "-" + ci.toString();
    let votingClass = new VotingClass(classId);
    votingClass.hybridVoting = event.address;
    votingClass.change = changeId;
    votingClass.version = version;
    votingClass.classIndex = ci;
    votingClass.strategy = strategies[ci];
    votingClass.slicePct = slicePcts[ci];
    votingClass.quadratic = quadratics[ci];
    votingClass.minBalance = minBalances[ci];
    votingClass.asset = assets[ci];
    votingClass.hatIds = hatIdsPerClass[ci];
    votingClass.isActive = true;
    votingClass.createdAt = event.block.timestamp;
    votingClass.createdAtBlock = event.block.number;
    votingClass.transactionHash = event.transaction.hash;
    votingClass.save();
  }

  contract.classVersion = version;
  contract.classesChange = changeId;
  contract.save();
}

/**
 * Handler for ProposalConfigV2(id, quorumOverride, equalWeight) — emitted by createProposalV2 AFTER
 * NewProposal/NewHatProposal, so the Proposal entity already exists. Additive: legacy createProposal
 * proposals never emit this, leaving the fields null.
 */
export function handleProposalConfigV2(event: ProposalConfigV2): void {
  let proposalId = event.address.toHexString() + "-" + event.params.id.toString();
  let proposal = Proposal.load(proposalId);
  if (proposal == null) {
    return;
  }
  proposal.quorumOverride = event.params.quorumOverride;
  proposal.equalWeight = event.params.equalWeight;
  proposal.save();
}

/**
 * Handler for ConfigAdminSet(admin) — records the scoped RoleManager config admin.
 */
export function handleConfigAdminSet(event: ConfigAdminSet): void {
  let contract = HybridVotingContract.load(event.address);
  if (!contract) {
    return;
  }
  contract.configAdmin = event.params.admin;
  contract.save();
}
