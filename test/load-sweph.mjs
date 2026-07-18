// Node-side loader for tests: same emscripten module, no fetch involved.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import SwissEPH from "sweph-wasm";
import factory from "sweph-wasm/wasm/swisseph";

export async function loadSweph() {
  const wasmPath = fileURLToPath(new URL("../node_modules/sweph-wasm/dist/wasm/swisseph.wasm", import.meta.url));
  const em = await factory({ wasmBinary: readFileSync(wasmPath) });
  return new SwissEPH(em);
}
