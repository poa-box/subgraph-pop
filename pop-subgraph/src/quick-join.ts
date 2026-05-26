import { BigInt, Bytes, log } from "@graphprotocol/graph-ts";
import {
  Initialized as InitializedEvent,
  QuickJoined as QuickJoinedEvent,
  QuickJoinedByMaster as QuickJoinedByMasterEvent,
  ExecutorUpdated as ExecutorUpdatedEvent,
  HatToggled as HatToggledEvent,
  MemberHatIdsUpdated as MemberHatIdsUpdatedEvent,
  AddressesUpdated as AddressesUpdatedEvent,
  UniversalFactoryUpdated as UniversalFactoryUpdatedEvent,
  QuickJoinedWithPasskeyByMaster as QuickJoinedWithPasskeyByMasterEvent,
  RegisterAndQuickJoined as RegisterAndQuickJoinedEvent,
  RegisterAndQuickJoinedWithPasskey as RegisterAndQuickJoinedWithPasskeyEvent,
  RegisterAndQuickJoinedWithPasskeyByMaster as RegisterAndQuickJoinedWithPasskeyByMasterEvent
} from "../generated/templates/QuickJoin/QuickJoin";
import {
  QuickJoinContract,
  HatPermission,
  QuickJoinEvent,
  QuickJoinAddressUpdate,
  PasskeyQuickJoin,
  PasskeyAccount
} from "../generated/schema";
import { createExecutorChange, getOrCreateRole, getOrCreateRoleWearer, createUserOnJoin, recordUserHatChange, shouldCreateRoleWearer } from "./utils";

export function handleInitialized(event: InitializedEvent): void {
  // Initialization is handled by OrgDeployer when the contract is created.
  // Initial values for executor, hatsContract, accountRegistry, masterDeployAddress
  // will be populated by subsequent events (ExecutorUpdated, AddressesUpdated).
  // We avoid contract calls here to support non-archive RPC nodes.
  let contract = QuickJoinContract.load(event.address);
  if (contract == null) {
    log.warning("QuickJoinContract not found at address {}", [
      event.address.toHexString()
    ]);
    return;
  }
  // Just save to mark initialization
  contract.save();
}

export function handleQuickJoined(event: QuickJoinedEvent): void {
  let contractAddress = event.address;
  let joinEventId = contractAddress.toHexString() + "-" + event.transaction.hash.toHexString() + "-" + event.logIndex.toString();

  let joinEvent = new QuickJoinEvent(joinEventId);
  joinEvent.quickJoin = contractAddress;
  joinEvent.user = event.params.user;
  joinEvent.hatIds = event.params.hatIds;
  joinEvent.isMasterDeployJoin = false;
  joinEvent.isRegisterAndJoin = false;
  joinEvent.joinedAt = event.block.timestamp;
  joinEvent.joinedAtBlock = event.block.number;
  joinEvent.transactionHash = event.transaction.hash;

  joinEvent.save();

  // Create RoleWearer entities for each hat (only for user-facing hats to non-system addresses)
  let contract = QuickJoinContract.load(contractAddress);
  if (contract) {
    let user = createUserOnJoin(
      contract.organization,
      event.params.user,
      "QuickJoin",
      event.block.timestamp,
      event.block.number
    );

    if (user) {
      let hatIds = event.params.hatIds;
      for (let i = 0; i < hatIds.length; i++) {
        // Only create RoleWearer for eligible combinations
        if (shouldCreateRoleWearer(contract.organization, hatIds[i], event.params.user)) {
          getOrCreateRoleWearer(contract.organization, hatIds[i], event.params.user, event);
          recordUserHatChange(user, hatIds[i], true, event);
        }
      }
    }
  }
}

export function handleQuickJoinedByMaster(event: QuickJoinedByMasterEvent): void {
  let contractAddress = event.address;
  let joinEventId = contractAddress.toHexString() + "-" + event.transaction.hash.toHexString() + "-" + event.logIndex.toString();

  let joinEvent = new QuickJoinEvent(joinEventId);
  joinEvent.quickJoin = contractAddress;
  joinEvent.user = event.params.user;
  joinEvent.master = event.params.master;
  joinEvent.hatIds = event.params.hatIds;
  joinEvent.isMasterDeployJoin = true;
  joinEvent.isRegisterAndJoin = false;
  joinEvent.joinedAt = event.block.timestamp;
  joinEvent.joinedAtBlock = event.block.number;
  joinEvent.transactionHash = event.transaction.hash;

  joinEvent.save();

  // Create RoleWearer entities for each hat (only for user-facing hats to non-system addresses)
  let contract = QuickJoinContract.load(contractAddress);
  if (contract) {
    let user = createUserOnJoin(
      contract.organization,
      event.params.user,
      "QuickJoin",
      event.block.timestamp,
      event.block.number
    );

    if (user) {
      let hatIds = event.params.hatIds;
      for (let i = 0; i < hatIds.length; i++) {
        // Only create RoleWearer for eligible combinations
        if (shouldCreateRoleWearer(contract.organization, hatIds[i], event.params.user)) {
          getOrCreateRoleWearer(contract.organization, hatIds[i], event.params.user, event);
          recordUserHatChange(user, hatIds[i], true, event);
        }
      }
    }
  }
}

