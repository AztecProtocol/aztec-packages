import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import {
  AvmCircuitPublicInputs,
  AvmTxHint,
  deserializeFromMessagePack,
  serializeWithMessagePack,
} from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ContractClassPublic,
  type ContractInstanceWithAddress,
  contractClassPublicFromPlainObject,
  contractInstanceWithAddressFromPlainObject,
} from '@aztec/stdlib/contract';
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
  cppTx: AvmTxHint,
  cppGlobals: GlobalVariables,
  contractClasses: ContractClassPublic[],
  contractInstances: ContractInstanceWithAddress[],
): Promise<{ reverted: boolean; output: Fr[]; revertReason?: string; publicInputs: AvmCircuitPublicInputs }> {
  const worldStateService = await openExistingWorldState(dataDir, mapSizeKb);
  const merkleTrees = await worldStateService.fork();

  const contractDataSource = new SimpleContractDataSource();

  // Register contract classes from C++
  for (const contractClass of contractClasses) {
    await contractDataSource.addContractClass(contractClass);
  }

  // Register contract instances from C++
  for (const contractInstance of contractInstances) {
    await registerContract(merkleTrees, contractInstance.address);
    await contractDataSource.addContractInstance(contractInstance);
  }

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
    if (
      !input.ws_data_dir ||
      !input.ws_map_size_kb ||
      !input.tx ||
      !input.globals ||
      !input.contractClasses ||
      !input.contractInstances
    ) {
      writeSync(
        process.stdout.fd,
        'Error: JSON must contain "ws_data_dir", "ws_map_size_kb", "tx", "globals", "contractClasses", and "contractInstances" fields\n',
      );
      return;
    }

    const rawTx: object = deserializeFromMessagePack(Buffer.from(input.tx, 'base64'));
    const tx = AvmTxHint.fromPlainObject(rawTx);
    const rawGlobals = deserializeFromMessagePack(Buffer.from(input.globals, 'base64'));
    const globals = GlobalVariables.fromPlainObject(rawGlobals);

    // Parse contract classes from C++ (bytecode is inside packedBytecode field)
    // C++ sends a vector<ContractClass> - id is already inside each class
    const rawClassesArray: any[] = deserializeFromMessagePack(Buffer.from(input.contractClasses, 'base64'));
    const contractClasses: ContractClassPublic[] = rawClassesArray.map(contractClassPublicFromPlainObject);

    // Parse contract instances from C++
    // C++ sends a vector<pair<AztecAddress, ContractInstance>>
    const rawInstancesArray: [any, any][] = deserializeFromMessagePack(Buffer.from(input.contractInstances, 'base64'));
    const contractInstances: ContractInstanceWithAddress[] = rawInstancesArray.map(([rawAddress, rawInstance]) =>
      contractInstanceWithAddressFromPlainObject(AztecAddress.fromPlainObject(rawAddress), rawInstance),
    );

    const result = await simulateWithPublicTxSimulator(
      input.ws_data_dir,
      input.ws_map_size_kb,
      tx,
      globals,
      contractClasses,
      contractInstances,
    );
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
