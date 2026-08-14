import { BigInt, Bytes, log, Address } from "@graphprotocol/graph-ts";
import { TokenRequestMetadata as TokenRequestMetadataTemplate } from "../generated/templates";
import {
  ParticipationToken as ParticipationTokenAbi,
  Initialized as InitializedEvent,
  Transfer as TransferEvent,
  MemberHatSet as MemberHatSetEvent,
  ApproverHatSet as ApproverHatSetEvent,
  Requested as RequestedEvent,
  RequestApproved as RequestApprovedEvent,
  RequestCancelled as RequestCancelledEvent,
  TaskManagerSet as TaskManagerSetEvent,
  EducationHubSet as EducationHubSetEvent,
  NameSet as NameSetEvent,
  SymbolSet as SymbolSetEvent
} from "../generated/templates/ParticipationToken/ParticipationToken";
import {
  ParticipationTokenContract,
  TokenRequest,
  TokenRequestMetadata,
  TokenBalance
} from "../generated/schema";
import { createHatPermission, getUsernameForAddress, loadExistingUser } from "./utils";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function handleInitialized(event: InitializedEvent): void {
  // Hydrate name + symbol; otherwise they stay as the empty strings org-deployer.ts seeds and the
  // UI shows "Shares" forever.
  //
  // graph-node pins every mapping eth_call to the indexed block via EIP-1898, so this needs an
  // archive RPC. The try_ guards make an inadequate endpoint fail silently — see readme.md.
  let contract = ParticipationTokenContract.load(event.address);
  if (contract == null) {
    log.warning("ParticipationTokenContract not found at address {}", [
      event.address.toHexString()
    ]);
    return;
  }
  let bound = ParticipationTokenAbi.bind(event.address);
  let nameResult = bound.try_name();
  if (!nameResult.reverted) {
    contract.name = nameResult.value;
  }
  let symbolResult = bound.try_symbol();
  if (!symbolResult.reverted) {
    contract.symbol = symbolResult.value;
  }
  // hats has no event and no setter, so this read is its only source. executor is deliberately NOT
  // read: OrgDeployed carries it, org-deployer.ts already seeds it, and it is immutable.
  let hatsResult = bound.try_hats();
  if (!hatsResult.reverted) {
    contract.hatsContract = hatsResult.value;
  }
  contract.save();
}

export function handleTransfer(event: TransferEvent): void {
  let contractAddress = event.address;
  let amount = event.params.value;
  let fromAddress = event.params.from;
  let toAddress = event.params.to;

  // Load contract to update total supply
  let contract = ParticipationTokenContract.load(contractAddress);

  // Update sender balance (if not zero address - zero address means mint)
  if (fromAddress.toHexString() != ZERO_ADDRESS) {
    let fromBalanceId = contractAddress.toHexString() + "-" + fromAddress.toHexString();
    let fromBalance = TokenBalance.load(fromBalanceId);

    if (fromBalance == null) {
      fromBalance = new TokenBalance(fromBalanceId);
      fromBalance.participationToken = contractAddress;
      fromBalance.account = fromAddress;
      fromBalance.balance = BigInt.fromI32(0);
    }

    // Decrease sender balance
    fromBalance.balance = fromBalance.balance.minus(amount);
    fromBalance.updatedAt = event.block.timestamp;
    fromBalance.updatedAtBlock = event.block.number;
    fromBalance.save();

    // Update User.participationTokenBalance for sender
    if (contract != null) {
      let fromUser = loadExistingUser(
        contract.organization,
        fromAddress,
        event.block.timestamp,
        event.block.number
      );
      if (fromUser) {
        fromUser.participationTokenBalance = fromUser.participationTokenBalance.minus(amount);
        fromUser.save();
      }
    }
  } else {
    // This is a mint - increase total supply
    if (contract != null) {
      contract.totalSupply = contract.totalSupply.plus(amount);
    }
  }

  // Update receiver balance (if not zero address - zero address means burn)
  if (toAddress.toHexString() != ZERO_ADDRESS) {
    let toBalanceId = contractAddress.toHexString() + "-" + toAddress.toHexString();
    let toBalance = TokenBalance.load(toBalanceId);

    if (toBalance == null) {
      toBalance = new TokenBalance(toBalanceId);
      toBalance.participationToken = contractAddress;
      toBalance.account = toAddress;
      toBalance.balance = BigInt.fromI32(0);
    }

    // Increase receiver balance
    toBalance.balance = toBalance.balance.plus(amount);
    toBalance.updatedAt = event.block.timestamp;
    toBalance.updatedAtBlock = event.block.number;
    toBalance.save();

    // Update User.participationTokenBalance for receiver
    if (contract != null) {
      let toUser = loadExistingUser(
        contract.organization,
        toAddress,
        event.block.timestamp,
        event.block.number
      );
      if (toUser) {
        toUser.participationTokenBalance = toUser.participationTokenBalance.plus(amount);
        toUser.save();
      }
    }
  } else {
    // This is a burn - decrease total supply
    if (contract != null) {
      contract.totalSupply = contract.totalSupply.minus(amount);
    }
  }

  // Save contract if it exists
  if (contract != null) {
    contract.save();
  }
}

