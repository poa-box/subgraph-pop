#!/usr/bin/env node
/**
 * Guard: no compiled mapping may call a HOST IMPORT from its `_start` function.
 *
 * This gates the invariant directly, on the build artifact, after AssemblyScript has
 * lowered everything — so unlike a source grep it cannot be fooled by indirection
 * (`const X = helper()`), by operator methods (`BigInt.fromI32(10).pow(18)` — bigInt.pow
 * is a host import), by `.toString()` (typeConversion.bigIntToString), by class-static or
 * namespace-wrapped initialisers, or by a host name nobody remembered to denylist.
 *
 * WHY IT MATTERS (this shipped, and took a production deploy down):
 *
 * graph-cli compiles with `--explicitStart`, so the module has no wasm start SECTION;
 * AssemblyScript emits `~start` and exports it as `_start`. graph-node calls that export
 * once per WasmInstance — i.e. per trigger — in runtime/wasm/src/module/instance.rs, after
 * the AscHeap is installed.
 *
 * Inside `~start`, AssemblyScript initialises the stub allocator's bump cursor
 * (`~lib/rt/stub/offset`, declared with a static init of 0) at the END, after user globals.
 * So a module-level global whose initialiser calls a host import runs while that cursor is
 * still 0. When the host returns a value it calls back into the module's exported
 * allocator, which hands out an arena starting near address 0 — on top of the STATIC DATA
 * SEGMENT, where every string literal lives. graph-node keeps bump-allocating in that
 * cached arena, and the next `asc_new` zeroes the rtSize header of a literal such as
 * "EligibilityModuleContract". `store.set` then reads its entity type back as EMPTY:
 *
 *   handleEligibilityModuleInitialized: internal error: unknown name  when looking up
 *   entity type
 *
 * Note the two spaces, and note that the blame lands on whichever handler ran first —
 * usually one with nothing to do with the offending line. It compiles, matchstick passes
 * (its host differs), and subgraph-lint says nothing. Hence this check.
 *
 * SAFE at module scope: pure AssemblyScript only — string/number literals, Address.zero(),
 * Bytes/ByteArray.fromHexString, BigInt.fromI32, BigInt.fromUnsignedBytes.
 * UNSAFE: anything reaching a `declare namespace` in graph-ts. Put it in a function.
 *
 * Run AFTER `graph build`. Usage: node scripts/check-wasm-start.mjs <buildDir> [...]
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function wasmFiles(dir) {
  const out = [];
  const walk = d => {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, name.name);
      if (name.isDirectory()) walk(p);
      else if (name.name.endsWith('.wasm')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** Every import replaced by something that records the call and aborts. */
function trippingImports(module, tripped) {
  const imports = {};
  for (const imp of WebAssembly.Module.imports(module)) {
    imports[imp.module] ??= {};
    switch (imp.kind) {
      case 'function':
        imports[imp.module][imp.name] = (...args) => {
          tripped.push(`${imp.module}.${imp.name}`);
          throw new Error(`HOST IMPORT CALLED: ${imp.module}.${imp.name}`);
        };
        break;
      case 'memory':
        imports[imp.module][imp.name] = new WebAssembly.Memory({ initial: 1 });
        break;
      case 'table':
        imports[imp.module][imp.name] = new WebAssembly.Table({ initial: 1, element: 'anyfunc' });
        break;
      case 'global':
        imports[imp.module][imp.name] = new WebAssembly.Global({ value: 'i32', mutable: false }, 0);
        break;
      default:
        imports[imp.module][imp.name] = () => {};
    }
  }
  return imports;
}

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error('usage: node scripts/check-wasm-start.mjs <buildDir> [...]');
  process.exit(2);
}

let failed = false;
let checked = 0;

for (const dir of dirs) {
  // A missing/typo'd directory is an ERROR, never a silent pass — a guard that quietly
  // checks nothing is worse than no guard.
  let stat;
  try {
    stat = statSync(dir);
  } catch {
    console.error(`error: build directory not found: ${dir} (run \`graph build\` first)`);
    process.exit(2);
  }
  if (!stat.isDirectory()) {
    console.error(`error: not a directory: ${dir}`);
    process.exit(2);
  }

  const files = wasmFiles(dir);
  if (files.length === 0) {
    console.error(`error: no .wasm under ${dir} (run \`graph build\` first)`);
    process.exit(2);
  }

  for (const file of files) {
    checked++;
    const module = await WebAssembly.compile(readFileSync(file));
    const tripped = [];
    let instance;
    try {
      instance = await WebAssembly.instantiate(module, trippingImports(module, tripped));
    } catch (err) {
      console.error(`error: could not instantiate ${file}: ${err.message}`);
      process.exit(2);
    }

    const start = instance.exports._start ?? instance.exports.__start;
    if (typeof start !== 'function') continue; // nothing deferred to check

    try {
      start();
    } catch {
      // Only a host-import call is a violation; any other trap is not what we gate.
    }

    if (tripped.length > 0) {
      failed = true;
      console.error(`${file}: _start calls host import(s): ${[...new Set(tripped)].join(', ')}`);
    }
  }
}

if (failed) {
  console.error('');
  console.error('A module-level global is initialised by a host call. Move it into a');
  console.error('function, or build it with pure AssemblyScript. See this script header.');
  process.exit(1);
}

console.log(`check-wasm-start: ${checked} modules clean`);
