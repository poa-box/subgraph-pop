import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  PaymasterInitialized as PaymasterInitializedEvent,
  OrgRegistered as OrgRegisteredEvent,
  RuleSet as RuleSetEvent,
  BudgetSet as BudgetSetEvent,
  FeeCapsSet as FeeCapsSetEvent,
  PauseSet as PauseSetEvent,
  OperatorHatSet as OperatorHatSetEvent,
  DepositIncrease as DepositIncreaseEvent,
  OrgDepositReceived as OrgDepositReceivedEvent,
  UsageIncreased as UsageIncreasedEvent,
  SolidarityFeeCollected as SolidarityFeeCollectedEvent,
  SolidarityDonationReceived as SolidarityDonationReceivedEvent,
  OrgBannedFromSolidarity as OrgBannedFromSolidarityEvent,
  GracePeriodConfigUpdated as GracePeriodConfigUpdatedEvent,
  SolidarityDistributionPaused as SolidarityDistributionPausedEvent,
  SolidarityDistributionUnpaused as SolidarityDistributionUnpausedEvent,
  OnboardingAccountCreated as OnboardingAccountCreatedEvent,
  OnboardingConfigUpdated as OnboardingConfigUpdatedEvent,
  OrgDeployConfigUpdated as OrgDeployConfigUpdatedEvent,
  OrgDeploymentSponsored as OrgDeploymentSponsoredEvent,
  OrgSpendingRecorded as OrgSpendingRecordedEvent,
  GlobalRuleSet as GlobalRuleSetEvent,
  TargetTypeSet as TargetTypeSetEvent,
  RulesModeSet as RulesModeSetEvent,
  GlobalRuleBlockSet as GlobalRuleBlockSetEvent,
  PaymasterHub as PaymasterHubBinding
} from "../generated/templates/PaymasterHub/PaymasterHub";
import {
  PaymasterHubContract,
  PaymasterOrgConfig,
  PaymasterRule,
  PaymasterBudget,
  PaymasterFeeCaps,
  PaymasterOrgStats,
  PaymasterDepositEvent,
  UsageEvent,
  SolidarityEvent,
  PaymasterConfigChange,
  GracePeriodChange,
  PauseToggle,
  OrgBanRecord,
  Organization,
  OnboardingConfig,
  OnboardingAccount,
  OrgDeployConfig,
  OrgDeploySponsorship,
  PaymasterGlobalRule,
  PaymasterTargetType,
  PaymasterGlobalRuleBlock,
  PaymasterRulesModeChange
} from "../generated/schema";

// Helper to get or create PaymasterHubContract singleton
function getOrCreateHub(contractAddress: Bytes): PaymasterHubContract {
  let hub = PaymasterHubContract.load(contractAddress);
  if (!hub) {
    hub = new PaymasterHubContract(contractAddress);
    hub.entryPoint = Address.zero();
    hub.hats = Address.zero();
    hub.poaManager = Address.zero();
    hub.totalDeposit = BigInt.fromI32(0);
    hub.solidarityBalance = BigInt.fromI32(0);
    hub.totalFeesCollected = BigInt.fromI32(0);
    hub.gracePeriodDays = 90;
    hub.maxSpendDuringGrace = BigInt.fromString("10000000000000000"); // 0.01 ETH
    hub.minDepositRequired = BigInt.fromString("3000000000000000"); // 0.003 ETH
    hub.solidarityDistributionPaused = false;
    hub.createdAt = BigInt.fromI32(0);
    hub.createdAtBlock = BigInt.fromI32(0);
    hub.transactionHash = Bytes.empty();
  }
  return hub;
}

// Helper to get org config ID
function getOrgConfigId(hubAddress: Bytes, orgId: Bytes): string {
  return hubAddress.toHexString() + "-" + orgId.toHexString();
}

// Helper to get or create PaymasterOrgStats
function getOrCreateOrgStats(orgConfigId: string): PaymasterOrgStats {
  let stats = PaymasterOrgStats.load(orgConfigId);
  if (!stats) {
    stats = new PaymasterOrgStats(orgConfigId);
    stats.orgConfig = orgConfigId;
    stats.totalUserOps = BigInt.fromI32(0);
    stats.totalGasSponsored = BigInt.fromI32(0);
    stats.totalDeposited = BigInt.fromI32(0);
    stats.totalWithdrawn = BigInt.fromI32(0);
    stats.totalSolidarityFeesCollected = BigInt.fromI32(0);
    stats.lastOperationAt = BigInt.fromI32(0);
    stats.lastOperationAtBlock = BigInt.fromI32(0);
  }
  return stats;
}

// bytes32(0) — a cleared target type. Compared as a hex STRING because AssemblyScript has no
// `==` for Bytes, and because a module-scope `Bytes.fromHexString` would add a host-import call
// to wasm `_start` (see scripts/check-wasm-start.mjs).
const ZERO_TYPE_ID_HEX = "0x0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Human-readable name for a ModuleTypes typeId (keccak256 of the module name string).
 *
 * These are the same identifiers OrgRegistry uses for RegisteredContract.typeId, so per-org
 * modules could in principle be named by joining. That join is deliberately not used: its key
 * is keccak256(abi.encodePacked(orgId, typeId)), GlobalRuleSet carries no orgId at all, and the
 * two protocol singletons (UniversalAccountRegistry, OrgRegistry) have no RegisteredContract
 * row — so a static table is the only thing that covers every case.
 *
 * Mirrors src/libs/ModuleTypes.sol in the contracts repo. Returns null for bytes32(0) (a
 * cleared target type) and for any unknown typeId, so a module type added contracts-side
 * degrades to "typeId present, name unknown" rather than being mislabelled.
 */
