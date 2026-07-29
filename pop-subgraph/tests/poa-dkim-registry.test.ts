import { assert, describe, test, clearStore, afterEach } from "matchstick-as/assembly/index";
import { Address, Bytes, BigInt } from "@graphprotocol/graph-ts";
import {
  handleKeyHashSet,
  handleKeyHashRevoked,
  handleDkimOwnershipTransferred
} from "../src/poa-dkim-registry";
import {
  createKeyHashSetEvent,
  createKeyHashRevokedEvent,
  createDkimOwnershipTransferredEvent
} from "./poa-dkim-registry-utils";

const REGISTRY = "0x00000000000000000000000000000000000000dd";
// The production Poseidon commitment of "gmail.com" (the circuit's fromDomainHash), lifted from
// the contracts repo's CeremonyDeployTest6Gnosis.s.sol. Using a real one documents that this
// field is Poseidon, not keccak — a keccak-keyed entry can never match a live claim.
const GMAIL_POSEIDON = "0x14d46e073cbff5944a738ea295de6c7447606fa5a270571229d8a4b1e7ca77e5";
const KEY_HASH = "0x280b10886d6d3cb6a9f870d942996b420bbfc51e3bd1f430e18690a6859b6d8f";
const OTHER_KEY = "0x198aa490f98ff2e619b0f48d7cd1885d604a1753b6c46b5f45b5ae2a8e8bc45f";

// PoaDKIMRegistry.NO_EXPIRY = type(uint256).max — the value a permanent key actually carries
// on-chain (both live Gnosis keys use it). `_set` emits `valid = validUntil != 0`, so the
// (valid: true, validUntil: 0) pairing some fixtures used is UNREACHABLE in production.
function noExpiry(): BigInt {
  return BigInt.fromUnsignedBytes(Bytes.fromHexString("0x" + "ff".repeat(32)));
}

function keyId(domainHash: string, keyHash: string): string {
  return REGISTRY + "-" + domainHash + "-" + keyHash;
}

