import { Address, BigInt, Bytes, DataSourceContext, log } from "@graphprotocol/graph-ts";
import { HatMetadata as HatMetadataTemplate } from "../generated/templates";
import {
  EligibilityModuleInitialized as EligibilityModuleInitializedEvent,
  HatCreatedWithEligibility as HatCreatedWithEligibilityEvent,
  WearerEligibilityUpdated as WearerEligibilityUpdatedEvent,
  BulkWearerEligibilityUpdated as BulkWearerEligibilityUpdatedEvent,
  DefaultEligibilityUpdated as DefaultEligibilityUpdatedEvent,
  VouchConfigSet as VouchConfigSetEvent,
  Vouched as VouchedEvent,
  VouchRevoked as VouchRevokedEvent,
  HatClaimed as HatClaimedEvent,
  HatMetadataUpdated as HatMetadataUpdatedEvent,
  UserJoinTimeSet as UserJoinTimeSetEvent,
  EligibilityModuleAdminHatSet as EligibilityModuleAdminHatSetEvent,
  GovernanceAdminSet as GovernanceAdminSetEvent,
  SuperAdminTransferred as SuperAdminTransferredEvent,
  Paused as PausedEvent,
  Unpaused as UnpausedEvent,
  VouchingRateLimitExceededEvent as VouchingRateLimitExceededEventEvent,
  NewUserVouchingRestrictedEvent as NewUserVouchingRestrictedEventEvent,
  RoleApplicationSubmitted as RoleApplicationSubmittedEvent,
  RoleApplicationWithdrawn as RoleApplicationWithdrawnEvent
} from "../generated/templates/EligibilityModule/EligibilityModule";
import {
  EligibilityModuleContract,
  Hat,
  HatMetadata,
  Organization,
  Role,
  WearerEligibility,
  VouchConfig,
  Vouch,
  UserJoinTime,
  VouchingRestrictionEvent,
  HatAutoMintEvent,
  HatClaimEvent,
  HatMetadataUpdateEvent,
  RoleApplication
} from "../generated/schema";
import {
  getUsernameForAddress,
  createUserOnJoin,
  loadExistingUser,
  linkHatToRole,
  getOrCreateRoleWearer,
  linkWearerEligibilityToRoleWearer,
  updateRoleWearerStatus,
  recordUserHatChange,
  shouldCreateRoleWearer,
  linkHatToLookup
} from "./utils";

/**
 * Helper function to convert bytes32 sha256 digest to IPFS CIDv0.
 *
 * CIDv0 = base58( 0x1220 + sha256_digest )
 * - 0x12 = sha2-256 multicodec
 * - 0x20 = 32 bytes length
 * - sha256_digest = 32 bytes (the bytes32 from contract)
 */
function bytes32ToCid(hash: Bytes): string {
  // Create the multihash by prepending 0x1220 header
  let prefix = Bytes.fromHexString("0x1220");

  // Concatenate prefix + hash (34 bytes total)
  let multihash = new Bytes(34);
  for (let i = 0; i < 2; i++) {
    multihash[i] = prefix[i];
  }
  for (let i = 0; i < 32; i++) {
    multihash[i + 2] = hash[i];
  }

  // Base58 encode to get CIDv0 (starts with "Qm")
  return multihash.toBase58();
}

/**
 * Helper function to create an IPFS file data source for hat metadata.
 * Uses DataSourceContext to pass the hatEntityId to the handler so it can
 * link the metadata back to the hat.
 *
 * The contract stores bytes32 which is the sha256 digest from the IPFS CID.
 * We convert it back to CIDv0 format for The Graph to fetch.
 */
