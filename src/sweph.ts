/** Worker-side Swiss Ephemeris bootstrap.
 * Wrangler compiles src/vendor/swisseph.wasm to a WebAssembly.Module; we hand it
 * to the emscripten factory via instantiateWasm (no fetch, no filesystem), then
 * wrap it in sweph-wasm's typed class. One instance per isolate.
 */
import factory from "sweph-wasm/wasm/swisseph";
// @ts-expect-error — CompiledWasm module import, typed by wrangler at build time
import wasmModule from "./vendor/swisseph.wasm";
import SwissEPH from "sweph-wasm";
import type { Sweph } from "./core.ts";

let instance: Promise<Sweph> | null = null;

export function getSweph(): Promise<Sweph> {
  instance ??= (async () => {
    const em = await factory({
      instantiateWasm(imports: WebAssembly.Imports, cb: (i: WebAssembly.Instance, m: WebAssembly.Module) => void) {
        const inst = new WebAssembly.Instance(wasmModule as WebAssembly.Module, imports);
        cb(inst, wasmModule as WebAssembly.Module);
        return inst.exports;
      },
    });
    const swe = new (SwissEPH as unknown as new (m: unknown) => Sweph)(em);
    swe.swe_set_sid_mode(1, 0, 0); // SIDM_LAHIRI, from first touch — health reads ayanamsa before any chart call
    return swe;
  })();
  return instance;
}
