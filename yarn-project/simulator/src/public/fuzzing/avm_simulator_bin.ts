import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import {
  AvmCircuitPublicInputs,
  type AvmTxHint,
  deserializeFromMessagePack,
  serializeWithMessagePack,
} from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GlobalVariables, TreeSnapshots } from '@aztec/stdlib/tx';
import { NativeWorldStateService } from '@aztec/world-state';

import { writeSync } from 'fs';
import { createInterface } from 'readline';

import { AvmFuzzerSimulator, FuzzerSimulationRequest } from './avm_fuzzer_simulator.js';

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
): Promise<{ reverted: boolean; output: Fr[]; revertReason?: string; publicInputs: AvmCircuitPublicInputs }> {
  // Log to stderr since stdout is used for communication
  // console.error('[JS_SIM] === Starting JS Simulation ===');
  // console.error('[JS_SIM] txHint.feePayer:', txHint.feePayer.toString());
  // console.error('[JS_SIM] txHint.gasSettings.gasLimits.daGas:', txHint.gasSettings.gasLimits.daGas);
  // console.error('[JS_SIM] txHint.gasSettings.gasLimits.l2Gas:', txHint.gasSettings.gasLimits.l2Gas);
  // console.error('[JS_SIM] txHint.gasSettings.maxFeesPerGas.feePerDaGas:', txHint.gasSettings.maxFeesPerGas.feePerDaGas);
  // console.error('[JS_SIM] txHint.gasSettings.maxFeesPerGas.feePerL2Gas:', txHint.gasSettings.maxFeesPerGas.feePerL2Gas);
  // console.error('[JS_SIM] txHint.effectiveGasFees.feePerDaGas:', txHint.effectiveGasFees.feePerDaGas);
  // console.error('[JS_SIM] txHint.effectiveGasFees.feePerL2Gas:', txHint.effectiveGasFees.feePerL2Gas);
  // console.error('[JS_SIM] globals.gasFees.feePerDaGas:', globals.gasFees.feePerDaGas);
  // console.error('[JS_SIM] globals.gasFees.feePerL2Gas:', globals.gasFees.feePerL2Gas);
  // console.error('[JS_SIM] appLogicEnqueuedCalls count:', txHint.appLogicEnqueuedCalls?.length ?? 0);
  // console.error('[JS_SIM] contractClasses count:', rawContractClasses.length);
  // console.error('[JS_SIM] contractInstances count:', rawContractInstances.length);

  const worldStateService = await openExistingWorldState(dataDir, mapSizeKb);

  const simulator = await AvmFuzzerSimulator.create(worldStateService, globals);

  // Register contract classes from C++
  for (const rawClass of rawContractClasses) {
    await simulator.addContractClassFromCpp(rawClass);
  }

  // Register contract instances from C++
  // Sort by address and deduplicate to match C++ registration order
  // (C++ sorts and uses std::unique before inserting nullifiers)
  const sortedContractInstances = [...rawContractInstances].sort((a, b) => {
    const addrA = AztecAddress.fromPlainObject(a[0]);
    const addrB = AztecAddress.fromPlainObject(b[0]);
    return addrA.toBigInt() < addrB.toBigInt() ? -1 : addrA.toBigInt() > addrB.toBigInt() ? 1 : 0;
  });
  // Deduplicate consecutive entries with same address (like std::unique after sort)
  const uniqueContractInstances = sortedContractInstances.filter((item, index) => {
    if (index === 0) {
      return true;
    }
    const prevAddr = AztecAddress.fromPlainObject(sortedContractInstances[index - 1][0]);
    const currAddr = AztecAddress.fromPlainObject(item[0]);
    return !prevAddr.equals(currAddr);
  });
  for (const [rawAddress, rawInstance] of uniqueContractInstances) {
    // console.error('[JS_SIM] Registering contract instance:', rawAddress);
    await simulator.addContractInstanceFromCpp(rawAddress, rawInstance);
  }

  // console.error('[JS_SIM] Running simulation...');
  const result = await simulator.simulate(txHint);
  // console.error('[JS_SIM] Simulation complete');

  const output = result
    .getAppLogicReturnValues()
    .flatMap((rv: { values?: Fr[] } | undefined) => rv?.values?.filter((v: Fr | null | undefined) => v != null) ?? []);

  // console.error('[JS_SIM] === JS Simulation Complete ===');
  // console.error('[JS_SIM] reverted:', !result.revertCode.isOK());
  // console.error('[JS_SIM] output length:', output.length);
  // if (result.publicInputs) {
  //   console.error(
  //     '[JS_SIM] end_tree_snapshots.publicDataTree.root:',
  //     result.publicInputs.endTreeSnapshots.publicDataTree.root.toString(),
  //   );
  //   console.error(
  //     '[JS_SIM] end_tree_snapshots.nullifierTree.root:',
  //     result.publicInputs.endTreeSnapshots.nullifierTree.root.toString(),
  //   );
  //   console.error(
  //     '[JS_SIM] end_tree_snapshots.noteHashTree.root:',
  //     result.publicInputs.endTreeSnapshots.noteHashTree.root.toString(),
  //   );
  // } else {
  //   console.error('[JS_SIM] WARNING: No publicInputs in result!');
  // }

  return {
    reverted: !result.revertCode.isOK(),
    output,
    revertReason: result.findRevertReason()?.message,
    publicInputs: result.publicInputs!,
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
    );

    // Serialize the result to msgpack and encode it in base64 for output
    const resultBuffer = serializeWithMessagePack({
      reverted: result.reverted,
      output: result.output,
      revertReason: result.revertReason ?? '',
      endTreeSnapshots: result.publicInputs.endTreeSnapshots,
    });
    writeSync(process.stdout.fd, resultBuffer.toString('base64') + '\n');
  } catch (error: any) {
    // If we error, treat as reverted
    const errorResult = serializeWithMessagePack({
      reverted: true,
      output: [] as string[],
      revertReason: `Unexpected Error ${error.message}`,
      endTreeSnapshots: TreeSnapshots.empty(),
    });
    writeSync(process.stdout.fd, errorResult.toString('base64') + '\n');
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