function createHatIpfsDataSource(metadataCID: Bytes, hatEntityId: string): void {
  // Skip if metadataCID is empty (all zeros)
  if (metadataCID.equals(Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000"))) {
    return;
  }

  // Convert bytes32 sha256 digest to IPFS CIDv0 string
  let ipfsCid = bytes32ToCid(metadataCID);

  // Skip if HatMetadata already exists - prevents duplicate file data sources
  let existing = HatMetadata.load(ipfsCid);
  if (existing != null) {
    return;
  }

  // Create context to pass hatEntityId to the IPFS handler
  let context = new DataSourceContext();
  context.setString("hatEntityId", hatEntityId);

  HatMetadataTemplate.createWithContext(ipfsCid, context);
}

export function handleEligibilityModuleInitialized(
  event: EligibilityModuleInitializedEvent
): void {
  let contract = EligibilityModuleContract.load(event.address);
  if (contract == null) {
    log.warning("EligibilityModuleContract not found at address {}", [
      event.address.toHexString()
    ]);
    return;
  }

  contract.superAdmin = event.params.superAdmin;
  contract.hatsContract = event.params.hatsContract;
  contract.save();
}

export function handleHatCreatedWithEligibility(
  event: HatCreatedWithEligibilityEvent
): void {
  let contractAddress = event.address;
  let hatId = event.params.newHatId;
  let hatIdString = hatId.toString();

  let hatEntityId = contractAddress.toHexString() + "-" + hatIdString;
  let hat = new Hat(hatEntityId);

  hat.hatId = hatId;
  hat.parentHatId = event.params.parentHatId;
  // Calculate level based on parent (0 for top hat, otherwise try to get from parent)
  let parentHat = Hat.load(contractAddress.toHexString() + "-" + event.params.parentHatId.toString());
  if (parentHat != null) {
    hat.level = parentHat.level + 1;
  } else {
    // Default to 1 if parent not found (parent might not be indexed yet)
    hat.level = event.params.parentHatId.equals(BigInt.fromI32(0)) ? 0 : 1;
  }
  hat.eligibilityModule = contractAddress;
  hat.creator = event.params.creator;
  hat.creatorUsername = getUsernameForAddress(event.params.creator);

  // Note: We intentionally do NOT create a User entity for the creator here.
  // During deployment, hats are often created by helper contracts (HatsTreeSetup, etc.)
  // which are not real users. The creator address is still stored in hat.creator.
  let eligibilityModule = EligibilityModuleContract.load(contractAddress);

  hat.defaultEligible = event.params.defaultEligible;
  hat.defaultStanding = event.params.defaultStanding;
  hat.mintedCount = event.params.mintedCount;
  hat.active = true; // default; updated by Hats.HatStatusChanged
  hat.createdAt = event.block.timestamp;
  hat.createdAtBlock = event.block.number;
  hat.transactionHash = event.transaction.hash;

  hat.save();

  // Link Hat to Role entity + populate HatLookup.hat so HatStatusChanged
  // can resolve hatId -> Hat entity.
  if (eligibilityModule) {
    let role = linkHatToRole(eligibilityModule.organization, hatId, hatEntityId, event);
    linkHatToLookup(hatId, eligibilityModule.organization, hatEntityId);

    // Genesis hats are minted via Hats.createHat in Deployer.sol (no
    // HatCreatedWithEligibility emitted). Every HatCreatedWithEligibility we
    // see post-genesis is a governance-created user role — surface it to the
    // org's role list so the frontend's role pickers, permission UI and
    // member sidebar pick it up without a redeploy.
    let org = Organization.load(eligibilityModule.organization);
    if (org) {
      let existing = org.roleHatIds;
      let alreadyTracked = false;
      if (existing) {
        for (let i = 0; i < existing.length; i++) {
          if (existing[i].equals(hatId)) {
            alreadyTracked = true;
            break;
          }
        }
      }
      if (!alreadyTracked) {
        let updated = existing ? existing : new Array<BigInt>(0);
        updated.push(hatId);
        org.roleHatIds = updated;
        org.lastUpdatedAt = event.block.timestamp;
        org.save();
      }
      if (role.isUserRole != true) {
        role.isUserRole = true;
        role.save();
      }
    }
  }
}

export function handleWearerEligibilityUpdated(
  event: WearerEligibilityUpdatedEvent
): void {
  let contractAddress = event.address;
  let hatId = event.params.hatId;
  let wearer = event.params.wearer;

  let wearerEligibilityId = contractAddress.toHexString() + "-" + hatId.toString() + "-" + wearer.toHexString();
  let wearerEligibility = WearerEligibility.load(wearerEligibilityId);

  if (wearerEligibility == null) {
    wearerEligibility = new WearerEligibility(wearerEligibilityId);
    wearerEligibility.eligibilityModule = contractAddress;
    wearerEligibility.hat = contractAddress.toHexString() + "-" + hatId.toString();
    wearerEligibility.wearer = wearer;
    wearerEligibility.hatId = hatId;
  }

  wearerEligibility.eligible = event.params.eligible;
  wearerEligibility.standing = event.params.standing;
  wearerEligibility.hasSpecificRules = true;
  wearerEligibility.admin = event.params.admin;
  wearerEligibility.adminUsername = getUsernameForAddress(event.params.admin);
  wearerEligibility.wearerUsername = getUsernameForAddress(wearer);

  // Link to User entities
  let eligibilityModule = EligibilityModuleContract.load(contractAddress);
  if (eligibilityModule) {
    // Link wearer
    let wearerUser = loadExistingUser(
      eligibilityModule.organization,
      wearer,
      event.block.timestamp,
      event.block.number
    );
    if (wearerUser) {
      wearerEligibility.wearerUser = wearerUser.id;
    }

    // Link admin
    let adminUser = loadExistingUser(
      eligibilityModule.organization,
      event.params.admin,
      event.block.timestamp,
      event.block.number
    );
    if (adminUser) {
      wearerEligibility.adminUser = adminUser.id;
    }
  }

  wearerEligibility.updatedAt = event.block.timestamp;
  wearerEligibility.updatedAtBlock = event.block.number;
  wearerEligibility.transactionHash = event.transaction.hash;

  wearerEligibility.save();

  // Link wearerEligibility to RoleWearer for the eligibility-rules view.
  // NOTE: RoleWearer.isActive is no longer set here — it now reflects ERC-1155
  // token state via Hats.TransferSingle (see issue #166). Eligibility-only
  // revokes don't burn tokens (vouching with combineWithHierarchy=true), so
  // flipping isActive off them was wrong. Consumers wanting eligibility-aware
  // semantics should AND RoleWearer.isActive with WearerEligibility.{eligible,
  // standing} via the linked WearerEligibility.
  if (eligibilityModule) {
    linkWearerEligibilityToRoleWearer(
      eligibilityModule.organization,
      hatId,
      wearer,
      wearerEligibilityId
    );

    // NOTE: User.currentHatIds is no longer driven from eligibility events.
    // Hats Protocol's ERC-1155 TransferSingle is the source of truth for who
    // actually holds a hat token. Eligibility revokes that don't burn the
    // token (e.g. vouching with combineWithHierarchy=true) used to silently
    // drop wearers from the subgraph view; see issue #166. The eligibility
    // view itself is preserved on the WearerEligibility entity.
  }
}

export function handleBulkWearerEligibilityUpdated(
  event: BulkWearerEligibilityUpdatedEvent
): void {
  let contractAddress = event.address;
  let hatId = event.params.hatId;
  let wearers = event.params.wearers;
  let eligible = event.params.eligible;
  let standing = event.params.standing;
  let admin = event.params.admin;

  // Get organization for User linking
  let eligibilityModule = EligibilityModuleContract.load(contractAddress);

  for (let i = 0; i < wearers.length; i++) {
    let wearer = wearers[i];
    let wearerEligibilityId = contractAddress.toHexString() + "-" + hatId.toString() + "-" + wearer.toHexString();
    let wearerEligibility = WearerEligibility.load(wearerEligibilityId);

    if (wearerEligibility == null) {
      wearerEligibility = new WearerEligibility(wearerEligibilityId);
      wearerEligibility.eligibilityModule = contractAddress;
      wearerEligibility.hat = contractAddress.toHexString() + "-" + hatId.toString();
      wearerEligibility.wearer = wearer;
      wearerEligibility.hatId = hatId;
    }

    wearerEligibility.eligible = eligible;
    wearerEligibility.standing = standing;
    wearerEligibility.hasSpecificRules = true;
    wearerEligibility.admin = admin;
    wearerEligibility.adminUsername = getUsernameForAddress(admin);
    wearerEligibility.wearerUsername = getUsernameForAddress(wearer);

    // Link to User entities
    if (eligibilityModule) {
      // Link wearer
      let wearerUser = loadExistingUser(
        eligibilityModule.organization,
        wearer,
        event.block.timestamp,
        event.block.number
      );
      if (wearerUser) {
        wearerEligibility.wearerUser = wearerUser.id;
      }

      // Link admin
      let adminUser = loadExistingUser(
        eligibilityModule.organization,
        admin,
        event.block.timestamp,
        event.block.number
      );
      if (adminUser) {
        wearerEligibility.adminUser = adminUser.id;
      }
    }

    wearerEligibility.updatedAt = event.block.timestamp;
    wearerEligibility.updatedAtBlock = event.block.number;
    wearerEligibility.transactionHash = event.transaction.hash;

    wearerEligibility.save();

    // Same fix as the single-wearer path above: only the eligibility view
    // is updated, the token-state view (RoleWearer.isActive) is left alone.
    if (eligibilityModule) {
      linkWearerEligibilityToRoleWearer(
        eligibilityModule.organization,
        hatId,
        wearer,
        wearerEligibilityId
      );

      // NOTE: User.currentHatIds is now driven by Hats.TransferSingle, not by
      // BulkWearerEligibilityUpdated. See handleWearerEligibilityUpdated above
      // and issue #166 for context.
    }
  }
}

export function handleDefaultEligibilityUpdated(
  event: DefaultEligibilityUpdatedEvent
): void {
  let contractAddress = event.address;
  let hatId = event.params.hatId;
  let hatEntityId = contractAddress.toHexString() + "-" + hatId.toString();

  let hat = Hat.load(hatEntityId);
  let isNewHat = hat == null;

  if (hat == null) {
    // Hat doesn't exist yet - this happens when hats are created via HatsTreeSetup
    // (which creates hats directly on Hats Protocol, not via createHatWithEligibility)
    // Create the Hat entity with available information from the event
    hat = new Hat(hatEntityId);
    hat.hatId = hatId;
    hat.parentHatId = BigInt.fromI32(0); // Unknown - HatsTreeSetup doesn't emit parent info
    hat.level = 0; // Unknown - will be 0 for top-level hats
    hat.eligibilityModule = contractAddress;
    hat.creator = event.params.admin; // Use admin as creator
    hat.creatorUsername = getUsernameForAddress(event.params.admin);

    // Note: We intentionally do NOT create a User entity for the admin here.
    // During deployment, hats are often created/configured by helper contracts
    // which are not real users. The admin address is stored in hat.creator.

    hat.defaultEligible = event.params.eligible;
    hat.defaultStanding = event.params.standing;
    hat.mintedCount = BigInt.fromI32(0); // Unknown - will be updated if minting events occur
    hat.active = true; // default; updated by Hats.HatStatusChanged
    hat.createdAt = event.block.timestamp;
    hat.createdAtBlock = event.block.number;
    hat.transactionHash = event.transaction.hash;
    hat.save();

    // Populate HatLookup.hat so Hats.HatStatusChanged can resolve hatId
    // -> Hat entity. Org comes from the eligibility module that fired this
    // event.
    let elig = EligibilityModuleContract.load(contractAddress);
    if (elig) {
      linkHatToLookup(hatId, elig.organization, hatEntityId);
    }

    log.info("Created Hat entity from DefaultEligibilityUpdated for hatId {} at contract {}", [
      hatId.toString(),
      contractAddress.toHexString()
    ]);
  } else {
    // Hat exists - just update the eligibility fields
    hat.defaultEligible = event.params.eligible;
    hat.defaultStanding = event.params.standing;
    hat.save();
  }

  // Link Hat to Role entity if this is a new hat
  // This ensures Role.hat is set even when hats are created via HatsTreeSetup
  if (isNewHat) {
    let eligibilityModule = EligibilityModuleContract.load(contractAddress);
    if (eligibilityModule) {
      linkHatToRole(eligibilityModule.organization, hatId, hatEntityId, event);
    }
  }

  // Also update VouchConfig if it exists for this hat
  let vouchConfigId = contractAddress.toHexString() + "-" + hatId.toString();
  let vouchConfig = VouchConfig.load(vouchConfigId);
  if (vouchConfig) {
    vouchConfig.defaultEligible = event.params.eligible;
    vouchConfig.defaultStanding = event.params.standing;
    vouchConfig.updatedAt = event.block.timestamp;
    vouchConfig.updatedAtBlock = event.block.number;
    vouchConfig.save();
  }
}

export function handleVouchConfigSet(event: VouchConfigSetEvent): void {
  let contractAddress = event.address;
  let hatId = event.params.hatId;
  let vouchConfigId = contractAddress.toHexString() + "-" + hatId.toString();
  let hatEntityId = contractAddress.toHexString() + "-" + hatId.toString();

  let vouchConfig = VouchConfig.load(vouchConfigId);
  if (vouchConfig == null) {
    vouchConfig = new VouchConfig(vouchConfigId);
    vouchConfig.eligibilityModule = contractAddress;
    vouchConfig.hat = hatEntityId;
    vouchConfig.hatId = hatId;
    // Initialize defaults from Hat entity if it exists
    let hat = Hat.load(hatEntityId);
    if (hat) {
      vouchConfig.defaultEligible = hat.defaultEligible;
      vouchConfig.defaultStanding = hat.defaultStanding;
    } else {
      // Fallback defaults if Hat doesn't exist yet
      vouchConfig.defaultEligible = true;
      vouchConfig.defaultStanding = true;
    }
  }

  vouchConfig.quorum = i32(event.params.quorum.toI32());
  vouchConfig.membershipHatId = event.params.membershipHatId;
  vouchConfig.enabled = event.params.enabled;
  vouchConfig.combinesWithHierarchy = event.params.combineWithHierarchy;
  vouchConfig.updatedAt = event.block.timestamp;
  vouchConfig.updatedAtBlock = event.block.number;
  vouchConfig.transactionHash = event.transaction.hash;

  vouchConfig.save();
}

export function handleVouched(event: VouchedEvent): void {
  let contractAddress = event.address;
  let hatId = event.params.hatId;
  let wearer = event.params.wearer;
  let voucher = event.params.voucher;

  let vouchId = contractAddress.toHexString() + "-" + hatId.toString() + "-" + wearer.toHexString() + "-" + voucher.toHexString();
  let vouch = new Vouch(vouchId);

  vouch.eligibilityModule = contractAddress;
  vouch.vouchConfig = contractAddress.toHexString() + "-" + hatId.toString();
  vouch.wearerEligibility = contractAddress.toHexString() + "-" + hatId.toString() + "-" + wearer.toHexString();
  vouch.hatId = hatId;
  vouch.wearer = wearer;
  vouch.wearerUsername = getUsernameForAddress(wearer);
  vouch.voucher = voucher;
  vouch.voucherUsername = getUsernameForAddress(voucher);
  vouch.vouchCount = i32(event.params.newCount.toI32());
  vouch.isActive = true;

  // Link to User entities
  let eligibilityModule = EligibilityModuleContract.load(contractAddress);
  if (eligibilityModule) {
    // Link wearer
    let wearerUser = loadExistingUser(
      eligibilityModule.organization,
      wearer,
      event.block.timestamp,
      event.block.number
    );
    if (wearerUser) {
      vouch.wearerUser = wearerUser.id;
    }

    // Link voucher
    let voucherUser = loadExistingUser(
      eligibilityModule.organization,
      voucher,
      event.block.timestamp,
      event.block.number
    );
    if (voucherUser) {
      vouch.voucherUser = voucherUser.id;
    }
  }

  vouch.createdAt = event.block.timestamp;
  vouch.createdAtBlock = event.block.number;
  vouch.transactionHash = event.transaction.hash;

  vouch.save();
}

export function handleVouchRevoked(event: VouchRevokedEvent): void {
  let contractAddress = event.address;
  let hatId = event.params.hatId;
  let wearer = event.params.wearer;
  let voucher = event.params.voucher;

  let vouchId = contractAddress.toHexString() + "-" + hatId.toString() + "-" + wearer.toHexString() + "-" + voucher.toHexString();
  let vouch = Vouch.load(vouchId);

  if (vouch == null) {
    log.warning("Vouch not found for revocation: {}", [vouchId]);
    return;
  }

  vouch.isActive = false;
  vouch.vouchCount = i32(event.params.newCount.toI32());
  vouch.revokedAt = event.block.timestamp;
  vouch.revokedAtBlock = event.block.number;

  vouch.save();
}

export function handleHatClaimed(event: HatClaimedEvent): void {
  let id = event.transaction.hash.concatI32(event.logIndex.toI32());
  let claim = new HatClaimEvent(id);

  let contractAddress = event.address;
  let hatId = event.params.hatId;

  claim.eligibilityModule = contractAddress;
  claim.wearer = event.params.wearer;
  claim.wearerUsername = getUsernameForAddress(event.params.wearer);
  claim.hatId = hatId;
  claim.hat = contractAddress.toHexString() + "-" + hatId.toString();
  claim.claimedAt = event.block.timestamp;
  claim.claimedAtBlock = event.block.number;
  claim.transactionHash = event.transaction.hash;

  // Link to User entity and create RoleWearer
  let eligibilityModule = EligibilityModuleContract.load(contractAddress);
  if (eligibilityModule) {
    // Skip RoleWearer creation if EligibilityModule is claiming for itself (system contract)
    // This avoids timing issues with Organization entity not being fully saved yet
    if (event.params.wearer.equals(contractAddress)) {
      claim.save();
      return;
    }

    // Clear any active role application for this hat+wearer
    let applicationId = contractAddress.toHexString() + "-" + hatId.toString() + "-" + event.params.wearer.toHexString();
    let application = RoleApplication.load(applicationId);
    if (application && application.active) {
      application.active = false;
      application.save();
    }

    let user = createUserOnJoin(
      eligibilityModule.organization,
      event.params.wearer,
      "HatClaim",
      event.block.timestamp,
      event.block.number
    );
    if (user) {
      claim.wearerUser = user.id;

      // Only create RoleWearer for user-facing hats to non-system addresses
      if (shouldCreateRoleWearer(eligibilityModule.organization, hatId, event.params.wearer)) {
        // Create RoleWearer entity
        getOrCreateRoleWearer(
          eligibilityModule.organization,
          hatId,
          event.params.wearer,
          event
        );

        // Record the hat change on the user (this will save the user)
        recordUserHatChange(user, hatId, true, event);
      }
    }
  }

  claim.save();
}

export function handleUserJoinTimeSet(event: UserJoinTimeSetEvent): void {
  let contractAddress = event.address;
  let user = event.params.user;

  let userJoinTimeId = contractAddress.toHexString() + "-" + user.toHexString();
  let userJoinTime = UserJoinTime.load(userJoinTimeId);

  if (userJoinTime == null) {
    userJoinTime = new UserJoinTime(userJoinTimeId);
    userJoinTime.eligibilityModule = contractAddress;
    userJoinTime.user = user;
  }

  userJoinTime.joinTime = event.params.joinTime;
  userJoinTime.setAt = event.block.timestamp;
  userJoinTime.setAtBlock = event.block.number;
  userJoinTime.transactionHash = event.transaction.hash;

  userJoinTime.save();
}

export function handleEligibilityModuleAdminHatSet(
  event: EligibilityModuleAdminHatSetEvent
): void {
  let contract = EligibilityModuleContract.load(event.address);
  if (contract == null) {
    log.warning("EligibilityModuleContract not found at address {}", [
      event.address.toHexString()
    ]);
    return;
  }

  let adminHatId = event.params.hatId;
  contract.eligibilityModuleAdminHat = adminHatId;
  contract.save();

  // The admin hat is a system hat — its wearer is the EligibilityModule
  // contract itself, not a user. It shouldn't appear in user-facing role
  // pickers, the team-page role tree, or the leaderboard. Strip it from
  // org.roleHatIds and force Role.isUserRole = false so every downstream
  // consumer skips it cleanly.
  //
  // We do this on every admin-hat-set event (typically fires once, at
  // genesis), so a subgraph re-index from block 0 correctly excludes the
  // admin hat from already-deployed orgs — no contracts change needed.
  let orgId = contract.organization;
  let roleId = orgId.toHexString() + "-" + adminHatId.toString();
  let role = Role.load(roleId);
  if (role != null && role.isUserRole != false) {
    role.isUserRole = false;
    role.save();
  }

  let org = Organization.load(orgId);
  if (org != null) {
    let existing = org.roleHatIds;
    if (existing != null && existing.length > 0) {
      let filtered = new Array<BigInt>(0);
      let removed = false;
      for (let i = 0; i < existing.length; i++) {
        if (existing[i].equals(adminHatId)) {
          removed = true;
        } else {
          filtered.push(existing[i]);
        }
      }
      if (removed) {
        org.roleHatIds = filtered;
        org.lastUpdatedAt = event.block.timestamp;
        org.save();
      }
    }
  }
}

export function handleGovernanceAdminSet(
  event: GovernanceAdminSetEvent
): void {
  let contract = EligibilityModuleContract.load(event.address);
  if (contract == null) {
    log.warning("EligibilityModuleContract not found at address {}", [
      event.address.toHexString()
    ]);
    return;
  }

  contract.governanceAdmin = event.params.governanceAdmin;
  contract.save();
}

export function handleSuperAdminTransferred(
  event: SuperAdminTransferredEvent
): void {
  let contract = EligibilityModuleContract.load(event.address);
  if (contract == null) {
    log.warning("EligibilityModuleContract not found at address {}", [
      event.address.toHexString()
    ]);
    return;
  }

  contract.superAdmin = event.params.newSuperAdmin;
  contract.save();
}

export function handlePaused(event: PausedEvent): void {
  let contract = EligibilityModuleContract.load(event.address);
  if (contract == null) {
    log.warning("EligibilityModuleContract not found at address {}", [
      event.address.toHexString()
    ]);
    return;
  }

  contract.isPaused = true;
  contract.save();
}

export function handleUnpaused(event: UnpausedEvent): void {
  let contract = EligibilityModuleContract.load(event.address);
  if (contract == null) {
    log.warning("EligibilityModuleContract not found at address {}", [
      event.address.toHexString()
    ]);
    return;
  }

  contract.isPaused = false;
  contract.save();
}

export function handleVouchingRateLimitExceeded(
  event: VouchingRateLimitExceededEventEvent
): void {
  let id = event.transaction.hash.concatI32(event.logIndex.toI32());
  let restriction = new VouchingRestrictionEvent(id);

  restriction.eligibilityModule = event.address;
  restriction.user = event.params.user;
  restriction.userUsername = getUsernameForAddress(event.params.user);
  restriction.restrictionType = "RateLimit";
  restriction.eventAt = event.block.timestamp;
  restriction.eventAtBlock = event.block.number;
  restriction.transactionHash = event.transaction.hash;

  // Link to User entity
  let eligibilityModule = EligibilityModuleContract.load(event.address);
  if (eligibilityModule) {
    let user = loadExistingUser(
      eligibilityModule.organization,
      event.params.user,
      event.block.timestamp,
      event.block.number
    );
    if (user) {
      restriction.userUser = user.id;
    }
  }

  restriction.save();
}

export function handleNewUserVouchingRestricted(
  event: NewUserVouchingRestrictedEventEvent
): void {
  let id = event.transaction.hash.concatI32(event.logIndex.toI32());
  let restriction = new VouchingRestrictionEvent(id);

  restriction.eligibilityModule = event.address;
  restriction.user = event.params.user;
  restriction.userUsername = getUsernameForAddress(event.params.user);
  restriction.restrictionType = "NewUser";
  restriction.eventAt = event.block.timestamp;
  restriction.eventAtBlock = event.block.number;
  restriction.transactionHash = event.transaction.hash;

  // Link to User entity
  let eligibilityModule = EligibilityModuleContract.load(event.address);
  if (eligibilityModule) {
    let user = loadExistingUser(
      eligibilityModule.organization,
      event.params.user,
      event.block.timestamp,
      event.block.number
    );
    if (user) {
      restriction.userUser = user.id;
    }
  }

  restriction.save();
}

export function handleHatMetadataUpdated(
  event: HatMetadataUpdatedEvent
): void {
  let contractAddress = event.address;
  let hatId = event.params.hatId;
  let hatEntityId = contractAddress.toHexString() + "-" + hatId.toString();

  let hat = Hat.load(hatEntityId);
  if (hat == null) {
    log.warning("Hat not found for metadata update: {}", [hatEntityId]);
    return;
  }

  // Update hat metadata fields
  hat.name = event.params.name;
  hat.metadataCID = event.params.metadataCID;
  hat.metadataUpdatedAt = event.block.timestamp;
  hat.metadataUpdatedAtBlock = event.block.number;

  // Link to IPFS metadata entity (will be populated when IPFS content is fetched)
  let metadataCID = event.params.metadataCID;
  if (!metadataCID.equals(Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000"))) {
    hat.metadata = bytes32ToCid(metadataCID);
  }

  hat.save();

  // Create event entity for history tracking
  let eventId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let metadataEvent = new HatMetadataUpdateEvent(eventId);
  metadataEvent.eligibilityModule = contractAddress;
  metadataEvent.hat = hatEntityId;
  metadataEvent.hatId = hatId;
  metadataEvent.name = event.params.name;
  metadataEvent.metadataCID = event.params.metadataCID;
  metadataEvent.updatedBy = event.transaction.from;
  metadataEvent.updatedAt = event.block.timestamp;
  metadataEvent.updatedAtBlock = event.block.number;
  metadataEvent.transactionHash = event.transaction.hash;
  metadataEvent.save();

  // Trigger IPFS fetch for metadata content
  createHatIpfsDataSource(metadataCID, hatEntityId);
}

export function handleRoleApplicationSubmitted(event: RoleApplicationSubmittedEvent): void {
  let contractAddress = event.address;
  let hatId = event.params.hatId;
  let applicant = event.params.applicant;

  let applicationId = contractAddress.toHexString() + "-" + hatId.toString() + "-" + applicant.toHexString();
  let application = new RoleApplication(applicationId);
  application.eligibilityModule = contractAddress;
  application.hatId = hatId;
  application.applicant = applicant;
  application.applicantUsername = getUsernameForAddress(applicant);
  application.applicationHash = event.params.applicationHash;
  application.active = true;
  application.appliedAt = event.block.timestamp;
  application.appliedAtBlock = event.block.number;
  application.transactionHash = event.transaction.hash;

  // Link to Hat entity if it exists
  let hatEntityId = contractAddress.toHexString() + "-" + hatId.toString();
  let hat = Hat.load(hatEntityId);
  if (hat) {
    application.hat = hatEntityId;
  }

  application.save();
}

export function handleRoleApplicationWithdrawn(event: RoleApplicationWithdrawnEvent): void {
  let contractAddress = event.address;
  let hatId = event.params.hatId;
  let applicant = event.params.applicant;

  let applicationId = contractAddress.toHexString() + "-" + hatId.toString() + "-" + applicant.toHexString();
  let application = RoleApplication.load(applicationId);
  if (application) {
    application.active = false;
    application.withdrawnAt = event.block.timestamp;
    application.save();
  }
}
