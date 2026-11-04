// Tests of the generated @aztec-foundation/bb-avm-sim package, from its build: one public transaction through the
// spawned bb-avm-sim binary and through the wasm module (the browser's backend) gives the same result.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";

import {
  AvmError,
  AvmService,
  AvmServiceSync,
} from "@aztec-foundation/bb-avm-sim";
import { unpack } from "msgpackr";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
// Hinted inputs (AvmProvingInputs), carrying the public inputs the transaction produced.
const inputs = readFileSync(
  join(
    root,
    "barretenberg/cpp/src/barretenberg/vm2/testing/minimal_tx.testdata.bin",
  ),
);

/** The simulation result, less its stats, which include timings. */
function decodeResult({ result }) {
  const { stats, ...rest } = unpack(result);
  return rest;
}

const services = {};
before(async () => {
  // No --wsdb or --cdb: the process then serves SimulateWithHints alone, as the wasm module does.
  services.process = await AvmService.create({ backend: "process" });
  services.wasm = await AvmService.create({ backend: "wasm" });
});
after(async () => {
  await Promise.all(
    Object.values(services).map((service) => service.destroy()),
  );
});

test("the process and the wasm module give the same result, the one the transaction produced", async () => {
  const fromProcess = decodeResult(
    await services.process.simulateWithHints({ inputs }),
  );
  const fromWasm = decodeResult(
    await services.wasm.simulateWithHints({ inputs }),
  );
  assert.deepEqual(fromWasm, fromProcess);

  const { publicInputs } = unpack(inputs);
  assert.deepEqual(fromWasm.gasUsed.totalGas, publicInputs.endGasUsed);
  assert.deepEqual(
    Buffer.from(fromWasm.publicTxEffect.transactionFee),
    Buffer.from(publicInputs.transactionFee),
  );
  assert.equal(fromWasm.revertCode !== 0, publicInputs.reverted);
});

test("the synchronous wasm service gives the same result", async () => {
  const sync = await AvmServiceSync.create({ backend: "wasm" });
  try {
    const fromSync = decodeResult(sync.simulateWithHints({ inputs }));
    assert.deepEqual(
      fromSync,
      decodeResult(await services.process.simulateWithHints({ inputs })),
    );
  } finally {
    sync.destroy();
  }
});

test("a simulation that throws is an AvmError, and the service keeps answering", async () => {
  for (const service of Object.values(services)) {
    await assert.rejects(
      service.simulateWithHints({ inputs: new Uint8Array([1, 2, 3]) }),
      AvmError,
    );
    decodeResult(await service.simulateWithHints({ inputs }));
  }
});

test("Simulate, which needs world state and contract data, is an AvmError on both", async () => {
  for (const service of Object.values(services)) {
    await assert.rejects(service.simulate({ inputs }), (error) => {
      assert.ok(error instanceof AvmError);
      assert.match(error.message, /Simulate needs/);
      return true;
    });
  }
});