describe("PoaDKIMRegistry", () => {
  afterEach(() => {
    clearStore();
  });

  test("KeyHashSet seeds a key and creates the registry", () => {
    handleKeyHashSet(
      createKeyHashSetEvent(
        Address.fromString(REGISTRY),
        Bytes.fromHexString(GMAIL_POSEIDON),
        Bytes.fromHexString(KEY_HASH),
        true,
        noExpiry()
      )
    );

    assert.entityCount("DkimRegistry", 1);
    assert.entityCount("DkimKey", 1);
    assert.fieldEquals("DkimKey", keyId(GMAIL_POSEIDON, KEY_HASH), "valid", "true");
    assert.fieldEquals("DkimKey", keyId(GMAIL_POSEIDON, KEY_HASH), "domainHash", GMAIL_POSEIDON);
  });

  test("KeyHashSet with valid=false is an unset, not a seed", () => {
    // setKeyHash(..., false) emits KeyHashSet rather than KeyHashRevoked, so trusting the
    // event name over its flag would leave a cleared key looking live.
    handleKeyHashSet(
      createKeyHashSetEvent(
        Address.fromString(REGISTRY),
        Bytes.fromHexString(GMAIL_POSEIDON),
        Bytes.fromHexString(KEY_HASH),
        false,
        BigInt.zero()
      )
    );

    assert.fieldEquals("DkimKey", keyId(GMAIL_POSEIDON, KEY_HASH), "valid", "false");
  });

  test("KeyHashRevoked invalidates a previously seeded key", () => {
    handleKeyHashSet(
      createKeyHashSetEvent(
        Address.fromString(REGISTRY),
        Bytes.fromHexString(GMAIL_POSEIDON),
        Bytes.fromHexString(KEY_HASH),
        true,
        noExpiry()
      )
    );
    handleKeyHashRevoked(
      createKeyHashRevokedEvent(
        Address.fromString(REGISTRY),
        Bytes.fromHexString(GMAIL_POSEIDON),
        Bytes.fromHexString(KEY_HASH)
      )
    );

    assert.fieldEquals("DkimKey", keyId(GMAIL_POSEIDON, KEY_HASH), "valid", "false");
    assert.entityCount("DkimKey", 1);
  });

  test("re-setting a revoked key makes it live again and clears revokedAt", () => {
    let set = createKeyHashSetEvent(
      Address.fromString(REGISTRY),
      Bytes.fromHexString(GMAIL_POSEIDON),
      Bytes.fromHexString(KEY_HASH),
      true,
      noExpiry()
    );
    handleKeyHashSet(set);
    handleKeyHashRevoked(
      createKeyHashRevokedEvent(
        Address.fromString(REGISTRY),
        Bytes.fromHexString(GMAIL_POSEIDON),
        Bytes.fromHexString(KEY_HASH)
      )
    );
    handleKeyHashSet(set);

    assert.fieldEquals("DkimKey", keyId(GMAIL_POSEIDON, KEY_HASH), "valid", "true");
    // A stale revokedAt would make a live key read as retired.
    assert.fieldEquals("DkimKey", keyId(GMAIL_POSEIDON, KEY_HASH), "revokedAt", "null");
  });

  test("revoking a key never seen set still records it as invalid", () => {
    // The registry may have been seeded before this subgraph's start block; recording the
    // revoke gives consumers an explicit "not usable" instead of no row at all.
    handleKeyHashRevoked(
      createKeyHashRevokedEvent(
        Address.fromString(REGISTRY),
        Bytes.fromHexString(GMAIL_POSEIDON),
        Bytes.fromHexString(KEY_HASH)
      )
    );

    assert.entityCount("DkimKey", 1);
    assert.fieldEquals("DkimKey", keyId(GMAIL_POSEIDON, KEY_HASH), "valid", "false");
  });

  test("two keys for the same domain are tracked independently (rotation)", () => {
    handleKeyHashSet(
      createKeyHashSetEvent(
        Address.fromString(REGISTRY),
        Bytes.fromHexString(GMAIL_POSEIDON),
        Bytes.fromHexString(KEY_HASH),
        true,
        noExpiry()
      )
    );
    handleKeyHashSet(
      createKeyHashSetEvent(
        Address.fromString(REGISTRY),
        Bytes.fromHexString(GMAIL_POSEIDON),
        Bytes.fromHexString(OTHER_KEY),
        true,
        BigInt.fromI32(2000000000)
      )
    );
    handleKeyHashRevoked(
      createKeyHashRevokedEvent(
        Address.fromString(REGISTRY),
        Bytes.fromHexString(GMAIL_POSEIDON),
        Bytes.fromHexString(KEY_HASH)
      )
    );

    assert.entityCount("DkimKey", 2);
    assert.fieldEquals("DkimKey", keyId(GMAIL_POSEIDON, KEY_HASH), "valid", "false");
    // The domain is still seeded via the rotated-in key.
    assert.fieldEquals("DkimKey", keyId(GMAIL_POSEIDON, OTHER_KEY), "valid", "true");
    assert.fieldEquals("DkimKey", keyId(GMAIL_POSEIDON, OTHER_KEY), "validUntil", "2000000000");
  });

  test("a permanent key round-trips NO_EXPIRY (2^256-1) without truncation", () => {
    handleKeyHashSet(
      createKeyHashSetEvent(
        Address.fromString(REGISTRY),
        Bytes.fromHexString(GMAIL_POSEIDON),
        Bytes.fromHexString(KEY_HASH),
        true,
        noExpiry()
      )
    );

    assert.fieldEquals(
      "DkimKey",
      keyId(GMAIL_POSEIDON, KEY_HASH),
      "validUntil",
      "115792089237316195423570985008687907853269984665640564039457584007913129639935"
    );
  });

  test("revoking preserves the key's seeding provenance", () => {
    // `_set` emits KeyHashSet(valid=false, validUntil=0) BEFORE KeyHashRevoked, so a naive
    // handler rewrites setAt/transactionHash/validUntil with the revocation's — destroying the
    // "when was this seeded, and with what expiry" answer the entity exists to give.
    handleKeyHashSet(
      createKeyHashSetEvent(
        Address.fromString(REGISTRY),
        Bytes.fromHexString(GMAIL_POSEIDON),
        Bytes.fromHexString(KEY_HASH),
        true,
        noExpiry()
      )
    );
    let seededAt = "1";
    assert.fieldEquals("DkimKey", keyId(GMAIL_POSEIDON, KEY_HASH), "setAt", seededAt);

    handleKeyHashSet(
      createKeyHashSetEvent(
        Address.fromString(REGISTRY),
        Bytes.fromHexString(GMAIL_POSEIDON),
        Bytes.fromHexString(KEY_HASH),
        false,
        BigInt.zero()
      )
    );

    assert.fieldEquals("DkimKey", keyId(GMAIL_POSEIDON, KEY_HASH), "valid", "false");
    // Provenance intact: still the ORIGINAL seeding, not the revocation.
    assert.fieldEquals("DkimKey", keyId(GMAIL_POSEIDON, KEY_HASH), "setAt", seededAt);
    assert.fieldEquals(
      "DkimKey",
      keyId(GMAIL_POSEIDON, KEY_HASH),
      "validUntil",
      "115792089237316195423570985008687907853269984665640564039457584007913129639935"
    );
  });

  test("OwnershipTransferred records who may seed keys", () => {
    handleDkimOwnershipTransferred(
      createDkimOwnershipTransferredEvent(
        Address.fromString(REGISTRY),
        Address.zero(),
        Address.fromString("0x00000000000000000000000000000000000000a1")
      )
    );

    assert.fieldEquals("DkimRegistry", REGISTRY, "owner", "0x00000000000000000000000000000000000000a1");
  });
});
