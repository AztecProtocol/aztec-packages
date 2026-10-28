// Tests of the generated @aztec-foundation/bb-avm-sim package, from its build: one public transaction through the
// spawned bb-avm-sim binary and through the wasm module (the browser's backend) gives the same result, and the wasm
// module simulates against a world state and contract DB it reaches through its host (hostCall): wsdb-ref's wasm
// module on the same worker, and a contract DB answered on this thread.
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
import { createWasmWorker } from "@aztec-foundation/ipc-runtime/wasm";
import { WsdbService, WsdbServiceSync } from "@aztec-foundation/wsdb-ref";
import { Packr, unpack } from "msgpackr";

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

test("Simulate with no world state or contract DB to reach is an AvmError on both", async () => {
  await assert.rejects(services.process.simulate({ inputs }), (error) => {
    assert.ok(error instanceof AvmError);
    assert.match(error.message, /Simulate needs/);
    return true;
  });
  // Nothing is bound to the wasm module's host calls.
  await assert.rejects(
    services.wasm.simulate({ inputs: fastSimulationInputs(0) }),
    (error) => {
      assert.ok(error instanceof AvmError);
      assert.match(error.message, /host_call wsdb/);
      return true;
    },
  );
});

const packr = new Packr({ useRecords: false });
const NULLIFIER_TREE = 0;
const LATEST = 0xffffffff;
const { hints } = unpack(inputs);
const latest = (forkId) => ({
  forkId,
  blockNumber: LATEST,
  includeUncommitted: true,
});

/** The fixture's transaction as fast-simulation inputs (AvmFastSimulationInputs) on a fork. */
function fastSimulationInputs(forkId) {
  return packr.pack({
    wsRevision: latest(forkId),
    config: {
      proverId: Buffer.alloc(32),
      skipFeeEnforcement: true,
      collectCallMetadata: false,
      collectHints: false,
      collectPublicInputs: false,
      collectDebugLogs: false,
      collectStatistics: false,
      collectionLimits: {
        maxDebugLogMemoryReads: 0,
        maxCalldataSizeInFields: 0,
        maxReturndataSizeInFields: 0,
        maxCallStackDepth: 0,
        maxCallStackItems: 0,
      },
    },
    tx: hints.tx,
    globalVariables: hints.globalVariables,
    protocolContracts: hints.protocolContracts,
  });
}

/**
 * A contract DB over the cdb wire contract, serving the fixture's contracts: what a node's CdbIpcServer does with its
 * PublicContractsDB. Records the commands and fork ids it is asked about.
 */
function fixtureContractDB() {
  const hex = (bytes) => Buffer.from(bytes).toString("hex");
  const instances = new Map(
    hints.contractInstances.map((h) => [
      hex(h.address),
      {
        salt: h.salt,
        deployer: h.deployer,
        currentContractClassId: h.currentContractClassId,
        originalContractClassId: h.originalContractClassId,
        initializationHash: h.initializationHash,
        immutablesHash: h.immutablesHash,
        publicKeys: h.publicKeys,
      },
    ]),
  );
  const classes = new Map(
    hints.contractClasses.map((h) => [
      hex(h.classId),
      {
        id: h.classId,
        artifactHash: h.artifactHash,
        privateFunctionsRoot: h.privateFunctionsRoot,
        packedBytecode: h.packedBytecode,
      },
    ]),
  );
  const commitments = new Map(
    hints.bytecodeCommitments.map((h) => [hex(h.classId), h.commitment]),
  );
  const seen = { commands: [], forkIds: new Set() };
  const answer = (name, cmd) => {
    seen.commands.push(name);
    seen.forkIds.add(Number(cmd.forkId));
    switch (name) {
      case "CdbGetContractInstance": {
        const instance = instances.get(hex(cmd.address));
        return { instance: instance ? packr.pack(instance) : null };
      }
      case "CdbGetContractClass": {
        const contractClass = classes.get(hex(cmd.classId));
        return {
          contractClass: contractClass ? packr.pack(contractClass) : null,
        };
      }
      case "CdbGetBytecodeCommitment":
        return { commitment: commitments.get(hex(cmd.classId)) ?? null };
      case "CdbGetDebugFunctionName":
        return { name: null };
      default:
        return {};
    }
  };
  /** Request bytes to response bytes, as the generated dispatch frames them. */
  const handle = (request) => {
    const [[name, cmd]] = unpack(request);
    return packr.pack([`${name}Response`, answer(name, cmd)]);
  };
  return { handle, seen };
}

/** What a simulation of the fixture on `forkId` did: its result, and the nullifiers it left on the fork. */
async function simulateOnFork(avm, wsdb, forkId) {
  const before = (
    await wsdb.getTreeInfo({ treeId: NULLIFIER_TREE, revision: latest(forkId) })
  ).size;
  const result = decodeResult(
    await avm.simulate({ inputs: fastSimulationInputs(forkId) }),
  );
  const after = (
    await wsdb.getTreeInfo({ treeId: NULLIFIER_TREE, revision: latest(forkId) })
  ).size;
  return { result, added: after - before };
}

test("on a shared worker, Simulate reaches wsdb-ref beside it and a contract DB on this thread", async () => {
  const worker = createWasmWorker();
  const contractDB = fixtureContractDB();
  const wsdb = await WsdbService.create({
    backend: "wasm",
    wasm: { worker },
  });
  // An asynchronous handler: the worker waits for this thread's answer.
  const avm = await AvmService.create({
    backend: "wasm",
    wasm: {
      worker,
      hostCall: {
        wsdb,
        cdb: async (request) => contractDB.handle(request),
      },
    },
  });
  try {
    const { forkId } = await wsdb.createFork({ latest: true, blockNumber: 0 });
    const { result, added } = await simulateOnFork(avm, wsdb, forkId);
    assert.ok(result.publicTxEffect.nullifiers.length > 0);
    assert.ok(added > 0, "the simulation's nullifiers are on the fork");
    assert.ok(contractDB.seen.commands.includes("CdbGetContractInstance"));
    assert.deepEqual([...contractDB.seen.forkIds], [forkId]);

    // The same simulation on a second fork gives the same result.
    const second = await wsdb.createFork({ latest: true, blockNumber: 0 });
    assert.deepEqual(
      (await simulateOnFork(avm, wsdb, second.forkId)).result,
      result,
    );
  } finally {
    await avm.destroy();
    await wsdb.destroy();
    await worker.destroy();
  }
});

test("on the calling thread, Simulate reaches synchronous services, and an asynchronous one fails the call", async () => {
  const contractDB = fixtureContractDB();
  const wsdb = await WsdbServiceSync.create({ backend: "wasm" });
  const avm = await AvmServiceSync.create({
    backend: "wasm",
    wasm: { hostCall: { wsdb, cdb: contractDB.handle } },
  });
  const asyncCdb = await AvmServiceSync.create({
    backend: "wasm",
    wasm: {
      hostCall: { wsdb, cdb: async (request) => contractDB.handle(request) },
    },
  });
  try {
    const { forkId } = wsdb.createFork({ latest: true, blockNumber: 0 });
    const result = decodeResult(
      avm.simulate({ inputs: fastSimulationInputs(forkId) }),
    );
    assert.ok(result.publicTxEffect.nullifiers.length > 0);

    const other = wsdb.createFork({ latest: true, blockNumber: 0 });
    assert.throws(
      () => asyncCdb.simulate({ inputs: fastSimulationInputs(other.forkId) }),
      /answered asynchronously/,
    );
  } finally {
    avm.destroy();
    asyncCdb.destroy();
    wsdb.destroy();
  }
});