export function handleMemberHatSet(event: MemberHatSetEvent): void {
  let contract = ParticipationTokenContract.load(event.address);
  if (!contract) {
    return;
  }

  // Create or update consolidated HatPermission entity with Member role
  createHatPermission(
    event.address,
    "ParticipationToken",
    contract.organization,
    event.params.hat,
    "Member",
    event.params.allowed,
    0,
    false, // ParticipationToken permissions carry no hatType
    event
  );
}

export function handleApproverHatSet(event: ApproverHatSetEvent): void {
  let contract = ParticipationTokenContract.load(event.address);
  if (!contract) {
    return;
  }

  // Create or update consolidated HatPermission entity with Approver role
  createHatPermission(
    event.address,
    "ParticipationToken",
    contract.organization,
    event.params.hat,
    "Approver",
    event.params.allowed,
    0,
    false, // ParticipationToken permissions carry no hatType
    event
  );
}

/**
 * Normalise a caller-supplied IPFS string to the canonical path graph-node will hand back via
 * dataSource.stringParam(): trim surrounding whitespace and slashes, then strip an `ipfs://` or
 * `ipfs/` prefix. Returns "" for anything that is not a plausible CID, so a junk string neither
 * spawns a file data source nor writes a dangling TokenRequest.metadata pointer.
 *
 * Deliberately conservative — it does not re-encode CIDv1 between bases (graph-node does, and
 * AssemblyScript has no multibase decoder here). The frontend writes CIDv0, which round-trips
 * unchanged, so this covers every case the protocol actually produces.
 */
function normalizeCid(raw: string): string {
  let s = raw.trim();

  // strip a leading "ipfs://" or "/ipfs/" (in either order of slash trimming)
  if (s.length > 7 && s.substring(0, 7) == "ipfs://") {
    s = s.substring(7);
  }
  while (s.length > 0 && s.charAt(0) == "/") {
    s = s.substring(1);
  }
  if (s.length > 5 && s.substring(0, 5) == "ipfs/") {
    s = s.substring(5);
  }
  while (s.length > 0 && s.charAt(s.length - 1) == "/") {
    s = s.substring(0, s.length - 1);
  }

  // CIDv0 ("Qm..." base58, 46 chars) or CIDv1 ("bafy..." base32). Anything else is not addressable
  // and would only produce a permanently unresolved file data source.
  if (s.length == 46 && s.substring(0, 2) == "Qm") {
    return s;
  }
  if (s.length > 4 && s.substring(0, 4) == "bafy") {
    return s;
  }
  return "";
}