function moduleTypeName(typeId: Bytes): string | null {
  let h = typeId.toHexString();
  if (h == "0xeb35d5f9843d4076628c4747d195abdd0312e0b8b8f5812a706f3d25ea0b1074") return "Executor";
  if (h == "0x4784d0eb49be96744b28df0ac228d16d518300f3918df72816b3b561765905e2") return "QuickJoin";
  if (h == "0x61653188976d6d9ecf5e33b147788ec0830eac3e633a227b8852151b9bc260ff")
    return "ParticipationToken";
  if (h == "0x32f7a2c64ebedb84c7786a459012ac8953c5a63d5dcc8715f2fa3e32bdb3b434")
    return "TaskManager";
  if (h == "0xa871f070b566fe185ede7c7d071cb2f92e7c75c6a2912b6f37c86a50cdc6bad3")
    return "EducationHub";
  if (h == "0xb8dd67d452899bbfb87b5b09ad416a7e087658a191da37d41f9ea7dee2fa659a")
    return "HybridVoting";
  if (h == "0x4227a68d7c497034bee963ad52ac7718fa79a916edc119c0f7e6589c8b2d4ea7")
    return "EligibilityModule";
  if (h == "0x75dfb681d193a73a66b628a5adc66bb1ca7bb3feb9a5692cd0a1560ccd9b851a")
    return "ToggleModule";
  if (h == "0x27c0a50afefb382eb18d87e6a049659a778b9a2f11c89b8723c63e6fab6fa323")
    return "PaymentManager";
  if (h == "0x527024332d5c521cb6c588752259a2624cc8aee8d1193a9a4ed6edc842eaf289")
    return "PaymasterHub";
  if (h == "0xf7339bb8aed66291ac713d0a14749e830b09b2288976ec5d45de7e64df0f2aeb")
    return "DirectDemocracyVoting";
  if (h == "0xda41a9794e00ddb18f1b3c615f12a80255bfb0a79706263eee63314d8f817c10")
    return "PasskeyAccount";
  if (h == "0x82da23c7ff6e2ce257dee836273bf72af382187589631ce71ae1388c80777930")
    return "PasskeyAccountFactory";
  if (h == "0x77a52db12b54c70a33bdf184cac221a69b235b98cf754315952afcffd06ae4db")
    return "ZkEmailInvites";
  if (h == "0x3250c7e0dd82fca1639c4864d0b069e0c7943457c0d528081ef5f3196816981f")
    return "UniversalAccountRegistry";
  if (h == "0x44d4cc91900b2dfd889979a9ec8823f315f231226d1fbe0204abe8febaa2447c")
    return "OrgRegistry";
  return null;
}

/**
 * Read the whole global rulebook off-chain and materialise it as PaymasterGlobalRule rows.
 *
 * Called ONCE from handleInfrastructureDeployed (poa-manager.ts), for the same reason the
 * solidarity/grace/onboarding state is read there: on a FRESH CHAIN the rulebook is seeded by
 * `PoaManager.adminCall(paymasterHub, setGlobalRulesBatch(...))` many transactions — and
 * therefore at least one block — BEFORE `registerInfrastructure` emits InfrastructureDeployed
 * and creates the PaymasterHub template (see DeployInfrastructure.s.sol / MainDeploy.s.sol).
 * Those GlobalRuleSet logs are cross-block and are never delivered to this subgraph, so without
 * this catch-up read PaymasterGlobalRule would be permanently empty on every new network — and
 * since the v20 OrgDeployer seeds NO local rules for Mirror orgs, every org would appear to
 * sponsor nothing.
 *
 * On arbitrum-one and gnosis the rulebook is instead seeded by UpgradePaymasterGlobalRules long
 * after the template exists, and the pre-v20 hub implementation has no getGlobalRuleCount at the
 * InfrastructureDeployed block — the try_ guard makes that a no-op, and the real GlobalRuleSet
 * logs are indexed normally.
 *
 * The enumeration only holds LIVE keys (setGlobalRulesBatch pops removed entries), so tombstoned
 * rules are correctly absent rather than resurrected. Rows already written by a real
 * GlobalRuleSet log are left alone: the event is always the more authoritative source.
 */
export function backfillGlobalRulebook(
  hubAddress: Address,
  timestamp: BigInt,
  blockNumber: BigInt,
  transactionHash: Bytes
): void {
  let hub = PaymasterHubBinding.bind(hubAddress);

  let countResult = hub.try_getGlobalRuleCount();
  if (countResult.reverted) return;

  let count = countResult.value.toI32();
  for (let i = 0; i < count; i++) {
    let entryResult = hub.try_getGlobalRuleAt(BigInt.fromI32(i));
    if (entryResult.reverted) continue;

    let typeId = entryResult.value.getTypeId();
    let selector = entryResult.value.getSelector();
    let rule = entryResult.value.getRule();

    // Same id shape as handleGlobalRuleSet — these rows must be indistinguishable from
    // event-sourced ones.
    let globalRuleId =
      hubAddress.toHexString() + "-" + typeId.toHexString() + "-" + selector.toHexString();
    if (PaymasterGlobalRule.load(globalRuleId) != null) continue;

    let globalRule = new PaymasterGlobalRule(globalRuleId);
    globalRule.paymasterHub = hubAddress;
    globalRule.typeId = typeId;
    globalRule.selector = selector;
    globalRule.moduleName = moduleTypeName(typeId);
    globalRule.allowed = rule.allowed;
    globalRule.maxCallGasHint = rule.maxCallGasHint.toI32();
    globalRule.setAt = timestamp;
    globalRule.setAtBlock = blockNumber;
    globalRule.transactionHash = transactionHash;
    globalRule.save();
  }
}

