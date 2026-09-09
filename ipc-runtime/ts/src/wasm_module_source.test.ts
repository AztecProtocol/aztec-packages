import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { compileWasmModule } from "./wasm/module_source.js";
import { nodePlatform } from "./wasm/platform.node.js";

// The smallest valid module: magic + version, no sections.
const EMPTY_MODULE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
]);

test("compiles raw bytes", async () => {
  const module = await compileWasmModule(EMPTY_MODULE);
  assert.ok(module instanceof WebAssembly.Module);
  assert.deepEqual(WebAssembly.Module.exports(module), []);
});

test("recognises and inflates gzipped bytes", async () => {
  const module = await compileWasmModule(
    new Uint8Array(gzipSync(EMPTY_MODULE)),
  );
  assert.ok(module instanceof WebAssembly.Module);
});

test("accepts a gzip data: URL", async () => {
  const b64 = Buffer.from(gzipSync(EMPTY_MODULE)).toString("base64");
  const module = await compileWasmModule(`data:application/gzip;base64,${b64}`);
  assert.ok(module instanceof WebAssembly.Module);
});

test("reads file: URLs and plain paths through the platform", async () => {
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "ipc-runtime-wasm-"));
  const path = join(dir, "empty.wasm.gz");
  writeFileSync(path, gzipSync(EMPTY_MODULE));
  assert.ok(
    (await compileWasmModule(path, nodePlatform)) instanceof WebAssembly.Module,
  );
  assert.ok(
    (await compileWasmModule(
      nodePlatform.resolvePath!(path),
      nodePlatform,
    )) instanceof WebAssembly.Module,
  );
});

test("rejects bytes that are neither wasm nor gzip", async () => {
  await assert.rejects(
    compileWasmModule(new Uint8Array([1, 2, 3, 4])),
    /bad magic/,
  );
});
