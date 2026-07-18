// Copies the swisseph wasm binary from the npm package into src/vendor/ so the
// Worker can import it as a CompiledWasm module. Kept out of git; runs on install.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, "node_modules/sweph-wasm/dist/wasm/swisseph.wasm");
const dst = join(root, "src/vendor/swisseph.wasm");
mkdirSync(dirname(dst), { recursive: true });
copyFileSync(src, dst);
console.log("synced", dst);