// 1. PaymasterInitialized - Create singleton
export function handlePaymasterInitialized(event: PaymasterInitializedEvent): void {
  let contractAddress = event.address;

  let hub = getOrCreateHub(contractAddress);
  hub.entryPoint = event.params.entryPoint;
  hub.hats = event.params.hats;
  hub.poaManager = event.params.poaManager;
  hub.createdAt = event.block.timestamp;
  hub.createdAtBlock = event.block.number;
  hub.transactionHash = event.transaction.hash;
  hub.save();
}

// 2. OrgRegistered - Create org config
export function handleOrgRegistered(event: OrgRegisteredEvent): void {
  let contractAddress = event.address;
  let orgId = event.params.orgId;
  let orgConfigId = getOrgConfigId(contractAddress, orgId);

  // Ensure hub exists
  let hub = getOrCreateHub(contractAddress);
  hub.save();

  // Create org config
  let orgConfig = new PaymasterOrgConfig(orgConfigId);
  orgConfig.paymasterHub = contractAddress;
  orgConfig.orgId = orgId;
  orgConfig.adminHatId = event.params.adminHatId;
  orgConfig.operatorHatId = event.params.operatorHatId;
  orgConfig.isPaused = false;
  orgConfig.isBannedFromSolidarity = false;
  // Mirror is the on-chain default: rulesModes[orgId] is never written for mode 0, and neither
  // registerOrg nor the legacy registerAndConfigureOrg overload emits RulesModeSet. Orgs
  // deployed through the v20 OrgDeployer get a RulesModeSet in the same tx that overwrites this.
  orgConfig.rulesMode = "Mirror";
  orgConfig.depositBalance = BigInt.fromI32(0);
  orgConfig.totalDeposited = BigInt.fromI32(0);
  orgConfig.totalSpent = BigInt.fromI32(0);
  orgConfig.totalSolidarityReceived = BigInt.fromI32(0);
  orgConfig.registeredAt = event.block.timestamp;
  orgConfig.registeredAtBlock = event.block.number;
  orgConfig.transactionHash = event.transaction.hash;

  // Link to Organization if exists
  let org = Organization.load(orgId);
  if (org) {
    orgConfig.organization = org.id;
  }

  orgConfig.save();

  // Create stats entity
  let stats = getOrCreateOrgStats(orgConfigId);
  stats.save();

  // Create config change record
  let changeId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let change = new PaymasterConfigChange(changeId);
  change.paymasterHub = contractAddress;
  change.orgConfig = orgConfigId;
  change.changeType = "OrgRegistered";
  change.changedAt = event.block.timestamp;
  change.changedAtBlock = event.block.number;
  change.transactionHash = event.transaction.hash;
  change.save();
}

/**
 * 3. RuleSet — upsert the LOCAL per-org rule. Direct mirror of rules[orgId][target][selector].
 *
 * v20 changed who emits this and what it implies, but not the signature or the write:
 *  - setRule(allowed=false) now ALSO emits GlobalRuleBlockSet(...,true) as a SEPARATE log with a
 *    higher logIndex (handled by handleGlobalRuleBlockSet, which writes a different entity — so
 *    there is no ordering dependency here). setRule(allowed=true) and clearRule clear a standing
 *    block the same way.
 *  - clearRule emits RuleSet(...,false,0), byte-identical to the on-chain post-state of a deleted
 *    rule ({allowed:false, hint:0}), so the upsert below stays correct — never delete the row.
 *  - adoptGlobalRules and snapshotGlobalRules are NEW emitters of RuleSet(...,true,globalHint).
 *    A snapshot is a cartesian burst (rulebook entries x matching targets) and can produce
 *    hundreds of RuleSet logs — and hundreds of PaymasterConfigChange rows — in one transaction.
 *  - The v20 OrgDeployer passes EMPTY rule arrays for Mirror orgs, so a freshly deployed org has
 *    ZERO PaymasterRule rows and its sponsorship is entirely rulebook-resolved. Do not read
 *    PaymasterOrgConfig.rules as "what is sponsored"; see PaymasterGlobalRule in schema.graphql
 *    for the full resolution algorithm.
 *  - NOT INDEXABLE: adminBatchAddRules writes {allowed:true, hint:0} with no event at all, so
 *    PaymasterRule under-reports allows for any pair written that way.
 */
export function handleRuleSet(event: RuleSetEvent): void {
  let contractAddress = event.address;
  let orgId = event.params.orgId;
  let target = event.params.target;
  let selector = event.params.selector;
  let orgConfigId = getOrgConfigId(contractAddress, orgId);

  // Rule ID: paymasterHub-orgId-target-selector
  let ruleId = orgConfigId + "-" + target.toHexString() + "-" + selector.toHexString();

  let rule = PaymasterRule.load(ruleId);
  if (!rule) {
    rule = new PaymasterRule(ruleId);
    rule.orgConfig = orgConfigId;
    rule.target = target;
    rule.selector = selector;
  }

  rule.allowed = event.params.allowed;
  rule.maxCallGasHint = event.params.maxCallGasHint.toI32();
  rule.setAt = event.block.timestamp;
  rule.setAtBlock = event.block.number;
  rule.transactionHash = event.transaction.hash;
  rule.save();

  // Create config change record
  let changeId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let change = new PaymasterConfigChange(changeId);
  change.paymasterHub = contractAddress;
  change.orgConfig = orgConfigId;
  change.changeType = "RuleSet";
  change.changedAt = event.block.timestamp;
  change.changedAtBlock = event.block.number;
  change.transactionHash = event.transaction.hash;
  change.save();
}

