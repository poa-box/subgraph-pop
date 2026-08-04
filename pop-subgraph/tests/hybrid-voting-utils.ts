import { newMockEvent } from "matchstick-as";
import { ethereum, Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
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
  ClassesReplaced
} from "../generated/templates/HybridVoting/HybridVoting";

/**
 * Creates a mock Initialized event
 */
export function createInitializedEvent(version: BigInt): Initialized {
  let event = changetype<Initialized>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("version", ethereum.Value.fromUnsignedBigInt(version))
  );

  return event;
}

/**
 * Creates a mock ExecutorUpdated event
 */
export function createExecutorUpdatedEvent(newExec: Address): ExecutorUpdated {
  let event = changetype<ExecutorUpdated>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("newExec", ethereum.Value.fromAddress(newExec))
  );

  return event;
}

/**
 * Creates a mock ThresholdPctSet event
 */
export function createThresholdPctSetEvent(pct: i32): ThresholdPctSet {
  let event = changetype<ThresholdPctSet>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("pct", ethereum.Value.fromI32(pct))
  );

  return event;
}

/**
 * Creates a mock QuorumSet event (uint32 voter count)
 */
export function createQuorumSetEvent(quorum: i32): QuorumSet {
  let event = changetype<QuorumSet>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("quorum", ethereum.Value.fromI32(quorum))
  );

  return event;
}

/**
 * Creates a mock HatSet event
 */
export function createHatSetEvent(
  hatType: i32,
  hat: BigInt,
  allowed: boolean
): HatSet {
  let event = changetype<HatSet>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("hatType", ethereum.Value.fromI32(hatType))
  );
  event.parameters.push(
    new ethereum.EventParam("hat", ethereum.Value.fromUnsignedBigInt(hat))
  );
  event.parameters.push(
    new ethereum.EventParam("allowed", ethereum.Value.fromBoolean(allowed))
  );

  return event;
}

/**
 * Creates a mock HatToggled event
 */
export function createHatToggledEvent(
  hatId: BigInt,
  allowed: boolean
): HatToggled {
  let event = changetype<HatToggled>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("hatId", ethereum.Value.fromUnsignedBigInt(hatId))
  );
  event.parameters.push(
    new ethereum.EventParam("allowed", ethereum.Value.fromBoolean(allowed))
  );

  return event;
}

/**
 * Creates a mock NewProposal event
 * New signature: NewProposal(uint256 id, bytes title, bytes32 descriptionHash, uint8 numOptions, uint64 endTs, uint64 created)
 */
export function createNewProposalEvent(
  id: BigInt,
  title: Bytes,
  descriptionHash: Bytes,
  numOptions: i32,
  endTs: i64,
  created: i64
): NewProposal {
  let event = changetype<NewProposal>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(id))
  );
  event.parameters.push(
    new ethereum.EventParam("title", ethereum.Value.fromBytes(title))
  );
  event.parameters.push(
    new ethereum.EventParam("descriptionHash", ethereum.Value.fromFixedBytes(descriptionHash))
  );
  event.parameters.push(
    new ethereum.EventParam("numOptions", ethereum.Value.fromI32(numOptions))
  );
  event.parameters.push(
    new ethereum.EventParam("endTs", ethereum.Value.fromI32(endTs as i32))
  );
  event.parameters.push(
    new ethereum.EventParam("created", ethereum.Value.fromI32(created as i32))
  );

  return event;
}

/**
 * Creates a mock NewHatProposal event
 * New signature: NewHatProposal(uint256 id, bytes title, bytes32 descriptionHash, uint8 numOptions, uint64 endTs, uint64 created, uint256[] hatIds)
 */
export function createNewHatProposalEvent(
  id: BigInt,
  title: Bytes,
  descriptionHash: Bytes,
  numOptions: i32,
  endTs: i64,
  created: i64,
  hatIds: BigInt[]
): NewHatProposal {
  let event = changetype<NewHatProposal>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(id))
  );
  event.parameters.push(
    new ethereum.EventParam("title", ethereum.Value.fromBytes(title))
  );
  event.parameters.push(
    new ethereum.EventParam("descriptionHash", ethereum.Value.fromFixedBytes(descriptionHash))
  );
  event.parameters.push(
    new ethereum.EventParam("numOptions", ethereum.Value.fromI32(numOptions))
  );
  event.parameters.push(
    new ethereum.EventParam("endTs", ethereum.Value.fromI32(endTs as i32))
  );
  event.parameters.push(
    new ethereum.EventParam("created", ethereum.Value.fromI32(created as i32))
  );
  event.parameters.push(
    new ethereum.EventParam("hatIds", ethereum.Value.fromUnsignedBigIntArray(hatIds))
  );

  return event;
}

/**
 * Creates a mock VoteCast event
 */
