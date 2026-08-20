import { Address, BigInt, Bytes, DataSourceContext } from "@graphprotocol/graph-ts";
import {
  Initialized as InitializedEvent,
  UserRegistered as UserRegisteredEvent,
  UsernameChanged as UsernameChangedEvent,
  UserDeleted as UserDeletedEvent,
  BatchRegistered as BatchRegisteredEvent,
  OwnershipTransferred as OwnershipTransferredEvent,
  PasskeyFactoryUpdated as PasskeyFactoryUpdatedEvent,
  ProfileMetadataUpdated as ProfileMetadataUpdatedEvent
} from "../generated/templates/UniversalAccountRegistry/UniversalAccountRegistry";
import {
  UniversalAccountRegistry,
  Account,
  AccountMetadata,
  UsernameChange,
  AccountDeletion,
  BatchRegistration,
  RegistryOwnershipTransfer
} from "../generated/schema";
import { AccountMetadata as AccountMetadataTemplate } from "../generated/templates";

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

export function handleInitialized(event: InitializedEvent): void {
  let contractAddress = event.address;

  // Create or load registry entity (singleton)
  let registry = UniversalAccountRegistry.load(contractAddress);
  if (!registry) {
    registry = new UniversalAccountRegistry(contractAddress);
    registry.owner = Address.zero(); // Will be set by first OwnershipTransferred event
    registry.totalAccounts = BigInt.fromI32(0);
    registry.createdAt = event.block.timestamp;
    registry.createdAtBlock = event.block.number;
    registry.save();
  }
}

export function handleUserRegistered(event: UserRegisteredEvent): void {
  let contractAddress = event.address;
  let userAddress = event.params.user;
  let username = event.params.username;

  // Load or create registry
  let registry = UniversalAccountRegistry.load(contractAddress);
  if (!registry) {
    registry = new UniversalAccountRegistry(contractAddress);
    registry.owner = Address.zero();
    registry.totalAccounts = BigInt.fromI32(0);
    registry.createdAt = event.block.timestamp;
    registry.createdAtBlock = event.block.number;
  }

  // Check if account already exists (same user on another chain)
  let account = Account.load(userAddress);
  if (account) {
    // Account already exists — don't overwrite canonical name or re-increment
    registry.save();

    // Still create the change record for audit trail
    let changeId = event.transaction.hash.concatI32(event.logIndex.toI32());
    let change = new UsernameChange(changeId);
    change.registry = contractAddress;
    change.account = userAddress;
    change.user = userAddress;
    change.newUsername = username;
    change.changedAt = event.block.timestamp;
    change.changedAtBlock = event.block.number;
    change.transactionHash = event.transaction.hash;
    change.save();
    return;
  }

  // Create new account
  account = new Account(userAddress);
  account.registry = contractAddress;
  account.user = userAddress;
  account.username = username;
  account.isDeleted = false;
  account.registeredAt = event.block.timestamp;
  account.registeredAtBlock = event.block.number;
  account.lastUpdatedAt = event.block.timestamp;
  account.save();

  // Increment total accounts
  registry.totalAccounts = registry.totalAccounts.plus(BigInt.fromI32(1));
  registry.save();

  // Create username change record (for registration, oldUsername is null)
  let changeId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let change = new UsernameChange(changeId);

  change.registry = contractAddress;
  change.account = userAddress;
  change.user = userAddress;
  change.newUsername = username;
  change.changedAt = event.block.timestamp;
  change.changedAtBlock = event.block.number;
  change.transactionHash = event.transaction.hash;

  change.save();
}

export function handleUsernameChanged(event: UsernameChangedEvent): void {
  let contractAddress = event.address;
  let userAddress = event.params.user;
  let newUsername = event.params.newUsername;

  // `username` is String! and the generated getter THROWS on a missing value, so the previous
  // username may only be read on the branch where the account already existed.
  let oldUsername: string | null = null;
  let account = Account.load(userAddress);
  if (!account) {
    // Account should exist, but create if not found; there is no prior username to record.
    account = new Account(userAddress);
    account.registry = contractAddress;
    account.user = userAddress;
    account.isDeleted = false;
    account.registeredAt = event.block.timestamp;
    account.registeredAtBlock = event.block.number;
  } else {
    oldUsername = account.username;
  }

  account.username = newUsername;
  account.lastUpdatedAt = event.block.timestamp;
  account.save();

  // Create username change record
  let changeId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let change = new UsernameChange(changeId);

  change.registry = contractAddress;
  change.account = userAddress;
  change.user = userAddress;
  change.oldUsername = oldUsername;
  change.newUsername = newUsername;
  change.changedAt = event.block.timestamp;
  change.changedAtBlock = event.block.number;
  change.transactionHash = event.transaction.hash;

  change.save();
}