// 4. BudgetSet - Upsert budget
export function handleBudgetSet(event: BudgetSetEvent): void {
  let contractAddress = event.address;
  let orgId = event.params.orgId;
  let subjectKey = event.params.subjectKey;
  let orgConfigId = getOrgConfigId(contractAddress, orgId);

  // Budget ID: paymasterHub-orgId-subjectKey
  let budgetId = orgConfigId + "-" + subjectKey.toHexString();

  let budget = PaymasterBudget.load(budgetId);
  if (!budget) {
    budget = new PaymasterBudget(budgetId);
    budget.orgConfig = orgConfigId;
    budget.subjectKey = subjectKey;
    budget.usedInEpoch = BigInt.fromI32(0);
    budget.totalUsed = BigInt.fromI32(0);
  }

  budget.capPerEpoch = event.params.capPerEpoch;
  budget.epochLen = event.params.epochLen.toI32();
  budget.epochStart = event.params.epochStart.toI32();
  budget.setAt = event.block.timestamp;
  budget.setAtBlock = event.block.number;
  budget.transactionHash = event.transaction.hash;
  budget.save();

  // Create config change record
  let changeId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let change = new PaymasterConfigChange(changeId);
  change.paymasterHub = contractAddress;
  change.orgConfig = orgConfigId;
  change.changeType = "BudgetSet";
  change.changedAt = event.block.timestamp;
  change.changedAtBlock = event.block.number;
  change.transactionHash = event.transaction.hash;
  change.save();
}

// 5. FeeCapsSet - Upsert fee caps
export function handleFeeCapsSet(event: FeeCapsSetEvent): void {
  let contractAddress = event.address;
  let orgId = event.params.orgId;
  let orgConfigId = getOrgConfigId(contractAddress, orgId);

  let feeCaps = PaymasterFeeCaps.load(orgConfigId);
  if (!feeCaps) {
    feeCaps = new PaymasterFeeCaps(orgConfigId);
    feeCaps.orgConfig = orgConfigId;
  }

  feeCaps.maxFeePerGas = event.params.maxFeePerGas;
  feeCaps.maxPriorityFeePerGas = event.params.maxPriorityFeePerGas;
  feeCaps.maxCallGas = event.params.maxCallGas.toI32();
  feeCaps.maxVerificationGas = event.params.maxVerificationGas.toI32();
  feeCaps.maxPreVerificationGas = event.params.maxPreVerificationGas.toI32();
  feeCaps.setAt = event.block.timestamp;
  feeCaps.setAtBlock = event.block.number;
  feeCaps.transactionHash = event.transaction.hash;
  feeCaps.save();

  // Create config change record
  let changeId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let change = new PaymasterConfigChange(changeId);
  change.paymasterHub = contractAddress;
  change.orgConfig = orgConfigId;
  change.changeType = "FeeCapsSet";
  change.changedAt = event.block.timestamp;
  change.changedAtBlock = event.block.number;
  change.transactionHash = event.transaction.hash;
  change.save();
}

// 6. PauseSet - Update org config + create pause toggle
export function handlePauseSet(event: PauseSetEvent): void {
  let contractAddress = event.address;
  let orgId = event.params.orgId;
  let orgConfigId = getOrgConfigId(contractAddress, orgId);

  // Update org config
  let orgConfig = PaymasterOrgConfig.load(orgConfigId);
  if (orgConfig) {
    orgConfig.isPaused = event.params.paused;
    orgConfig.save();
  }

  // Create pause toggle record
  let toggleId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let toggle = new PauseToggle(toggleId);
  toggle.orgConfig = orgConfigId;
  toggle.paused = event.params.paused;
  toggle.toggledAt = event.block.timestamp;
  toggle.toggledAtBlock = event.block.number;
  toggle.transactionHash = event.transaction.hash;
  toggle.save();

  // Create config change record
  let changeId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let change = new PaymasterConfigChange(changeId);
  change.paymasterHub = contractAddress;
  change.orgConfig = orgConfigId;
  change.changeType = "PauseSet";
  change.changedAt = event.block.timestamp;
  change.changedAtBlock = event.block.number;
  change.transactionHash = event.transaction.hash;
  change.save();
}

// 7. OperatorHatSet - Update org config
export function handleOperatorHatSet(event: OperatorHatSetEvent): void {
  let contractAddress = event.address;
  let orgId = event.params.orgId;
  let orgConfigId = getOrgConfigId(contractAddress, orgId);

  // Update org config
  let orgConfig = PaymasterOrgConfig.load(orgConfigId);
  if (orgConfig) {
    orgConfig.operatorHatId = event.params.operatorHatId;
    orgConfig.save();
  }

  // Create config change record
  let changeId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let change = new PaymasterConfigChange(changeId);
  change.paymasterHub = contractAddress;
  change.orgConfig = orgConfigId;
  change.changeType = "OperatorHatSet";
  change.changedAt = event.block.timestamp;
  change.changedAtBlock = event.block.number;
  change.transactionHash = event.transaction.hash;
  change.save();
}

// 8. DepositIncrease - Update hub + create deposit event
export function handleDepositIncrease(event: DepositIncreaseEvent): void {
  let contractAddress = event.address;

  // Update hub
  let hub = getOrCreateHub(contractAddress);
  hub.totalDeposit = event.params.newDeposit;
  hub.save();

  // Create deposit event record
  let eventId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let depositEvent = new PaymasterDepositEvent(eventId);
  depositEvent.paymasterHub = contractAddress;
  depositEvent.eventType = "HubDeposit";
  depositEvent.amount = event.params.amount;
  depositEvent.newBalance = event.params.newDeposit;
  depositEvent.eventAt = event.block.timestamp;
  depositEvent.eventAtBlock = event.block.number;
  depositEvent.transactionHash = event.transaction.hash;
  depositEvent.save();
}