export function handleRequested(event: RequestedEvent): void {
  let contractAddress = event.address;
  let requestId = event.params.id;

  let tokenRequestId = contractAddress.toHexString() + "-" + requestId.toString();
  let tokenRequest = new TokenRequest(tokenRequestId);

  tokenRequest.requestId = requestId;
  tokenRequest.participationToken = contractAddress;
  tokenRequest.requester = event.params.requester;
  tokenRequest.amount = event.params.amount;
  tokenRequest.ipfsHash = event.params.ipfsHash;
  tokenRequest.status = "Pending";
  tokenRequest.createdAt = event.block.timestamp;
  tokenRequest.createdAtBlock = event.block.number;
  tokenRequest.transactionHash = event.transaction.hash;

  // Link the requester so User.tokenRequests resolves (it returned [] for every member because
  // these two fields were never written) and keep the denormalised username in step with every
  // sibling entity. loadExistingUser respects the "no phantom users" rule: it returns null for a
  // requester who never joined, in which case the row simply keeps the raw address.
  tokenRequest.requesterUsername = getUsernameForAddress(event.params.requester);
  let ptContract = ParticipationTokenContract.load(contractAddress);
  if (ptContract) {
    let requester = loadExistingUser(
      ptContract.organization,
      event.params.requester,
      event.block.timestamp,
      event.block.number
    );
    if (requester) {
      tokenRequest.requesterUser = requester.id;
      requester.totalTokenRequestsAmount = requester.totalTokenRequestsAmount.plus(
        event.params.amount
      );
      requester.save();
    }
  }

  // Set metadata link and create IPFS data source.
  //
  // Unique among this subgraph's metadata sites: requestTokens(uint96, string ipfsHash) takes a
  // caller-supplied STRING and only checks it is non-empty, so it is not canonical by construction
  // the way a bytes32ToCid() digest is. graph-node normalises the path before the file handler sees
  // it (trims, strips an `ipfs://` or `/ipfs/` prefix, re-encodes the CID), so dataSource
  // .stringParam() returns the CANONICAL form. Storing the raw string here would leave
  // TokenRequest.metadata pointing at an id the file handler never writes, dangling forever.
  // Normalise once and key both sides off the same value.
  let ipfsCid = normalizeCid(event.params.ipfsHash);
  if (ipfsCid.length > 0) {
    tokenRequest.metadata = ipfsCid;

    // No context: this entity writes no owner pointer, so the bare CID is a safe key and an empty
    // context lets graph-node dedupe repeat references. See the file data source context rule in
    // CLAUDE.md — a per-block value here double-INSERTs this immutable id and halts indexing.
    let existingMeta = TokenRequestMetadata.load(ipfsCid);
    if (existingMeta == null) {
      TokenRequestMetadataTemplate.create(ipfsCid);
    }
  }

  tokenRequest.save();
}

export function handleRequestApproved(event: RequestApprovedEvent): void {
  let contractAddress = event.address;
  let requestId = event.params.id;

  let tokenRequestId = contractAddress.toHexString() + "-" + requestId.toString();
  let tokenRequest = TokenRequest.load(tokenRequestId);

  if (tokenRequest == null) {
    log.warning("TokenRequest not found for id {}", [tokenRequestId]);
    return;
  }

  tokenRequest.status = "Approved";
  tokenRequest.approver = event.params.approver;
  tokenRequest.approvedAt = event.block.timestamp;
  tokenRequest.approvedAtBlock = event.block.number;

  // Link the approver so User.approvedTokenRequests resolves.
  tokenRequest.approverUsername = getUsernameForAddress(event.params.approver);
  let approverContract = ParticipationTokenContract.load(contractAddress);
  if (approverContract) {
    let approver = loadExistingUser(
      approverContract.organization,
      event.params.approver,
      event.block.timestamp,
      event.block.number
    );
    if (approver) {
      tokenRequest.approverUser = approver.id;
    }
  }

  tokenRequest.save();
}

export function handleRequestCancelled(event: RequestCancelledEvent): void {
  let contractAddress = event.address;
  let requestId = event.params.id;

  let tokenRequestId = contractAddress.toHexString() + "-" + requestId.toString();
  let tokenRequest = TokenRequest.load(tokenRequestId);

  if (tokenRequest == null) {
    log.warning("TokenRequest not found for id {}", [tokenRequestId]);
    return;
  }

  tokenRequest.status = "Cancelled";
  tokenRequest.cancelledAt = event.block.timestamp;
  tokenRequest.cancelledAtBlock = event.block.number;

  tokenRequest.save();
}

export function handleTaskManagerSet(event: TaskManagerSetEvent): void {
  let contract = ParticipationTokenContract.load(event.address);
  if (contract == null) {
    log.warning("ParticipationTokenContract not found at address {}", [
      event.address.toHexString()
    ]);
    return;
  }

  contract.taskManagerAddress = event.params.taskManager;
  contract.save();
}

export function handleEducationHubSet(event: EducationHubSetEvent): void {
  let contract = ParticipationTokenContract.load(event.address);
  if (contract == null) {
    log.warning("ParticipationTokenContract not found at address {}", [
      event.address.toHexString()
    ]);
    return;
  }

  contract.educationHubAddress = event.params.educationHub;
  contract.save();
}

export function handleNameSet(event: NameSetEvent): void {
  let contract = ParticipationTokenContract.load(event.address);
  if (contract == null) {
    log.warning("ParticipationTokenContract not found at address {}", [
      event.address.toHexString()
    ]);
    return;
  }
  contract.name = event.params.newName;
  contract.save();
}

export function handleSymbolSet(event: SymbolSetEvent): void {
  let contract = ParticipationTokenContract.load(event.address);
  if (contract == null) {
    log.warning("ParticipationTokenContract not found at address {}", [
      event.address.toHexString()
    ]);
    return;
  }
  contract.symbol = event.params.newSymbol;
  contract.save();
}
