// Tests of the generated @aztec-labs/acvm package, from its build: a program solves to the same result through
// the spawned aztec-acvm binary and through the wasm module, with its oracles answered asynchronously by this
// thread: over a socket the binary connects to (an @aztec-labs/acvm-oracle server), and through the wasm
// module's `oracle` host-call target, the module suspended (JSPI) while the answer is awaited.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

import { UdsIpcServer } from "@aztec-foundation/ipc-runtime";
import { AcvmService } from "@aztec-labs/acvm";
import { handleRequest } from "@aztec-labs/acvm-oracle";

const fixtures = new URL("../rust/tests/fixtures/", import.meta.url);
const bytecode = (program) =>
  Buffer.from(
    JSON.parse(readFileSync(new URL(`${program}.json`, fixtures), "utf8"))
      .bytecode,
    "base64",
  );

const fr = (value) => {
  const bytes = new Uint8Array(32);
  new DataView(bytes.buffer).setBigUint64(24, BigInt(value));
  return bytes;
};
const int = (bytes) =>
  Number(new DataView(bytes.buffer, bytes.byteOffset).getBigUint64(24));
const inputs = (values) =>
  values.map((value, index) => ({ index, value: fr(value) }));

/** Oracles by execution id: one server answers every execution, as the caller of the package would. */
const oraclesByExecution = new Map();
let nextExecutionId = 1;

/** The `oracles` program's oracles, each answered after a delay so the module has to wait. */
function programOracles(seen = []) {
  return async ({ name, inputs }) => {
    seen.push(name);
    await sleep(2);
    switch (name) {
      case "double":
        return [{ values: [fr(2 * int(inputs[0].values[0]))], array: false }];
      case "sum_and_reverse": {
        const xs = inputs[0].values;
        return [
          {
            values: [fr(xs.map(int).reduce((a, b) => a + b, 0))],
            array: false,
          },
          { values: [...xs].reverse(), array: true },
        ];
      }
      default:
        throw new Error(`no oracle ${name}`);
    }
  };
}

const oracleHandler = {
  async foreignCall({ executionId, name, inputs }) {
    const oracles = oraclesByExecution.get(Number(executionId));
    if (!oracles) {
      throw new Error(`no execution ${executionId}`);
    }
    return { outputs: await oracles({ name, inputs }) };
  },
};
const answerOracle = (request) => handleRequest(oracleHandler, request);

async function execute(service, program, values, oracles, options = {}) {
  const executionId = nextExecutionId++;
  oraclesByExecution.set(executionId, oracles ?? programOracles());
  try {
    return await service.executeProgram({
      executionId,
      bytecode: bytecode(program),
      initialWitness: inputs(values),
      returnWitnessMap: options.witness ?? false,
      returnWitnessStack: options.witnessStack ?? false,
    });
  } finally {
    oraclesByExecution.delete(executionId);
  }
}

const services = {};
let oracleServer;
before(async () => {
  const oracleSocket = join(tmpdir(), `acvm-oracle-${randomUUID()}.sock`);
  oracleServer = await UdsIpcServer.listen(oracleSocket, (_client, request) =>
    answerOracle(request),
  );
  services.process = await AcvmService.create({
    backend: "process",
    process: { extraArgs: ["--oracle", oracleSocket] },
  });
  services.wasm = await AcvmService.create({
    backend: "wasm",
    wasm: { hostCall: { oracle: answerOracle } },
  });
  services.wasmCallingThread = await AcvmService.create({
    backend: "wasm",
    wasm: { worker: false, hostCall: { oracle: answerOracle } },
  });
});
after(async () => {
  await Promise.all(Object.values(services).map((s) => s.destroy()));
  await oracleServer?.close();
});

test("every backend solves a program to the same witness and stack", async () => {
  const results = {};
  for (const [name, service] of Object.entries(services)) {
    results[name] = await execute(service, "acir_calls", [2, 7], undefined, {
      witness: true,
      witnessStack: true,
    });
  }
  // a = 2*2 + 7, b = a*a + 2, a + b
  assert.deepEqual(
    results.process.returnWitness.map((e) => int(e.value)),
    [134],
  );
  assert.equal(
    results.process.witnessStack[0],
    3,
    "msgpack-compact, uncompressed",
  );
  assert.deepEqual(results.wasm, results.process);
  assert.deepEqual(results.wasmCallingThread, results.process);
});

test("every backend waits on asynchronous oracles", async () => {
  for (const [name, service] of Object.entries(services)) {
    const seen = [];
    const result = await execute(
      service,
      "oracles",
      [4, 1, 2, 3],
      programOracles(seen),
    );
    assert.equal(result.failure, null, name);
    assert.deepEqual(
      result.returnWitness.map((e) => int(e.value)),
      [14],
      name,
    );
    assert.deepEqual(seen, ["double", "sum_and_reverse"], name);
  }
});

test("overlapping executions each reach their own oracles", async () => {
  for (const [name, service] of Object.entries(services)) {
    const runs = [1, 2, 3, 4].map((x) => {
      const seen = [];
      return execute(
        service,
        "oracles",
        [x, x, 0, 1],
        programOracles(seen),
      ).then((result) => ({ x, seen, result }));
    });
    for (const { x, seen, result } of await Promise.all(runs)) {
      // doubled + sum = 2x + (x + 0 + 1)
      assert.deepEqual(
        result.returnWitness.map((e) => int(e.value)),
        [3 * x + 1],
        name,
      );
      assert.deepEqual(seen, ["double", "sum_and_reverse"], name);
    }
  }
});

test("a program that fails comes back as the same failure from every backend", async () => {
  const failures = {};
  for (const [name, service] of Object.entries(services)) {
    failures[name] = (await execute(service, "assertions", [1, 2, 1])).failure;
  }
  assert.equal(failures.process.message, "Assertion failed");
  assert.equal(
    failures.process.rawAssertionPayload.selector,
    "11740580735536159235",
  );
  assert.deepEqual(failures.wasm, failures.process);
  assert.deepEqual(failures.wasmCallingThread, failures.process);
});

test("an oracle that throws fails the execution with its message, and the service carries on", async () => {
  for (const [name, service] of Object.entries(services)) {
    await assert.rejects(
      execute(service, "oracles", [4, 1, 2, 3], async () => {
        await sleep(1);
        throw new Error("note not found");
      }),
      /note not found/,
      name,
    );
    const result = await execute(service, "simple", [3, 5]);
    assert.deepEqual(
      result.returnWitness.map((e) => int(e.value)),
      [16],
      name,
    );
  }
});