// 9. OrgDepositReceived - Update org config + create deposit event
export function handleOrgDepositReceived(event: OrgDepositReceivedEvent): void {
  let contractAddress = event.address;
  let orgId = event.params.orgId;
  let orgConfigId = getOrgConfigId(contractAddress, orgId);

  // Update org config
  let orgConfig = PaymasterOrgConfig.load(orgConfigId);
  if (orgConfig) {
    orgConfig.depositBalance = orgConfig.depositBalance.plus(event.params.amount);
    orgConfig.totalDeposited = orgConfig.totalDeposited.plus(event.params.amount);
    orgConfig.save();
  }

  // Update stats
  let stats = getOrCreateOrgStats(orgConfigId);
  stats.totalDeposited = stats.totalDeposited.plus(event.params.amount);
  stats.lastOperationAt = event.block.timestamp;
  stats.lastOperationAtBlock = event.block.number;
  stats.save();

  // Create deposit event record
  let eventId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let depositEvent = new PaymasterDepositEvent(eventId);
  depositEvent.paymasterHub = contractAddress;
  depositEvent.orgConfig = orgConfigId;
  depositEvent.eventType = "OrgDeposit";
  depositEvent.from = event.params.from;
  depositEvent.amount = event.params.amount;
  if (orgConfig) {
    depositEvent.newBalance = orgConfig.depositBalance;
  }
  depositEvent.eventAt = event.block.timestamp;
  depositEvent.eventAtBlock = event.block.number;
  depositEvent.transactionHash = event.transaction.hash;
  depositEvent.save();
}

// 11. UsageIncreased - Create usage event + update budget
export function handleUsageIncreased(event: UsageIncreasedEvent): void {
  let contractAddress = event.address;
  let orgId = event.params.orgId;
  let subjectKey = event.params.subjectKey;
  let orgConfigId = getOrgConfigId(contractAddress, orgId);
  let budgetId = orgConfigId + "-" + subjectKey.toHexString();

  // Update budget if exists
  let budget = PaymasterBudget.load(budgetId);
  if (budget) {
    budget.usedInEpoch = event.params.usedInEpoch;
    budget.epochStart = event.params.epochStart.toI32();
    budget.totalUsed = budget.totalUsed.plus(event.params.delta);
    budget.save();
  }

  // Update org config total spent (includes solidarity subsidy for backward compat)
  let orgConfig = PaymasterOrgConfig.load(orgConfigId);
  if (orgConfig) {
    orgConfig.totalSpent = orgConfig.totalSpent.plus(event.params.delta);
    orgConfig.depositBalance = orgConfig.depositBalance.minus(event.params.delta);
    orgConfig.save();
  }

  // Update stats
  let stats = getOrCreateOrgStats(orgConfigId);
  stats.totalGasSponsored = stats.totalGasSponsored.plus(event.params.delta);
  stats.totalUserOps = stats.totalUserOps.plus(BigInt.fromI32(1));
  stats.lastOperationAt = event.block.timestamp;
  stats.lastOperationAtBlock = event.block.number;
  stats.save();

  // Create usage event record
  let eventId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let usageEvent = new UsageEvent(eventId);
  usageEvent.orgConfig = orgConfigId;
  if (budget) {
    usageEvent.budget = budgetId;
  }
  usageEvent.subjectKey = subjectKey;
  usageEvent.delta = event.params.delta;
  usageEvent.usedInEpoch = event.params.usedInEpoch;
  usageEvent.epochStart = event.params.epochStart.toI32();
  usageEvent.eventAt = event.block.timestamp;
  usageEvent.eventAtBlock = event.block.number;
  usageEvent.transactionHash = event.transaction.hash;
  usageEvent.save();
}

// 11b. OrgSpendingRecorded - Accurate financial tracking with deposit/solidarity breakdown
export function handleOrgSpendingRecorded(event: OrgSpendingRecordedEvent): void {
  let contractAddress = event.address;
  let orgId = event.params.orgId;
  let orgConfigId = getOrgConfigId(contractAddress, orgId);

  // Only track solidarity received here. Financial fields (totalSpent, depositBalance)
  // are still updated by handleUsageIncreased for backward compatibility with
  // pre-upgrade events. The frontend computes accurate balance using:
  // accurateBalance = totalDeposited - totalSpent + totalSolidarityReceived
  let orgConfig = PaymasterOrgConfig.load(orgConfigId);
  if (orgConfig) {
    orgConfig.totalSolidarityReceived = orgConfig.totalSolidarityReceived.plus(event.params.fromSolidarity);
    orgConfig.save();
  }
}

// 12. SolidarityFeeCollected - Update hub + create solidarity event
export function handleSolidarityFeeCollected(event: SolidarityFeeCollectedEvent): void {
  let contractAddress = event.address;
  let orgId = event.params.orgId;
  let orgConfigId = getOrgConfigId(contractAddress, orgId);

  // Update hub
  let hub = getOrCreateHub(contractAddress);
  hub.solidarityBalance = hub.solidarityBalance.plus(event.params.amount);
  hub.totalFeesCollected = hub.totalFeesCollected.plus(event.params.amount);
  hub.save();

  // Update stats
  let stats = getOrCreateOrgStats(orgConfigId);
  stats.totalSolidarityFeesCollected = stats.totalSolidarityFeesCollected.plus(event.params.amount);
  stats.lastOperationAt = event.block.timestamp;
  stats.lastOperationAtBlock = event.block.number;
  stats.save();

  // Create solidarity event record
  let eventId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let solidarityEvent = new SolidarityEvent(eventId);
  solidarityEvent.paymasterHub = contractAddress;
  solidarityEvent.orgConfig = orgConfigId;
  solidarityEvent.eventType = "FeeCollected";
  solidarityEvent.amount = event.params.amount;
  solidarityEvent.eventAt = event.block.timestamp;
  solidarityEvent.eventAtBlock = event.block.number;
  solidarityEvent.transactionHash = event.transaction.hash;
  solidarityEvent.save();
}

