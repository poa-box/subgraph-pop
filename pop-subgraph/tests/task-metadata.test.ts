import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  dataSourceMock
} from "matchstick-as/assembly/index";
import { Bytes, DataSourceContext } from "@graphprotocol/graph-ts";
import { TaskMetadata } from "../generated/schema";
import { handleTaskMetadata } from "../src/task-metadata";

// Helper to convert a bytes32 sha256 digest to an IPFS CIDv0 (matches the
// TaskMetadata entity ID component the handler derives from dataSource.stringParam()).
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

// Task entity id (taskManager-taskId), as passed in the data-source context.
const TASK_ENTITY_ID = "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1";

// Sets up the IPFS data source mock (CID stringParam + taskId context) the way
// handleTaskMetadata reads them, then returns the derived TaskMetadata id (taskId-CID).
function mockTaskMetadataSource(seedHex: string): string {
  let cid = bytes32ToCid(Bytes.fromHexString(seedHex));
  let context = new DataSourceContext();
  context.setString("taskId", TASK_ENTITY_ID);
  dataSourceMock.setAddressAndContext(cid, context);
  return TASK_ENTITY_ID + "-" + cid;
}

describe("TaskMetadata IPFS Handler — dueDate (v6 soft deadline)", () => {
  afterEach(() => {
    clearStore();
    dataSourceMock.resetValues();
  });

  test("Parses dueDate number into BigInt", () => {
    let id = mockTaskMetadataSource(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );

    let jsonContent =
      '{"name":"Dated task","description":"has a soft deadline","difficulty":"easy","estHours":2,"dueDate":1768000000}';
    handleTaskMetadata(Bytes.fromUTF8(jsonContent));

    assert.entityCount("TaskMetadata", 1);
    assert.fieldEquals("TaskMetadata", id, "name", "Dated task");
    assert.fieldEquals("TaskMetadata", id, "dueDate", "1768000000");
  });

  test("Missing dueDate leaves the field null, other fields still parse", () => {
    let id = mockTaskMetadataSource(
      "0x2234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );

    let jsonContent = '{"name":"Undated task","description":"no deadline"}';
    handleTaskMetadata(Bytes.fromUTF8(jsonContent));

    assert.fieldEquals("TaskMetadata", id, "name", "Undated task");
    let meta = TaskMetadata.load(id)!;
    assert.assertTrue(meta.dueDate === null);
  });

  test("Wrong-typed dueDate (string) is ignored", () => {
    let id = mockTaskMetadataSource(
      "0x3234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );

    let jsonContent = '{"name":"Stringy","dueDate":"tomorrow"}';
    handleTaskMetadata(Bytes.fromUTF8(jsonContent));

    assert.fieldEquals("TaskMetadata", id, "name", "Stringy");
    let meta = TaskMetadata.load(id)!;
    assert.assertTrue(meta.dueDate === null);
  });

  // Regression: IPFS content is caller-supplied, and AssemblyScript's f64.toString() emits
  // exponent notation for small/large magnitudes and "NaN"/"Infinity" for non-finite values.
  // None of those contain a ".", so the old dot-stripping idiom passed them straight to
  // BigInt.fromString, which ABORTS on the first non-digit — halting indexing for the whole
  // subgraph. jsonToBigInt now rejects them and leaves the field null.
  test("Exponent-notation dueDate is rejected, not aborted on", () => {
    let id = mockTaskMetadataSource(
      "0x5234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );

    // 1e-7 renders as "1e-7": no ".", so the old code called BigInt.fromString("1e-7").
    let jsonContent = '{"name":"Exponent","dueDate":0.0000001}';
    handleTaskMetadata(Bytes.fromUTF8(jsonContent));

    // Reaching this line at all is the regression: the old code aborted the mapping here.
    assert.fieldEquals("TaskMetadata", id, "name", "Exponent");
    let meta = TaskMetadata.load(id);
    assert.assertTrue(meta !== null);
    assert.assertTrue(meta!.dueDate === null);
  });

  test("Very large dueDate is rejected, not aborted on", () => {
    let id = mockTaskMetadataSource(
      "0x6234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );

    // 1e21 renders as "1e+21".
    let jsonContent = '{"name":"Huge","dueDate":1000000000000000000000}';
    handleTaskMetadata(Bytes.fromUTF8(jsonContent));

    assert.fieldEquals("TaskMetadata", id, "name", "Huge");
    let hugeMeta = TaskMetadata.load(id);
    assert.assertTrue(hugeMeta !== null);
    assert.assertTrue(hugeMeta!.dueDate === null);
  });

  test("Negative dueDate still parses", () => {
    let id = mockTaskMetadataSource(
      "0x7234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );

    let jsonContent = '{"name":"Negative","dueDate":-42.9}';
    handleTaskMetadata(Bytes.fromUTF8(jsonContent));

    assert.fieldEquals("TaskMetadata", id, "dueDate", "-42");
  });

  test("Fractional dueDate is truncated", () => {
    let id = mockTaskMetadataSource(
      "0x4234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );

    let jsonContent = '{"name":"Fractional","dueDate":1768000000.9}';
    handleTaskMetadata(Bytes.fromUTF8(jsonContent));

    assert.fieldEquals("TaskMetadata", id, "dueDate", "1768000000");
  });
});
