import { BigDecimal, BigInt, JSONValue, JSONValueKind } from "@graphprotocol/graph-ts";

/**
 * Safe converters for JSON numbers pulled off IPFS.
 *
 * IPFS content is caller-supplied and completely untrusted, but the naive idiom
 *
 *     let raw = value.toF64().toString();
 *     let dot = raw.indexOf(".");
 *     if (dot >= 0) raw = raw.substring(0, dot);
 *     BigInt.fromString(raw)          // <-- aborts the mapping
 *
 * only strips a fractional part. AssemblyScript's f64.toString() emits EXPONENT NOTATION for
 * small and large magnitudes ("1e-7", "1e+21") and the words "NaN" / "Infinity" for non-finite
 * values. None of those contain a ".", so they reach BigInt.fromString unmodified, which aborts
 * on the first non-digit — and an abort in a mapping halts indexing for the whole subgraph.
 * `{"createdAt": 1e-7}` in one proposal's metadata JSON is enough to stop the indexer.
 *
 * These helpers return null instead, so a malformed field simply stays unset.
 *
 * This module holds pure functions only — no module-level state and no host calls at module
 * scope, which would trip the wasm-start guard (see scripts/check-wasm-start.mjs).
 */

/**
 * Parse a decimal string to BigInt, truncating any fractional part. Returns null unless the
 * integer part is a plain optionally-signed run of ASCII digits — which rejects exponent
 * notation, "NaN" and "Infinity".
 */
export function decimalStringToBigInt(raw: string): BigInt | null {
  let dot = raw.indexOf(".");
  let intPart = dot >= 0 ? raw.substring(0, dot) : raw;
  if (intPart.length == 0) {
    return null;
  }

  let negative = false;
  let start = 0;
  let first = intPart.charAt(0);
  if (first == "-") {
    negative = true;
    start = 1;
  } else if (first == "+") {
    start = 1;
  }
  if (start >= intPart.length) {
    return null;
  }

  for (let i = start; i < intPart.length; i++) {
    let code = intPart.charCodeAt(i);
    if (code < 48 || code > 57) {
      return null;
    }
  }

  let digits = intPart.substring(start);
  return BigInt.fromString(negative ? "-" + digits : digits);
}

/**
 * Read a JSON NUMBER field as BigInt, truncating any fraction. Returns null when the value is
 * absent, null, not a number, or not representable (exponent notation / non-finite).
 */
export function jsonToBigInt(value: JSONValue | null): BigInt | null {
  if (value == null || value.isNull() || value.kind != JSONValueKind.NUMBER) {
    return null;
  }
  return decimalStringToBigInt(value.toF64().toString());
}

/**
 * Read a JSON NUMBER field as BigDecimal, preserving the fractional part. BigDecimal.fromString
 * accepts exponent notation, so only the non-finite spellings need rejecting. Returns null when
 * the value is absent, null, not a number, or non-finite.
 */
export function jsonToBigDecimal(value: JSONValue | null): BigDecimal | null {
  if (value == null || value.isNull() || value.kind != JSONValueKind.NUMBER) {
    return null;
  }
  let raw = value.toF64().toString();
  // "NaN", "Infinity", "-Infinity" — BigDecimal.fromString aborts on these.
  for (let i = 0; i < raw.length; i++) {
    let code = raw.charCodeAt(i);
    let isDigit = code >= 48 && code <= 57;
    let isAllowed =
      isDigit ||
      code == 46 || // .
      code == 45 || // -
      code == 43 || // +
      code == 101 || // e
      code == 69; // E
    if (!isAllowed) {
      return null;
    }
  }
  return BigDecimal.fromString(raw);
}