export function createVoteCastEvent(
  id: BigInt,
  voter: Address,
  idxs: i32[],
  weights: i32[],
  classRawPowers: BigInt[],
  timestamp: i64
): VoteCast {
  let event = changetype<VoteCast>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(id))
  );
  event.parameters.push(
    new ethereum.EventParam("voter", ethereum.Value.fromAddress(voter))
  );
  event.parameters.push(
    new ethereum.EventParam("idxs", ethereum.Value.fromI32Array(idxs))
  );
  event.parameters.push(
    new ethereum.EventParam("weights", ethereum.Value.fromI32Array(weights))
  );
  event.parameters.push(
    new ethereum.EventParam("classRawPowers", ethereum.Value.fromUnsignedBigIntArray(classRawPowers))
  );
  event.parameters.push(
    new ethereum.EventParam("timestamp", ethereum.Value.fromI32(timestamp as i32))
  );

  return event;
}

/**
 * Creates a mock Winner event
 */
export function createWinnerEvent(
  id: BigInt,
  winningIdx: BigInt,
  valid: boolean,
  executed: boolean,
  timestamp: i64
): Winner {
  let event = changetype<Winner>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(id))
  );
  event.parameters.push(
    new ethereum.EventParam("winningIdx", ethereum.Value.fromUnsignedBigInt(winningIdx))
  );
  event.parameters.push(
    new ethereum.EventParam("valid", ethereum.Value.fromBoolean(valid))
  );
  event.parameters.push(
    new ethereum.EventParam("executed", ethereum.Value.fromBoolean(executed))
  );
  event.parameters.push(
    new ethereum.EventParam("timestamp", ethereum.Value.fromI32(timestamp as i32))
  );

  return event;
}

/**
 * Creates a mock ProposalExecuted event
 */
export function createProposalExecutedEvent(
  id: BigInt,
  winningIdx: BigInt,
  numCalls: BigInt
): ProposalExecuted {
  let event = changetype<ProposalExecuted>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(id))
  );
  event.parameters.push(
    new ethereum.EventParam("winningIdx", ethereum.Value.fromUnsignedBigInt(winningIdx))
  );
  event.parameters.push(
    new ethereum.EventParam("numCalls", ethereum.Value.fromUnsignedBigInt(numCalls))
  );

  return event;
}

/**
 * Builds one ClassConfig tuple: (strategy, slicePct, quadratic, minBalance, asset, hatIds).
 * strategy: 0 = DIRECT, 1 = ERC20_BAL.
 */
export function createClassConfig(
  strategy: i32,
  slicePct: i32,
  quadratic: boolean,
  minBalance: BigInt,
  asset: Address,
  hatIds: BigInt[]
): ethereum.Tuple {
  let classConfig = new ethereum.Tuple(6);
  classConfig[0] = ethereum.Value.fromI32(strategy);
  classConfig[1] = ethereum.Value.fromI32(slicePct);
  classConfig[2] = ethereum.Value.fromBoolean(quadratic);
  classConfig[3] = ethereum.Value.fromUnsignedBigInt(minBalance);
  classConfig[4] = ethereum.Value.fromAddress(asset);
  classConfig[5] = ethereum.Value.fromUnsignedBigIntArray(hatIds);
  return classConfig;
}

/**
 * Creates a mock ClassesReplaced event carrying a caller-supplied class list. Supersession
 * depends on how many rows a version has (a shrinking config leaves rows with no successor id),
 * so the count can't stay pinned at 2.
 */
export function createClassesReplacedEventWithClasses(
  version: BigInt,
  classesHash: Bytes,
  timestamp: i64,
  classConfigs: ethereum.Tuple[]
): ClassesReplaced {
  let event = changetype<ClassesReplaced>(newMockEvent());

  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("version", ethereum.Value.fromUnsignedBigInt(version))
  );
  event.parameters.push(
    new ethereum.EventParam("classesHash", ethereum.Value.fromFixedBytes(classesHash))
  );
  event.parameters.push(
    new ethereum.EventParam("classes", ethereum.Value.fromTupleArray(classConfigs))
  );
  event.parameters.push(
    new ethereum.EventParam("timestamp", ethereum.Value.fromI32(timestamp as i32))
  );

  return event;
}

/**
 * Creates a mock ClassesReplaced event with 2 sample classes
 * Class 0: DIRECT strategy, 60%, no quadratic
 * Class 1: ERC20_BAL strategy, 40%, quadratic
 */
export function createClassesReplacedEvent(
  version: BigInt,
  classesHash: Bytes,
  timestamp: i64
): ClassesReplaced {
  // ClassConfig struct: (strategy, slicePct, quadratic, minBalance, asset, hatIds)
  let classConfigs: ethereum.Tuple[] = [];

  // Class 0: DIRECT strategy, 60%, no quadratic, no min balance, zero address asset
  classConfigs.push(
    createClassConfig(0, 60, false, BigInt.fromI32(0), Address.zero(), [BigInt.fromI32(1001)])
  );

  // Class 1: ERC20_BAL strategy, 40%, quadratic, 1 ETH min balance
  classConfigs.push(
    createClassConfig(
      1,
      40,
      true,
      BigInt.fromString("1000000000000000000"),
      Address.fromString("0x0000000000000000000000000000000000000099"),
      [BigInt.fromI32(1002)]
    )
  );

  return createClassesReplacedEventWithClasses(version, classesHash, timestamp, classConfigs);
}