// 19. SolidarityDonationReceived - Update hub + create solidarity event
export function handleSolidarityDonationReceived(event: SolidarityDonationReceivedEvent): void {
  let contractAddress = event.address;

  // Update hub
  let hub = getOrCreateHub(contractAddress);
  hub.solidarityBalance = hub.solidarityBalance.plus(event.params.amount);
  hub.save();

  // Create solidarity event record
  let eventId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let solidarityEvent = new SolidarityEvent(eventId);
  solidarityEvent.paymasterHub = contractAddress;
  solidarityEvent.eventType = "DonationReceived";
  solidarityEvent.from = event.params.from;
  solidarityEvent.amount = event.params.amount;
  solidarityEvent.eventAt = event.block.timestamp;
  solidarityEvent.eventAtBlock = event.block.number;
  solidarityEvent.transactionHash = event.transaction.hash;
  solidarityEvent.save();
}

// 20. OrgBannedFromSolidarity - Update org config + create solidarity event + ban record
export function handleOrgBannedFromSolidarity(event: OrgBannedFromSolidarityEvent): void {
  let contractAddress = event.address;
  let orgId = event.params.orgId;
  let orgConfigId = getOrgConfigId(contractAddress, orgId);

  // Update org config
  let orgConfig = PaymasterOrgConfig.load(orgConfigId);
  if (orgConfig) {
    orgConfig.isBannedFromSolidarity = event.params.banned;
    orgConfig.save();
  }

  // Create solidarity event record
  let eventId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let solidarityEvent = new SolidarityEvent(eventId);
  solidarityEvent.paymasterHub = contractAddress;
  solidarityEvent.orgConfig = orgConfigId;
  solidarityEvent.eventType = event.params.banned ? "OrgBanned" : "OrgUnbanned";
  solidarityEvent.eventAt = event.block.timestamp;
  solidarityEvent.eventAtBlock = event.block.number;
  solidarityEvent.transactionHash = event.transaction.hash;
  solidarityEvent.save();

  // Create ban record
  let banId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let banRecord = new OrgBanRecord(banId);
  banRecord.orgConfig = orgConfigId;
  banRecord.banned = event.params.banned;
  banRecord.bannedAt = event.block.timestamp;
  banRecord.bannedAtBlock = event.block.number;
  banRecord.transactionHash = event.transaction.hash;
  banRecord.save();
}

// 21. GracePeriodConfigUpdated - Update hub + create grace period change
export function handleGracePeriodConfigUpdated(event: GracePeriodConfigUpdatedEvent): void {
  let contractAddress = event.address;

  // Update hub
  let hub = getOrCreateHub(contractAddress);
  hub.gracePeriodDays = event.params.initialGraceDays.toI32();
  hub.maxSpendDuringGrace = event.params.maxSpendDuringGrace;
  hub.minDepositRequired = event.params.minDepositRequired;
  hub.save();

  // Create grace period change record
  let changeId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let change = new GracePeriodChange(changeId);
  change.paymasterHub = contractAddress;
  change.initialGraceDays = event.params.initialGraceDays.toI32();
  change.maxSpendDuringGrace = event.params.maxSpendDuringGrace;
  change.minDepositRequired = event.params.minDepositRequired;
  change.changedAt = event.block.timestamp;
  change.changedAtBlock = event.block.number;
  change.transactionHash = event.transaction.hash;
  change.save();
}

// 23. SolidarityDistributionPaused - Collection-only mode enabled
export function handleSolidarityDistributionPaused(event: SolidarityDistributionPausedEvent): void {
  let hub = getOrCreateHub(event.address);
  hub.solidarityDistributionPaused = true;
  hub.save();
}

// 24. SolidarityDistributionUnpaused - Normal distribution resumed
export function handleSolidarityDistributionUnpaused(event: SolidarityDistributionUnpausedEvent): void {
  let hub = getOrCreateHub(event.address);
  hub.solidarityDistributionPaused = false;
  hub.save();
}

// 25. OnboardingAccountCreated - Successful account onboarding
export function handleOnboardingAccountCreated(event: OnboardingAccountCreatedEvent): void {
  let entityId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let entity = new OnboardingAccount(entityId);
  entity.paymasterHub = event.address;
  entity.account = event.params.account;
  entity.gasCost = event.params.gasCost;
  entity.timestamp = event.block.timestamp;
  entity.blockNumber = event.block.number;
  entity.transactionHash = event.transaction.hash;
  entity.save();
}

/**
 * 26. OnboardingConfigUpdated - Onboarding limits changed.
 *
 * POP #175 inserted `uint8 maxOnboardingsPerAccount` as the THIRD argument, which changed topic0
 * (0x81434e0d… -> 0x118af811…). subgraph.yaml carried the old 4-arg signature until now, so this
 * handler never fired against a post-#175 implementation: the live config updates at gnosis
 * 46714737 and arbitrum 473859884 were both dropped on the floor.
 *
 * maxOnboardingsPerAccount is 0 == UNLIMITED, which is also the honest value for the pre-#175
 * window where the field did not exist — so the deploy-time backfill in poa-manager.ts can seed 0
 * without asserting a cap that was never configured.
 */
