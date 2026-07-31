import { Address, BigInt, Bytes, dataSource } from "@graphprotocol/graph-ts";
import {
  BeaconCreated as BeaconCreatedEvent,
  BeaconUpgraded as BeaconUpgradedEvent,
  RegistryUpdated as RegistryUpdatedEvent,
  InfrastructureDeployed as InfrastructureDeployedEvent
} from "../generated/PoaManager/PoaManager";
import { PaymasterHub as PaymasterHubContract } from "../generated/templates/PaymasterHub/PaymasterHub";
import {
  PoaManagerContract,
  Beacon,
  BeaconUpgradeEvent,
  RegistryUpdate,
  PasskeyAccountFactory,
  UniversalAccountRegistry,
  PaymasterHubContract as PaymasterHubEntity,
  OnboardingConfig,
  OrgDeployConfig
} from "../generated/schema";
import { OrgDeployer as OrgDeployerTemplate } from "../generated/templates";
import { OrgRegistry as OrgRegistryTemplate } from "../generated/templates";
import { PaymasterHub as PaymasterHubTemplate } from "../generated/templates";
import { UniversalAccountRegistry as UniversalAccountRegistryTemplate } from "../generated/templates";
import { PasskeyAccountFactory as PasskeyAccountFactoryTemplate } from "../generated/templates";
import { ensureImplementationRegistry } from "./implementation-registry";

function getOrCreatePoaManager(
  address: Bytes,
  timestamp: BigInt,
  blockNumber: BigInt
): PoaManagerContract {
  let poaManager = PoaManagerContract.load(address);
  if (!poaManager) {
    poaManager = new PoaManagerContract(address);
    poaManager.registry = Bytes.empty();
    poaManager.beaconCount = BigInt.fromI32(0);
    poaManager.createdAt = timestamp;
    poaManager.createdAtBlock = blockNumber;
    poaManager.save();
  }
  return poaManager;
}

export function handleBeaconCreated(event: BeaconCreatedEvent): void {
  let contractAddress = event.address;

  // Get or create PoaManagerContract
  let poaManager = getOrCreatePoaManager(
    contractAddress,
    event.block.timestamp,
    event.block.number
  );
  poaManager.beaconCount = poaManager.beaconCount.plus(BigInt.fromI32(1));
  poaManager.save();

  // Create Beacon entity using network-typeId as ID (chain-aware to prevent collisions)
  let typeIdHex = event.params.typeId.toHexString();
  let beaconId = dataSource.network() + "-" + typeIdHex;
  let beacon = new Beacon(beaconId);
  beacon.poaManager = contractAddress;
  beacon.typeId = event.params.typeId;
  beacon.typeName = event.params.typeName;
  beacon.beaconAddress = event.params.beacon;
  beacon.currentImplementation = event.params.implementation;
  beacon.version = "v1";
  beacon.createdAt = event.block.timestamp;
  beacon.createdAtBlock = event.block.number;
  beacon.updatedAt = event.block.timestamp;
  beacon.updatedAtBlock = event.block.number;
  beacon.transactionHash = event.transaction.hash;
  beacon.save();
}

export function handleBeaconUpgraded(event: BeaconUpgradedEvent): void {
  let contractAddress = event.address;
  let typeIdHex = event.params.typeId.toHexString();
  let beaconId = dataSource.network() + "-" + typeIdHex;

  // Update Beacon entity
  let beacon = Beacon.load(beaconId);
  if (beacon) {
    beacon.currentImplementation = event.params.newImplementation;
    beacon.version = event.params.version;
    beacon.updatedAt = event.block.timestamp;
    beacon.updatedAtBlock = event.block.number;
    beacon.save();
  }

  // Create upgrade history record
  let upgradeId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let upgrade = new BeaconUpgradeEvent(upgradeId);
  upgrade.poaManager = contractAddress;
  upgrade.beacon = beaconId;
  upgrade.typeId = event.params.typeId;
  upgrade.newImplementation = event.params.newImplementation;
  upgrade.version = event.params.version;
  upgrade.upgradedAt = event.block.timestamp;
  upgrade.upgradedAtBlock = event.block.number;
  upgrade.transactionHash = event.transaction.hash;
  upgrade.save();
}

