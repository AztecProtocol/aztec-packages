import assert from "node:assert/strict";
import { test } from "node:test";
import { pickServiceBackend } from "./service.js";
import type { IpcClientAsync } from "./types.js";

function backend(name: string): IpcClientAsync & { name: string } {
  return {
    name,
    call: () => Promise.resolve(new Uint8Array()),
    destroy: () => Promise.resolve(),
  };
}

const ok = (name: string, available?: boolean) => ({
  ...(available === undefined ? {} : { available: () => available }),
  create: () => Promise.resolve(backend(name)),
});
const failing = (available?: boolean) => ({
  ...(available === undefined ? {} : { available: () => available }),
  create: (): Promise<IpcClientAsync> => Promise.reject(new Error("boom")),
});

async function picked(
  wanted: Parameters<typeof pickServiceBackend>[0],
  choices: Omit<Parameters<typeof pickServiceBackend>[1], "label">,
): Promise<string> {
  const chosen = await pickServiceBackend<IpcClientAsync>(wanted as any, {
    label: "svc",
    ...(choices as any),
  });
  return (chosen as any).name;
}

test("unset: process first when its binary resolves", async () => {
  assert.equal(
    await picked(undefined, { process: ok("process", true), napi: ok("napi", true), wasm: ok("wasm") }),
    "process",
  );
});

test("unset: napi when the process is unavailable", async () => {
  assert.equal(
    await picked(undefined, { process: ok("process", false), napi: ok("napi", true), wasm: ok("wasm") }),
    "napi",
  );
});

test("unset: wasm when neither native backend is available", async () => {
  assert.equal(
    await picked(undefined, { process: ok("process", false), napi: ok("napi", false), wasm: ok("wasm") }),
    "wasm",
  );
});

test("unset: a failing backend falls through to the next", async () => {
  const logs: string[] = [];
  const chosen = await pickServiceBackend<IpcClientAsync>(undefined, {
    label: "svc",
    napi: failing(true),
    wasm: ok("wasm"),
    logger: (m) => logs.push(m),
  });
  assert.equal((chosen as any).name, "wasm");
  assert.match(logs[0]!, /svc napi unavailable \(boom\); falling back to wasm/);
});

test("unset: the last candidate is tried even when it reports unavailable", async () => {
  assert.equal(await picked(undefined, { process: ok("process", false) }), "process");
});

test("unset: a failure of the last candidate propagates", async () => {
  await assert.rejects(picked(undefined, { napi: failing(true) }), /boom/);
});

test("a named backend is forced, with no fallback", async () => {
  assert.equal(await picked("napi", { napi: ok("napi", false), wasm: ok("wasm") }), "napi");
  await assert.rejects(picked("napi", { napi: failing(true), wasm: ok("wasm") }), /boom/);
});

test("a named backend the host lacks is an error", async () => {
  await assert.rejects(picked("napi", { wasm: ok("wasm") }), /svc: no such backend here: napi/);
});

test("a backend object is used as is", async () => {
  const mine = backend("mine");
  const chosen = await pickServiceBackend<IpcClientAsync>(mine, { label: "svc", wasm: ok("wasm") });
  assert.equal(chosen, mine);
});