export function handleOnboardingConfigUpdated(event: OnboardingConfigUpdatedEvent): void {
  let config = OnboardingConfig.load(event.address);
  if (!config) {
    config = new OnboardingConfig(event.address);
    config.paymasterHub = event.address;
  }
  config.maxGasPerCreation = event.params.maxGasPerCreation;
  config.dailyCreationLimit = event.params.dailyCreationLimit;
  config.maxOnboardingsPerAccount = event.params.maxOnboardingsPerAccount;
  config.enabled = event.params.enabled;
  config.accountRegistry = event.params.accountRegistry;
  config.updatedAt = event.block.timestamp;
  config.blockNumber = event.block.number;
  config.transactionHash = event.transaction.hash;
  config.save();
}

// 27. OrgDeployConfigUpdated - Org deploy sponsorship config changed
export function handleOrgDeployConfigUpdated(event: OrgDeployConfigUpdatedEvent): void {
  let config = OrgDeployConfig.load(event.address);
  if (!config) {
    config = new OrgDeployConfig(event.address);
    config.paymasterHub = event.address;
  }
  config.maxGasPerDeploy = event.params.maxGasPerDeploy;
  config.dailyDeployLimit = event.params.dailyDeployLimit;
  config.maxDeploysPerAccount = event.params.maxDeploysPerAccount;
  config.enabled = event.params.enabled;
  config.orgDeployer = event.params.orgDeployer;
  config.updatedAt = event.block.timestamp;
  config.blockNumber = event.block.number;
  config.transactionHash = event.transaction.hash;
  config.save();
}

// 28. OrgDeploymentSponsored - Free org deployment completed
export function handleOrgDeploymentSponsored(event: OrgDeploymentSponsoredEvent): void {
  let entityId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let entity = new OrgDeploySponsorship(entityId);
  entity.paymasterHub = event.address;
  entity.account = event.params.account;
  entity.gasCost = event.params.gasCost;
  entity.timestamp = event.block.timestamp;
  entity.blockNumber = event.block.number;
  entity.transactionHash = event.transaction.hash;
  entity.save();
}

/**
 * 29. GlobalRuleSet - Upsert a protocol-wide rulebook entry, keyed by (module typeId, selector).
 *
 * HUB-LEVEL: this event carries NO orgId. Do not derive an orgConfigId or load a
 * PaymasterOrgConfig here — there is nothing to load. The accompanying PaymasterConfigChange
 * deliberately leaves `orgConfig` unset; the field is nullable for exactly this case, the same
 * way hub-level PaymasterDepositEvent rows use it.
 *
 * allowed=false is a REMOVAL (the contract deletes the storage entry and pops it from the
 * enumeration, forcing maxCallGasHint to 0 in the emit). The row is tombstoned rather than
 * removed so history and reverse lookups stay queryable. The write is a pure keyed upsert and
 * is therefore idempotent.
 */
export function handleGlobalRuleSet(event: GlobalRuleSetEvent): void {
  let contractAddress = event.address;
  let typeId = event.params.typeId;
  let selector = event.params.selector;

  // The hub entity is the only anchor a hub-level event has; make sure it exists.
  let hub = getOrCreateHub(contractAddress);
  hub.save();

  // Global rule ID: paymasterHub-typeId-selector (no orgId — this is protocol-scoped)
  let globalRuleId =
    contractAddress.toHexString() + "-" + typeId.toHexString() + "-" + selector.toHexString();

  let globalRule = PaymasterGlobalRule.load(globalRuleId);
  if (!globalRule) {
    globalRule = new PaymasterGlobalRule(globalRuleId);
    globalRule.paymasterHub = contractAddress;
    globalRule.typeId = typeId;
    globalRule.selector = selector;
  }

  globalRule.moduleName = moduleTypeName(typeId);
  globalRule.allowed = event.params.allowed;
  globalRule.maxCallGasHint = event.params.maxCallGasHint.toI32();
  globalRule.setAt = event.block.timestamp;
  globalRule.setAtBlock = event.block.number;
  globalRule.transactionHash = event.transaction.hash;
  globalRule.save();

  // Create config change record (orgConfig stays null — hub-level change)
  let changeId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let change = new PaymasterConfigChange(changeId);
  change.paymasterHub = contractAddress;
  change.orgConfig = null; // hub-level change — GlobalRuleSet carries no orgId
  change.changeType = "GlobalRuleSet";
  change.changedAt = event.block.timestamp;
  change.changedAtBlock = event.block.number;
  change.transactionHash = event.transaction.hash;
  change.save();
}

/**
 * 30. TargetTypeSet - Map one of an org's target addresses to a module typeId.
 *
 * Until a target is typed, the org resolves NO global rules for it (step 5 of the resolution
 * algorithm on PaymasterGlobalRule) — the rulebook is inert by default. typeId == bytes32(0)
 * CLEARS the mapping.
 *
 * Keyed by (hub, orgId, target) and never by target alone: UniversalAccountRegistry and
 * OrgRegistry are chain-shared singletons that every org target-types under its own orgId.
 */
