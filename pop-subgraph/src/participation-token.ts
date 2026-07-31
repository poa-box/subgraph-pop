import { BigInt, Bytes, log, Address, DataSourceContext } from "@graphprotocol/graph-ts";
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
  HatPermission,
  TokenRequest,
  TokenRequestMetadata,
  TokenBalance
} from "../generated/schema";
import { getOrCreateRole, loadExistingUser } from "./utils";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function handleInitialized(event: InitializedEvent): void {
  // Hydrate name + symbol from the freshly initialized token. Graph node
  // permits current-state try_* contract calls on non-archive RPCs; only
  // historical block-pinned reads require archive nodes. Without this,
  // ParticipationTokenContract.{name,symbol} stays as the empty strings
  // seeded by org-deployer.ts and the UI falls back to "Shares" forever.
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
  // executor and hats are set ONLY inside initialize() — there is no ExecutorUpdated/HatsSet
  // event and no setter on ParticipationToken, so they are unreachable from logs. org-deployer.ts
  // seeds both to the zero address with a "will be set by Initialized event" comment describing a
  // mechanism that does not exist; without these two reads they stay zero forever, which is what
  // every live row shows. Same current-state try_* mechanism as name/symbol above, which is
  // already proven in production.
  let executorResult = bound.try_executor();
  if (!executorResult.reverted) {
    contract.executor = executorResult.value;
  }
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
  let permissionId =
    event.address.toHexString() +
    "-" +
    event.params.hat.toString() +
    "-Member";

  let permission = HatPermission.load(permissionId);
  if (!permission) {
    permission = new HatPermission(permissionId);
    permission.contractAddress = event.address;
    permission.contractType = "ParticipationToken";
    permission.organization = contract.organization;
    permission.hatId = event.params.hat;
    permission.permissionRole = "Member";
  }

  // Link to Role entity
  let role = getOrCreateRole(contract.organization, event.params.hat, event);
  permission.role = role.id;

  permission.allowed = event.params.allowed;
  permission.setAt = event.block.timestamp;
  permission.setAtBlock = event.block.number;
  permission.transactionHash = event.transaction.hash;
  permission.save();
}

export function handleApproverHatSet(event: ApproverHatSetEvent): void {
  let contract = ParticipationTokenContract.load(event.address);
  if (!contract) {
    return;
  }

  // Create or update consolidated HatPermission entity with Approver role
  let permissionId =
    event.address.toHexString() +
    "-" +
    event.params.hat.toString() +
    "-Approver";

  let permission = HatPermission.load(permissionId);
  if (!permission) {
    permission = new HatPermission(permissionId);
    permission.contractAddress = event.address;
    permission.contractType = "ParticipationToken";
    permission.organization = contract.organization;
    permission.hatId = event.params.hat;
    permission.permissionRole = "Approver";
  }

  // Link to Role entity
  let role = getOrCreateRole(contract.organization, event.params.hat, event);
  permission.role = role.id;

  permission.allowed = event.params.allowed;
  permission.setAt = event.block.timestamp;
  permission.setAtBlock = event.block.number;
  permission.transactionHash = event.transaction.hash;
  permission.save();
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

  // Set metadata link and create IPFS data source
  // ipfsHash is already a CID string (not bytes32)
  let ipfsCid = event.params.ipfsHash;
  if (ipfsCid.length > 0) {
    tokenRequest.metadata = ipfsCid;

    // TokenRequestMetadata is immutable — skip if already indexed
    let existingMeta = TokenRequestMetadata.load(ipfsCid);
    if (existingMeta == null) {
      let context = new DataSourceContext();
      context.setBigInt("timestamp", event.block.timestamp);

      TokenRequestMetadataTemplate.createWithContext(ipfsCid, context);
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