export function handleExecutorUpdated(event: ExecutorUpdatedEvent): void {
  let contract = QuickJoinContract.load(event.address);
  if (contract == null) {
    log.warning("QuickJoinContract not found at address {}", [
      event.address.toHexString()
    ]);
    return;
  }

  contract.executor = event.params.newExecutor;
  contract.save();

  // Create historical record using consolidated ExecutorChange entity
  createExecutorChange(
    event.address,
    "QuickJoin",
    contract.organization,
    event.params.newExecutor,
    event
  );
}

export function handleHatToggled(event: HatToggledEvent): void {
  let contract = QuickJoinContract.load(event.address);
  if (!contract) {
    return;
  }

  // Create or update consolidated HatPermission entity with Member role
  let permissionId =
    event.address.toHexString() +
    "-" +
    event.params.hatId.toString() +
    "-Member";

  let permission = HatPermission.load(permissionId);
  if (!permission) {
    permission = new HatPermission(permissionId);
    permission.contractAddress = event.address;
    permission.contractType = "QuickJoin";
    permission.organization = contract.organization;
    permission.hatId = event.params.hatId;
    permission.permissionRole = "Member";
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

export function handleMemberHatIdsUpdated(event: MemberHatIdsUpdatedEvent): void {
  let contract = QuickJoinContract.load(event.address);
  if (!contract) {
    return;
  }

  let hatIds = event.params.hatIds;

  // Persist the full member-hat list on the contract entity. This is the
  // source of truth for "which hats can be claimed via quickJoinWithUser
  // without vouching" and replaces the on-chain memberHatIds() call the
  // frontend currently makes from useOrgStructure.
  contract.memberHatIds = hatIds;
  contract.save();

  // Update all member hats based on the new list
  for (let i = 0; i < hatIds.length; i++) {
    let hatId = hatIds[i];
    let permissionId =
      event.address.toHexString() +
      "-" +
      hatId.toString() +
      "-Member";

    let permission = HatPermission.load(permissionId);
    if (!permission) {
      permission = new HatPermission(permissionId);
      permission.contractAddress = event.address;
      permission.contractType = "QuickJoin";
      permission.organization = contract.organization;
      permission.hatId = hatId;
      permission.permissionRole = "Member";
      permission.allowed = true; // Assume allowed if in the list
    }

    // Link to Role entity
    let role = getOrCreateRole(contract.organization, hatId, event);
    permission.role = role.id;

    permission.setAt = event.block.timestamp;
    permission.setAtBlock = event.block.number;
    permission.transactionHash = event.transaction.hash;
    permission.save();
  }
}

export function handleAddressesUpdated(event: AddressesUpdatedEvent): void {
  let contract = QuickJoinContract.load(event.address);
  if (contract == null) {
    log.warning("QuickJoinContract not found at address {}", [
      event.address.toHexString()
    ]);
    return;
  }

  contract.hatsContract = event.params.hats;
  contract.accountRegistry = event.params.registry;
  contract.masterDeployAddress = event.params.master;
  contract.save();

  // Create historical record
  let updateId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let update = new QuickJoinAddressUpdate(updateId);
  update.quickJoin = event.address;
  update.hatsContract = event.params.hats;
  update.accountRegistry = event.params.registry;
  update.masterDeployAddress = event.params.master;
  update.updatedAt = event.block.timestamp;
  update.updatedAtBlock = event.block.number;
  update.transactionHash = event.transaction.hash;

  update.save();
}

export function handleUniversalFactoryUpdated(event: UniversalFactoryUpdatedEvent): void {
  let contract = QuickJoinContract.load(event.address);
  if (contract == null) {
    log.warning("QuickJoinContract not found at address {}", [
      event.address.toHexString()
    ]);
    return;
  }

  contract.universalFactory = event.params.universalFactory;
  contract.save();
}

export function handleQuickJoinedWithPasskeyByMaster(event: QuickJoinedWithPasskeyByMasterEvent): void {
  let contractAddress = event.address;
  let contract = QuickJoinContract.load(contractAddress);
  if (!contract) {
    log.warning("QuickJoinContract not found at address {}", [
      contractAddress.toHexString()
    ]);
    return;
  }

  // Create PasskeyQuickJoin event record
  let eventId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let passkeyJoin = new PasskeyQuickJoin(eventId);
  passkeyJoin.quickJoinContract = contractAddress;
  passkeyJoin.master = event.params.master;
  passkeyJoin.credentialId = event.params.credentialId;
  passkeyJoin.hatIds = event.params.hatIds;
  passkeyJoin.timestamp = event.block.timestamp;
  passkeyJoin.blockNumber = event.block.number;
  passkeyJoin.transactionHash = event.transaction.hash;

  // Link to PasskeyAccount - account should be created by PasskeyAccountFactory in the same transaction
  passkeyJoin.account = event.params.account;
  passkeyJoin.save();

  // Create User and RoleWearer entities for the passkey account
  let user = createUserOnJoin(
    contract.organization,
    event.params.account,
    "QuickJoinWithPasskey",
    event.block.timestamp,
    event.block.number
  );

  if (user) {
    let hatIds = event.params.hatIds;
    for (let i = 0; i < hatIds.length; i++) {
      if (shouldCreateRoleWearer(contract.organization, hatIds[i], event.params.account)) {
        getOrCreateRoleWearer(contract.organization, hatIds[i], event.params.account, event);
        recordUserHatChange(user, hatIds[i], true, event);
      }
    }
  }
}

export function handleRegisterAndQuickJoined(event: RegisterAndQuickJoinedEvent): void {
  let contractAddress = event.address;
  let joinEventId = contractAddress.toHexString() + "-" + event.transaction.hash.toHexString() + "-" + event.logIndex.toString();

  let joinEvent = new QuickJoinEvent(joinEventId);
  joinEvent.quickJoin = contractAddress;
  joinEvent.user = event.params.user;
  joinEvent.hatIds = event.params.hatIds;
  joinEvent.isMasterDeployJoin = false;
  joinEvent.isRegisterAndJoin = true;
  joinEvent.username = event.params.username;
  joinEvent.joinedAt = event.block.timestamp;
  joinEvent.joinedAtBlock = event.block.number;
  joinEvent.transactionHash = event.transaction.hash;

  joinEvent.save();

  // Create RoleWearer entities for each hat
  let contract = QuickJoinContract.load(contractAddress);
  if (contract) {
    let user = createUserOnJoin(
      contract.organization,
      event.params.user,
      "QuickJoin",
      event.block.timestamp,
      event.block.number
    );

    if (user) {
      let hatIds = event.params.hatIds;
      for (let i = 0; i < hatIds.length; i++) {
        if (shouldCreateRoleWearer(contract.organization, hatIds[i], event.params.user)) {
          getOrCreateRoleWearer(contract.organization, hatIds[i], event.params.user, event);
          recordUserHatChange(user, hatIds[i], true, event);
        }
      }
    }
  }
}

export function handleRegisterAndQuickJoinedWithPasskey(event: RegisterAndQuickJoinedWithPasskeyEvent): void {
  let contractAddress = event.address;
  let contract = QuickJoinContract.load(contractAddress);
  if (!contract) {
    log.warning("QuickJoinContract not found at address {}", [
      contractAddress.toHexString()
    ]);
    return;
  }

  let eventId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let passkeyJoin = new PasskeyQuickJoin(eventId);
  passkeyJoin.quickJoinContract = contractAddress;
  passkeyJoin.credentialId = event.params.credentialId;
  passkeyJoin.hatIds = event.params.hatIds;
  passkeyJoin.username = event.params.username;
  passkeyJoin.timestamp = event.block.timestamp;
  passkeyJoin.blockNumber = event.block.number;
  passkeyJoin.transactionHash = event.transaction.hash;
  passkeyJoin.account = event.params.account;
  passkeyJoin.save();

  let user = createUserOnJoin(
    contract.organization,
    event.params.account,
    "QuickJoinWithPasskey",
    event.block.timestamp,
    event.block.number
  );

  if (user) {
    let hatIds = event.params.hatIds;
    for (let i = 0; i < hatIds.length; i++) {
      if (shouldCreateRoleWearer(contract.organization, hatIds[i], event.params.account)) {
        getOrCreateRoleWearer(contract.organization, hatIds[i], event.params.account, event);
        recordUserHatChange(user, hatIds[i], true, event);
      }
    }
  }
}

export function handleRegisterAndQuickJoinedWithPasskeyByMaster(event: RegisterAndQuickJoinedWithPasskeyByMasterEvent): void {
  let contractAddress = event.address;
  let contract = QuickJoinContract.load(contractAddress);
  if (!contract) {
    log.warning("QuickJoinContract not found at address {}", [
      contractAddress.toHexString()
    ]);
    return;
  }

  let eventId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let passkeyJoin = new PasskeyQuickJoin(eventId);
  passkeyJoin.quickJoinContract = contractAddress;
  passkeyJoin.master = event.params.master;
  passkeyJoin.credentialId = event.params.credentialId;
  passkeyJoin.hatIds = event.params.hatIds;
  passkeyJoin.username = event.params.username;
  passkeyJoin.timestamp = event.block.timestamp;
  passkeyJoin.blockNumber = event.block.number;
  passkeyJoin.transactionHash = event.transaction.hash;
  passkeyJoin.account = event.params.account;
  passkeyJoin.save();

  let user = createUserOnJoin(
    contract.organization,
    event.params.account,
    "QuickJoinWithPasskey",
    event.block.timestamp,
    event.block.number
  );

  if (user) {
    let hatIds = event.params.hatIds;
    for (let i = 0; i < hatIds.length; i++) {
      if (shouldCreateRoleWearer(contract.organization, hatIds[i], event.params.account)) {
        getOrCreateRoleWearer(contract.organization, hatIds[i], event.params.account, event);
        recordUserHatChange(user, hatIds[i], true, event);
      }
    }
  }
}
