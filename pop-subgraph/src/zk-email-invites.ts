import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  DomainRuleSet as DomainRuleSetEvent,
  DomainRuleRemoved as DomainRuleRemovedEvent,
  EmailRuleSet as EmailRuleSetEvent,
  EmailRuleRemoved as EmailRuleRemovedEvent,
  RoleClaimedByDomain as RoleClaimedByDomainEvent,
  RoleClaimedByEmail as RoleClaimedByEmailEvent,
  RegisteredAndClaimedByDomain as RegisteredAndClaimedByDomainEvent,
  RegisteredAndClaimedByEmail as RegisteredAndClaimedByEmailEvent,
  VerifierUpdated as VerifierUpdatedEvent,
  DKIMRegistryUpdated as DKIMRegistryUpdatedEvent,
  AccountRegistryUpdated as AccountRegistryUpdatedEvent,
  UniversalFactoryUpdated as UniversalFactoryUpdatedEvent
} from "../generated/templates/ZkEmailInvites/ZkEmailInvites";
import { ZkEmailInvitesContract, ZkEmailDomainRule, ZkEmailEmailRule, ZkEmailRoleClaim } from "../generated/schema";
import { getUsernameForAddress, loadExistingUser } from "./utils";

// ─────────────────────────── id helpers ───────────────────────────

function domainRuleId(contract: Address, domainHash: Bytes): string {
  return contract.toHexString() + "-" + domainHash.toHexString();
}

function emailRuleId(contract: Address, accountSalt: Bytes): string {
  return contract.toHexString() + "-" + accountSalt.toHexString();
}

// ─────────────────────────── rule handlers ───────────────────────────

export function handleDomainRuleSet(event: DomainRuleSetEvent): void {
  let module = ZkEmailInvitesContract.load(event.address);
  if (module == null) return; // template exists ⇒ entity exists; defensive guard
  let id = domainRuleId(event.address, event.params.domainHash);
  let rule = ZkEmailDomainRule.load(id);
  if (rule == null) {
    rule = new ZkEmailDomainRule(id);
    rule.zkEmailInvites = event.address;
    rule.organization = module.organization;
    rule.domainHash = event.params.domainHash;
    rule.createdAt = event.block.timestamp;
    rule.createdAtBlock = event.block.number;
  } else {
    rule.updatedAt = event.block.timestamp;
    rule.updatedAtBlock = event.block.number;
  }
  rule.hatIds = event.params.hatIds;
  rule.expiry = event.params.expiry;
  rule.active = true;
  rule.removedAt = null;
  rule.removedAtBlock = null;
  rule.transactionHash = event.transaction.hash;
  rule.save();
}

export function handleDomainRuleRemoved(event: DomainRuleRemovedEvent): void {
  let id = domainRuleId(event.address, event.params.domainHash);
  let rule = ZkEmailDomainRule.load(id);
  if (rule == null) return;
  rule.active = false;
  rule.removedAt = event.block.timestamp;
  rule.removedAtBlock = event.block.number;
  rule.transactionHash = event.transaction.hash;
  rule.save();
}

export function handleEmailRuleSet(event: EmailRuleSetEvent): void {
  let module = ZkEmailInvitesContract.load(event.address);
  if (module == null) return;
  let id = emailRuleId(event.address, event.params.accountSalt);
  let rule = ZkEmailEmailRule.load(id);
  if (rule == null) {
    rule = new ZkEmailEmailRule(id);
    rule.zkEmailInvites = event.address;
    rule.organization = module.organization;
    rule.accountSalt = event.params.accountSalt;
    rule.createdAt = event.block.timestamp;
    rule.createdAtBlock = event.block.number;
  } else {
    rule.updatedAt = event.block.timestamp;
    rule.updatedAtBlock = event.block.number;
  }
  rule.hatIds = event.params.hatIds;
  rule.expiry = event.params.expiry;
  rule.active = true;
  rule.removedAt = null;
  rule.removedAtBlock = null;
  rule.transactionHash = event.transaction.hash;
  rule.save();
}

export function handleEmailRuleRemoved(event: EmailRuleRemovedEvent): void {
  let id = emailRuleId(event.address, event.params.accountSalt);
  let rule = ZkEmailEmailRule.load(id);
  if (rule == null) return;
  rule.active = false;
  rule.removedAt = event.block.timestamp;
  rule.removedAtBlock = event.block.number;
  rule.transactionHash = event.transaction.hash;
  rule.save();
}