export function handleUserDeleted(event: UserDeletedEvent): void {
  let contractAddress = event.address;
  let userAddress = event.params.user;
  let oldUsername = event.params.oldUsername;

  // Load registry
  let registry = UniversalAccountRegistry.load(contractAddress);
  if (registry) {
    // Decrement total accounts
    registry.totalAccounts = registry.totalAccounts.minus(BigInt.fromI32(1));
    registry.save();
  }

  // Update account
  let account = Account.load(userAddress);
  if (account) {
    account.isDeleted = true;
    account.deletedAt = event.block.timestamp;
    account.deletedAtBlock = event.block.number;
    account.lastUpdatedAt = event.block.timestamp;
    account.save();
  }

  // Create account deletion record
  let deletionId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let deletion = new AccountDeletion(deletionId);

  deletion.registry = contractAddress;
  deletion.user = userAddress;
  deletion.username = oldUsername;
  deletion.deletedAt = event.block.timestamp;
  deletion.deletedAtBlock = event.block.number;
  deletion.transactionHash = event.transaction.hash;

  deletion.save();
}

export function handleBatchRegistered(event: BatchRegisteredEvent): void {
  let contractAddress = event.address;
  let count = event.params.count;

  // Update registry total accounts
  let registry = UniversalAccountRegistry.load(contractAddress);
  if (registry) {
    registry.totalAccounts = registry.totalAccounts.plus(count);
    registry.save();
  }

  // Create batch registration record
  let batchId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let batch = new BatchRegistration(batchId);

  batch.registry = contractAddress;
  batch.count = count;
  batch.registeredAt = event.block.timestamp;
  batch.registeredAtBlock = event.block.number;
  batch.transactionHash = event.transaction.hash;

  batch.save();
}

export function handleOwnershipTransferred(event: OwnershipTransferredEvent): void {
  let contractAddress = event.address;

  // Update registry owner
  let registry = UniversalAccountRegistry.load(contractAddress);
  if (registry) {
    registry.owner = event.params.newOwner;
    registry.save();
  }

  // Create ownership transfer record
  let transferId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let transfer = new RegistryOwnershipTransfer(transferId);

  transfer.registry = contractAddress;
  transfer.previousOwner = event.params.previousOwner;
  transfer.newOwner = event.params.newOwner;
  transfer.transferredAt = event.block.timestamp;
  transfer.transferredAtBlock = event.block.number;
  transfer.transactionHash = event.transaction.hash;

  transfer.save();
}

export function handlePasskeyFactoryUpdated(event: PasskeyFactoryUpdatedEvent): void {
  let registry = UniversalAccountRegistry.load(event.address);
  if (registry) {
    registry.passkeyFactory = event.params.factory;
    registry.save();
  }
}

/**
 * AccountMetadata entity id, scoped by the owning account (the row carries an `account` pointer, so
 * two accounts with identical profile JSON would otherwise cross-link). Must match
 * account-metadata.ts.
 */
export function accountMetadataId(userAddress: Bytes, ipfsCid: string): string {
  return userAddress.toHexString() + "-" + ipfsCid;
}

export function handleProfileMetadataUpdated(event: ProfileMetadataUpdatedEvent): void {
  let userAddress = event.params.user;
  let metadataHash = event.params.metadataHash;

  let account = Account.load(userAddress);
  if (!account) {
    return;
  }

  // Store raw hash on Account
  account.profileMetadataHash = metadataHash;
  account.lastUpdatedAt = event.block.timestamp;

  // Skip IPFS fetch for zero hash (clear profile)
  let zeroHash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000");
  if (metadataHash.equals(zeroHash)) {
    account.profileMetadataHash = null;
    account.metadata = null;
    account.save();
    return;
  }

  // Convert bytes32 sha256 digest to IPFS CIDv0
  let ipfsCid = bytes32ToCid(metadataHash);

  // Link Account to AccountMetadata. Account-scoped id, not the bare CID — see accountMetadataId.
  account.metadata = accountMetadataId(userAddress, ipfsCid);
  account.save();

  // Same-region safety net only; cross-block dedup is graph-node's (template, CID, context) key.
  let existingMeta = AccountMetadata.load(accountMetadataId(userAddress, ipfsCid));
  if (existingMeta == null) {
    let context = new DataSourceContext();
    context.setBytes("userAddress", userAddress);
    AccountMetadataTemplate.createWithContext(ipfsCid, context);
  }
}