export function handleRegistryUpdated(event: RegistryUpdatedEvent): void {
  let contractAddress = event.address;

  // Update PoaManagerContract
  let poaManager = getOrCreatePoaManager(
    contractAddress,
    event.block.timestamp,
    event.block.number
  );
  poaManager.registry = event.params.newRegistry;
  poaManager.save();

  // Start watching the registry itself, so ImplementationVersion keeps resolving after a
  // governance repoint to a freshly deployed ImplementationRegistry. No-op when the address is
  // already known (including the one hard-wired as a static dataSource).
  ensureImplementationRegistry(
    event.params.newRegistry,
    event.block.timestamp,
    event.block.number
  );

  // Create registry update record
  let updateId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let update = new RegistryUpdate(updateId);
  update.poaManager = contractAddress;
  update.oldRegistry = event.params.oldRegistry;
  update.newRegistry = event.params.newRegistry;
  update.updatedAt = event.block.timestamp;
  update.updatedAtBlock = event.block.number;
  update.transactionHash = event.transaction.hash;
  update.save();
}

export function handleInfrastructureDeployed(event: InfrastructureDeployedEvent): void {
  let contractAddress = event.address;

  // Get or create PoaManagerContract and store infrastructure proxy addresses
  let poaManager = getOrCreatePoaManager(
    contractAddress,
    event.block.timestamp,
    event.block.number
  );
  poaManager.orgDeployerProxy = event.params.orgDeployer;
  poaManager.orgRegistryProxy = event.params.orgRegistry;
  poaManager.paymasterHubProxy = event.params.paymasterHub;
  poaManager.globalAccountRegistryProxy = event.params.globalAccountRegistry;
  poaManager.passkeyAccountFactoryProxy = event.params.passkeyAccountFactoryBeacon;
  poaManager.save();

  // Create data source templates for infrastructure contracts
  // This enables dynamic discovery of infrastructure proxy addresses
  OrgDeployerTemplate.create(event.params.orgDeployer);
  OrgRegistryTemplate.create(event.params.orgRegistry);
  PaymasterHubTemplate.create(event.params.paymasterHub);
  UniversalAccountRegistryTemplate.create(event.params.globalAccountRegistry);

  // Create PaymasterHubContract entity and sync initial solidarity balance
  // Note: The PaymasterInitialized and SolidarityDonationReceived events are
  // emitted when the contract is deployed/seeded, which happens BEFORE
  // InfrastructureDeployed. Since the template doesn't exist yet at that time,
  // those handlers are never called. We create the entity here and read
  // the current solidarity balance from the contract to catch up.
  let paymasterAddress = event.params.paymasterHub;
  let paymasterContract = PaymasterHubContract.bind(Address.fromBytes(paymasterAddress));

  let hub = new PaymasterHubEntity(paymasterAddress);
  hub.totalDeposit = BigInt.fromI32(0);
  hub.solidarityBalance = BigInt.fromI32(0);
  hub.totalFeesCollected = BigInt.fromI32(0);
  hub.gracePeriodDays = 90;
  hub.maxSpendDuringGrace = BigInt.fromString("10000000000000000"); // 0.01 ETH
  hub.minDepositRequired = BigInt.fromString("3000000000000000"); // 0.003 ETH
  hub.solidarityDistributionPaused = false;
  hub.createdAt = event.block.timestamp;
  hub.createdAtBlock = event.block.number;
  hub.transactionHash = event.transaction.hash;

  // Read initialization values from the contract since PaymasterInitialized
  // was also emitted before the template existed
  let entryPointResult = paymasterContract.try_ENTRY_POINT();
  hub.entryPoint = entryPointResult.reverted ? Address.zero() : entryPointResult.value;
  let hatsResult = paymasterContract.try_HATS();
  hub.hats = hatsResult.reverted ? Address.zero() : hatsResult.value;
  let poaManagerResult = paymasterContract.try_POA_MANAGER();
  hub.poaManager = poaManagerResult.reverted ? Address.zero() : poaManagerResult.value;

  // Read actual solidarity balance from the contract to capture any donations
  // that occurred before the template was created (e.g. donateToSolidarity
  // called during DeployInfrastructure, before registerInfrastructure)
  let fundResult = paymasterContract.try_getSolidarityFund();
  if (!fundResult.reverted) {
    hub.solidarityBalance = fundResult.value.balance;
  }

  // Read grace period config (also set before template existed)
  let graceResult = paymasterContract.try_getGracePeriodConfig();
  if (!graceResult.reverted) {
    hub.gracePeriodDays = graceResult.value.initialGraceDays.toI32();
    hub.maxSpendDuringGrace = graceResult.value.maxSpendDuringGrace;
    hub.minDepositRequired = graceResult.value.minDepositRequired;
  }

  hub.save();

  // Read onboarding config (set via adminCall before template existed)
  let onboardingResult = paymasterContract.try_getOnboardingConfig();
  if (!onboardingResult.reverted) {
    let onboardingConfig = new OnboardingConfig(paymasterAddress);
    onboardingConfig.paymasterHub = paymasterAddress;
    onboardingConfig.maxGasPerCreation = onboardingResult.value.maxGasPerCreation;
    onboardingConfig.dailyCreationLimit = onboardingResult.value.dailyCreationLimit;
    onboardingConfig.enabled = onboardingResult.value.enabled;
    onboardingConfig.accountRegistry = onboardingResult.value.accountRegistry;
    onboardingConfig.updatedAt = event.block.timestamp;
    onboardingConfig.blockNumber = event.block.number;
    onboardingConfig.transactionHash = event.transaction.hash;
    onboardingConfig.save();
  }

  // Read org deploy config (set via adminCall before template existed)
  let orgDeployResult = paymasterContract.try_getOrgDeployConfig();
  if (!orgDeployResult.reverted) {
    let orgDeployConfig = new OrgDeployConfig(paymasterAddress);
    orgDeployConfig.paymasterHub = paymasterAddress;
    orgDeployConfig.maxGasPerDeploy = orgDeployResult.value.maxGasPerDeploy;
    orgDeployConfig.dailyDeployLimit = orgDeployResult.value.dailyDeployLimit;
    orgDeployConfig.maxDeploysPerAccount = orgDeployResult.value.maxDeploysPerAccount;
    orgDeployConfig.enabled = orgDeployResult.value.enabled;
    orgDeployConfig.orgDeployer = orgDeployResult.value.orgDeployer;
    orgDeployConfig.updatedAt = event.block.timestamp;
    orgDeployConfig.blockNumber = event.block.number;
    orgDeployConfig.transactionHash = event.transaction.hash;
    orgDeployConfig.save();
  }

  // Create UniversalAccountRegistry entity
  // Note: The Initialized event is emitted when the contract is deployed,
  // which happens BEFORE InfrastructureDeployed. Since the template doesn't
  // exist yet at that time, handleInitialized is never called. We create
  // the entity here instead.
  let registryAddress = event.params.globalAccountRegistry;
  let registry = new UniversalAccountRegistry(registryAddress);
  registry.owner = Address.zero(); // Will be updated if OwnershipTransferred event is captured
  registry.totalAccounts = BigInt.fromI32(0);
  registry.createdAt = event.block.timestamp;
  registry.createdAtBlock = event.block.number;
  registry.save();

  // Create PasskeyAccountFactory entity and data source template
  let passkeyFactoryAddress = event.params.passkeyAccountFactoryBeacon;
  let factory = new PasskeyAccountFactory(passkeyFactoryAddress);
  factory.poaManager = event.address; // The PoaManager that deployed it
  factory.accountBeacon = null; // No event to track this - set at deployment
  factory.poaGuardian = Address.zero(); // Will be set via GlobalConfigUpdated event
  factory.recoveryDelay = BigInt.fromI32(604800); // 7 days default
  factory.maxCredentialsPerAccount = 10; // default
  factory.paused = false;
  factory.createdAt = event.block.timestamp;
  factory.blockNumber = event.block.number;
  factory.save();

  PasskeyAccountFactoryTemplate.create(passkeyFactoryAddress);
}
