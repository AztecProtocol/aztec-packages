import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import {
  AvmCircuitPublicInputs,
  type AvmTxHint,
  PublicTxEffect,
  deserializeFromMessagePack,
  serializeWithMessagePack,
} from '@aztec/stdlib/avm';
import { GlobalVariables, ProtocolContracts, TreeSnapshots } from '@aztec/stdlib/tx';
import { NativeWorldStateService } from '@aztec/world-state';

import { createInterface } from 'readline';

import { AvmFuzzerSimulator, FuzzerSimulationRequest } from './avm_fuzzer_simulator.js';

/** Write data to stdout, letting Node handle buffering. */
function writeOutput(data: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    process.stdout.write(data, err => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// This cache holds opened world states to avoid reopening them for each invocation.
// It's a map so that in the future we could support multiple world states (if we had multiple fuzzers).
const worldStateCache = new Map<string, NativeWorldStateService>();

async function openExistingWorldState(dataDir: string, mapSizeKb: number): Promise<NativeWorldStateService> {
  const cached = worldStateCache.get(dataDir);
  if (cached) {
    return cached;
  }

  const ws = await NativeWorldStateService.new(EthAddress.ZERO, dataDir, {
    archiveTreeMapSizeKb: mapSizeKb,
    nullifierTreeMapSizeKb: mapSizeKb,
    noteHashTreeMapSizeKb: mapSizeKb,
    messageTreeMapSizeKb: mapSizeKb,
    publicDataTreeMapSizeKb: mapSizeKb,
  });

  worldStateCache.set(dataDir, ws);
  return ws;
}

async function simulateWithFuzzer(
  dataDir: string,
  mapSizeKb: number,
  txHint: AvmTxHint,
  globals: GlobalVariables,
  rawContractClasses: any[], // Replace these when we are moving contract classes to TS
  rawContractInstances: [any, any][], // Replace these when we are moving contract instances to TS
  rawPublicDataWrites: any[], // Public data tree writes to apply before simulation
  rawNoteHashes: any[], // Note hashes to apply before simulation
  protocolContracts: ProtocolContracts, // Protocol contracts mapping from C++
): Promise<{
  reverted: boolean;
  output: Fr[];
  revertReason?: string;
  publicInputs: AvmCircuitPublicInputs;
  publicTxEffect: PublicTxEffect;
}> {
  const worldStateService = await openExistingWorldState(dataDir, mapSizeKb);

  const simulator = await AvmFuzzerSimulator.create(worldStateService, globals, protocolContracts);

  await simulator.applyNoteHashes(rawNoteHashes);

  // Register contract classes from C++ (must happen before public data writes to match C++ order)
  for (const rawClass of rawContractClasses) {
    await simulator.addContractClassFromCpp(rawClass);
  }

  // Register contract instances from C++
  for (const [rawAddress, rawInstance] of rawContractInstances) {
    await simulator.addContractInstanceFromCpp(rawAddress, rawInstance);
  }

  // Apply public data writes after contract registration (e.g., for bytecode upgrades)
  // This must happen last to match C++ setup_fuzzer_state ordering
  await simulator.applyPublicDataWrites(rawPublicDataWrites);

  const result = await simulator.simulate(txHint);

  const output = result
    .getAppLogicReturnValues()
    .flatMap((rv: { values?: Fr[] } | undefined) => rv?.values?.filter((v: Fr | null | undefined) => v != null) ?? []);

  return {
    reverted: !result.revertCode.isOK(),
    output,
    revertReason: result.findRevertReason()?.message,
    publicInputs: result.publicInputs!,
    publicTxEffect: result.publicTxEffect,
  };
}

async function execute(base64Line: string): Promise<void> {
  try {
    // Decode base64 and deserialize the entire request from msgpack
    const buffer = Buffer.from(base64Line.trim(), 'base64');
    const rawRequest = deserializeFromMessagePack(buffer);
    const request = FuzzerSimulationRequest.fromPlainObject(rawRequest);

    // Run the TS simulation
    const result = await simulateWithFuzzer(
      request.wsDataDir,
      request.wsMapSizeKb,
      request.tx,
      request.globals,
      request.contractClasses,
      request.contractInstances,
      request.publicDataWrites,
      request.noteHashes,
      request.protocolContracts,
    );

    // Serialize the result to msgpack and encode it in base64 for output
    const resultBuffer = serializeWithMessagePack({
      reverted: result.reverted,
      output: result.output,
      revertReason: result.revertReason ?? '',
      endTreeSnapshots: result.publicInputs.endTreeSnapshots,
      publicTxEffect: result.publicTxEffect,
    });
    const base64Response = resultBuffer.toString('base64') + '\n';
    await writeOutput(base64Response);
  } catch (error: any) {
    // If we error, treat as reverted
    const errorResult = serializeWithMessagePack({
      reverted: true,
      output: [] as Fr[],
      revertReason: `Unexpected Error ${error.message}`,
      endTreeSnapshots: TreeSnapshots.empty(),
      publicTxEffect: PublicTxEffect.empty(),
    });
    await writeOutput(errorResult.toString('base64') + '\n');
  }
}

function mainLoop() {
  const rl = createInterface({ input: process.stdin, terminal: false });

  // Process lines sequentially to avoid race conditions in responses
  const lineQueue: string[] = [];
  let processing = false;

  async function processQueue() {
    if (processing || lineQueue.length === 0) {
      return;
    }
    processing = true;
    while (lineQueue.length > 0) {
      const line = lineQueue.shift()!;
      await execute(line);
    }
    processing = false;
  }

  rl.on('line', (line: string) => {
    if (line.trim()) {
      lineQueue.push(line);
      void processQueue();
    }
  });
  rl.on('close', () => process.exit(0));
}

void mainLoop();