export function handleTargetTypeSet(event: TargetTypeSetEvent): void {
  let contractAddress = event.address;
  let orgId = event.params.orgId;
  let target = event.params.target;
  let typeId = event.params.typeId;
  let orgConfigId = getOrgConfigId(contractAddress, orgId);

  // Target type ID: paymasterHub-orgId-target
  let targetTypeId = orgConfigId + "-" + target.toHexString();

  let targetType = PaymasterTargetType.load(targetTypeId);
  if (!targetType) {
    targetType = new PaymasterTargetType(targetTypeId);
    targetType.orgConfig = orgConfigId;
    targetType.target = target;
  }

  targetType.typeId = typeId;
  targetType.moduleName = moduleTypeName(typeId);
  targetType.cleared = typeId.toHexString() == ZERO_TYPE_ID_HEX;
  targetType.setAt = event.block.timestamp;
  targetType.setAtBlock = event.block.number;
  targetType.transactionHash = event.transaction.hash;
  targetType.save();

  // Create config change record
  let changeId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let change = new PaymasterConfigChange(changeId);
  change.paymasterHub = contractAddress;
  change.orgConfig = orgConfigId;
  change.changeType = "TargetTypeSet";
  change.changedAt = event.block.timestamp;
  change.changedAtBlock = event.block.number;
  change.transactionHash = event.transaction.hash;
  change.save();
}

/**
 * 31. RulesModeSet - Switch an org between Mirror (0) and Static (1).
 *
 * Emitted UNCONDITIONALLY by the v20 registerAndConfigureOrg overload, even for mode 0 where no
 * storage write occurs, specifically so indexers see the deploy-time value. It is NOT emitted by
 * registerOrg or the legacy overload, so every org that predates the v20 upgrade has zero of
 * these events and keeps the "Mirror" default assigned in handleOrgRegistered.
 *
 * mode > 1 reverts on-chain (InvalidRulesMode), so only 0 and 1 can reach us. Anything other
 * than 0 maps to Static, which is the fail-closed direction (Static = local rules only).
 */
export function handleRulesModeSet(event: RulesModeSetEvent): void {
  let contractAddress = event.address;
  let orgId = event.params.orgId;
  let orgConfigId = getOrgConfigId(contractAddress, orgId);

  // uint8 is generated as i32 — use it bare, no .toI32()
  let modeRaw = event.params.mode;
  let modeName = modeRaw == 0 ? "Mirror" : "Static";

  let orgConfig = PaymasterOrgConfig.load(orgConfigId);
  if (orgConfig) {
    orgConfig.rulesMode = modeName;
    orgConfig.save();
  }

  // Immutable history: rulesMode is a single overwritten field on PaymasterOrgConfig, so it
  // needs its own trail — same reasoning as PauseToggle and OrgBanRecord.
  let recordId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let modeChange = new PaymasterRulesModeChange(recordId);
  modeChange.orgConfig = orgConfigId;
  modeChange.mode = modeName;
  modeChange.modeRaw = modeRaw;
  modeChange.changedAt = event.block.timestamp;
  modeChange.changedAtBlock = event.block.number;
  modeChange.transactionHash = event.transaction.hash;
  modeChange.save();

  // Create config change record (same id value, different entity type — handlePauseSet does the
  // same for PauseToggle vs PaymasterConfigChange)
  let changeId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let change = new PaymasterConfigChange(changeId);
  change.paymasterHub = contractAddress;
  change.orgConfig = orgConfigId;
  change.changeType = "RulesModeSet";
  change.changedAt = event.block.timestamp;
  change.changedAtBlock = event.block.number;
  change.transactionHash = event.transaction.hash;
  change.save();
}

/**
 * 32. GlobalRuleBlockSet - Per-org veto of one (target, selector) global rule.
 *
 * Three emitters:
 *  a) setGlobalRuleBlock(...) directly — emits UNCONDITIONALLY, even when the value does not
 *     change, so this handler must be idempotent. It is: a pure keyed boolean upsert.
 *  b) setRule / setRulesBatch with allowed=false — emits blocked=true as a SEPARATE log in the
 *     same transaction, at a HIGHER logIndex than its paired RuleSet.
 *  c) setRule(allowed=true) and clearRule — emit blocked=false to clear a standing block.
 *
 * ORDERING: the paired RuleSet is handled by handleRuleSet and writes PaymasterRule; this
 * handler writes PaymasterGlobalRuleBlock. Different entities, so the two cannot clobber each
 * other and the final state is correct regardless of dispatch order. That is precisely why
 * `blocked` is a separate entity rather than a field on PaymasterRule.
 *
 * A block can exist with NO PaymasterRule row: the v20 migration reconstructs pre-v20 denials by
 * emitting blocks alone. Do not assume a rule row exists.
 */
export function handleGlobalRuleBlockSet(event: GlobalRuleBlockSetEvent): void {
  let contractAddress = event.address;
  let orgId = event.params.orgId;
  let target = event.params.target;
  let selector = event.params.selector;
  let orgConfigId = getOrgConfigId(contractAddress, orgId);

  // Block ID: paymasterHub-orgId-target-selector — deliberately the SAME string as the
  // PaymasterRule id for this pair, so a client can fetch both halves with one key.
  let blockId = orgConfigId + "-" + target.toHexString() + "-" + selector.toHexString();

  let ruleBlock = PaymasterGlobalRuleBlock.load(blockId);
  if (!ruleBlock) {
    ruleBlock = new PaymasterGlobalRuleBlock(blockId);
    ruleBlock.orgConfig = orgConfigId;
    ruleBlock.target = target;
    ruleBlock.selector = selector;
  }

  ruleBlock.blocked = event.params.blocked;
  ruleBlock.setAt = event.block.timestamp;
  ruleBlock.setAtBlock = event.block.number;
  ruleBlock.transactionHash = event.transaction.hash;
  ruleBlock.save();

  // Create config change record
  let changeId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let change = new PaymasterConfigChange(changeId);
  change.paymasterHub = contractAddress;
  change.orgConfig = orgConfigId;
  change.changeType = "GlobalRuleBlockSet";
  change.changedAt = event.block.timestamp;
  change.changedAtBlock = event.block.number;
  change.transactionHash = event.transaction.hash;
  change.save();
}
