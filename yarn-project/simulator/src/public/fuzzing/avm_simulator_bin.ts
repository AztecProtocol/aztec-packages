import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import {
  AvmCircuitPublicInputs,
  AvmTxHint,
  deserializeFromMessagePack,
  serializeWithMessagePack,
} from '@aztec/stdlib/avm';
import { GlobalVariables, TreeSnapshots } from '@aztec/stdlib/tx';
import { NativeWorldStateService } from '@aztec/world-state';

import { writeSync } from 'fs';
import { createInterface } from 'readline';

import { SimpleContractDataSource } from '../fixtures/simple_contract_data_source.js';
import { PublicContractsDB } from '../public_db_sources.js';
import { PublicTxSimulator } from '../public_tx_simulator/public_tx_simulator.js';
import { createFuzzerTx, registerContract } from './helpers.js';

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

async function simulateWithPublicTxSimulator(
  dataDir: string,
  mapSizeKb: number,
  bytecode: Buffer,
  cppTx: AvmTxHint,
  cppGlobals: GlobalVariables,
): Promise<{ reverted: boolean; output: Fr[]; revertReason?: string; publicInputs: AvmCircuitPublicInputs }> {
  const worldStateService = await openExistingWorldState(dataDir, mapSizeKb);
  const merkleTrees = await worldStateService.fork();

  // todo(ilyas): enable this once we can handle multiple bytecodes across multiple enqueued calls
  // Concat all the enqueued calls, extract the de-duplicated contract addresses so we can register them
  //const teardownCalls = cppTx.teardownEnqueuedCall ? [cppTx.teardownEnqueuedCall] : [];
  //const contractAddresses = new Set([...cppTx.setupEnqueuedCalls, ...cppTx.appLogicEnqueuedCalls, ...teardownCalls].map(
  //    call => call.request.contractAddress,
  //));
  //await Promise.all([...contractAddresses].map(addr => registerContract(merkleTrees, addr)));
  //await Promise.all(
  //    [...contractAddresses].map(addr => contractDataSource.addContractWithBytecode(addr, bytecode)),
  //);

  const contractAddress = cppTx.appLogicEnqueuedCalls[0].request.contractAddress;
  await registerContract(merkleTrees, contractAddress);
  const contractDataSource = new SimpleContractDataSource();
  await contractDataSource.addContractWithBytecode(contractAddress, bytecode);

  const contractsDb = new PublicContractsDB(contractDataSource);

  const publicTxSimulator = new PublicTxSimulator(merkleTrees, contractsDb, cppGlobals, {
    skipFeeEnforcement: true,
    collectDebugLogs: false,
    collectHints: false,
    collectStatistics: false,
    collectCallMetadata: false,
  });

  const tx = await createFuzzerTx(cppTx);
  const result = await publicTxSimulator.simulate(tx);

  const output = result.getAppLogicReturnValues().flatMap(rv => rv?.values?.filter(v => v != null) ?? []);

  return {
    reverted: !result.revertCode.isOK(),
    output,
    revertReason: result.findRevertReason()?.message,
    publicInputs: result.publicInputs!,
  };
}

async function executeFromJson(jsonLine: string): Promise<void> {
  try {
    const input = JSON.parse(jsonLine.trim());
    if (!input.bytecode || !input.ws_data_dir || !input.ws_map_size_kb || !input.tx || !input.globals) {
      writeSync(
        process.stdout.fd,
        'Error: JSON must contain "bytecode", "ws_data_dir", "ws_map_size_kb", "tx", and "globals" fields\n',
      );
      return;
    }

    const bytecode = Buffer.from(input.bytecode, 'base64');
    const rawTx: object = deserializeFromMessagePack(Buffer.from(input.tx, 'base64'));
    const tx = AvmTxHint.fromPlainObject(rawTx);
    const rawGlobals = deserializeFromMessagePack(Buffer.from(input.globals, 'base64'));
    const globals = GlobalVariables.fromPlainObject(rawGlobals);

    const result = await simulateWithPublicTxSimulator(input.ws_data_dir, input.ws_map_size_kb, bytecode, tx, globals);
    const resultBuffer = serializeWithMessagePack({
      reverted: result.reverted,
      output: result.output,
      revertReason: result.revertReason ?? '',
      endTreeSnapshots: result.publicInputs.endTreeSnapshots,
    });
    writeSync(process.stdout.fd, resultBuffer.toString('base64') + '\n');
  } catch (error: any) {
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
  rl.on('line', (line: string) => {
    if (line.trim()) {
      void executeFromJson(line);
    }
  });
  rl.on('close', () => process.exit(0));
}

mainLoop();