// ─────────────────────────── claim handlers ───────────────────────────

function createClaim(
  module: Address,
  txHash: Bytes,
  logIndex: BigInt,
  ts: BigInt,
  block: BigInt,
  claimer: Address,
  kind: string,
  domainHash: Bytes | null,
  accountSalt: Bytes | null,
  hatIds: BigInt[],
  nullifier: Bytes | null,
  viaPasskey: boolean,
  username: string | null,
  credentialId: Bytes | null
): void {
  let contract = ZkEmailInvitesContract.load(module);
  if (contract == null) return; // template exists ⇒ entity exists; defensive guard

  let id = txHash.concatI32(logIndex.toI32());
  let claim = new ZkEmailRoleClaim(id);
  claim.zkEmailInvites = module;
  claim.organization = contract.organization;
  claim.claimer = claimer;
  claim.kind = kind;
  claim.domainHash = domainHash;
  claim.accountSalt = accountSalt;
  claim.hatIds = hatIds;
  claim.nullifier = nullifier;
  claim.viaPasskeyRegistration = viaPasskey;
  claim.username = username;
  claim.credentialId = credentialId;
  claim.claimedAt = ts;
  claim.claimedAtBlock = block;
  claim.transactionHash = txHash;

  // Best-effort link to the org's User (created by join/claim handlers elsewhere).
  claim.claimerUsername = getUsernameForAddress(claimer);
  let user = loadExistingUser(contract.organization, claimer, ts, block);
  if (user != null) {
    claim.claimerUser = user.id;
  }

  claim.save();
}

export function handleRoleClaimedByDomain(event: RoleClaimedByDomainEvent): void {
  createClaim(
    event.address,
    event.transaction.hash,
    event.logIndex,
    event.block.timestamp,
    event.block.number,
    event.params.claimer,
    "Domain",
    event.params.domainHash,
    null,
    event.params.hatIds,
    event.params.nullifier,
    false,
    null,
    null
  );
}

export function handleRoleClaimedByEmail(event: RoleClaimedByEmailEvent): void {
  createClaim(
    event.address,
    event.transaction.hash,
    event.logIndex,
    event.block.timestamp,
    event.block.number,
    event.params.claimer,
    "Email",
    null,
    event.params.accountSalt,
    event.params.hatIds,
    event.params.nullifier,
    false,
    null,
    null
  );
}

export function handleRegisteredAndClaimedByDomain(event: RegisteredAndClaimedByDomainEvent): void {
  createClaim(
    event.address,
    event.transaction.hash,
    event.logIndex,
    event.block.timestamp,
    event.block.number,
    event.params.account,
    "Domain",
    event.params.domainHash,
    null,
    event.params.hatIds,
    null,
    true,
    event.params.username,
    event.params.credentialId
  );
}

export function handleRegisteredAndClaimedByEmail(event: RegisteredAndClaimedByEmailEvent): void {
  createClaim(
    event.address,
    event.transaction.hash,
    event.logIndex,
    event.block.timestamp,
    event.block.number,
    event.params.account,
    "Email",
    null,
    event.params.accountSalt,
    event.params.hatIds,
    null,
    true,
    event.params.username,
    event.params.credentialId
  );
}

// ─────────────────────────── config handlers ───────────────────────────

export function handleVerifierUpdated(event: VerifierUpdatedEvent): void {
  let module = ZkEmailInvitesContract.load(event.address);
  if (module == null) return;
  module.verifier = event.params.verifier;
  module.lastUpdatedAt = event.block.timestamp;
  module.save();
}

export function handleDKIMRegistryUpdated(event: DKIMRegistryUpdatedEvent): void {
  let module = ZkEmailInvitesContract.load(event.address);
  if (module == null) return;
  module.dkimRegistry = event.params.registry;
  module.lastUpdatedAt = event.block.timestamp;
  module.save();
}

export function handleAccountRegistryUpdated(event: AccountRegistryUpdatedEvent): void {
  let module = ZkEmailInvitesContract.load(event.address);
  if (module == null) return;
  module.accountRegistry = event.params.registry;
  module.lastUpdatedAt = event.block.timestamp;
  module.save();
}

export function handleUniversalFactoryUpdated(event: UniversalFactoryUpdatedEvent): void {
  let module = ZkEmailInvitesContract.load(event.address);
  if (module == null) return;
  module.universalFactory = event.params.factory;
  module.lastUpdatedAt = event.block.timestamp;
  module.save();
}
