import { DEFAULT_DA_GAS_LIMIT, DEFAULT_L2_GAS_LIMIT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { AvmSimulator } from '@aztec/simulator/public/avm/avm_simulator';
import { SimpleContractDataSource } from '@aztec/simulator/public/fixtures';
import { PublicContractsDB, PublicTreesDB } from '@aztec/simulator/public/public_db_sources';
import { SideEffectTrace } from '@aztec/simulator/public/side_effect_trace';
import { PublicPersistableStateManager } from '@aztec/simulator/public/state_manager';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GlobalVariables } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';
import { NativeWorldStateService } from '@aztec/world-state';

export const DEFAULT_TIMESTAMP: UInt64 = 99833n;

let STATE_MANAGER: PublicPersistableStateManager | undefined;

async function init() {
  if (STATE_MANAGER) {
    return;
  }
  const contractDataSource = new SimpleContractDataSource();
  const merkleTrees = await (await NativeWorldStateService.tmp()).fork();
  const treesDb = new PublicTreesDB(merkleTrees);
  const contractsDb = new PublicContractsDB(contractDataSource);
  const trace = new SideEffectTrace();
  const firstNullifier = new Fr(420000);
  STATE_MANAGER = PublicPersistableStateManager.create(
    treesDb,
    contractsDb,
    trace,
    /*doMerkleOperations=*/ false,
    firstNullifier,
    DEFAULT_TIMESTAMP,
  );
}

async function getSimulator(calldata: Fr[]) {
  await init();

  const simulator = await AvmSimulator.create(
    STATE_MANAGER!,
    AztecAddress.zero(),
    AztecAddress.zero(),
    new Fr(0),
    GlobalVariables.empty(),
    false,
    calldata,
    { l2Gas: DEFAULT_L2_GAS_LIMIT, daGas: DEFAULT_DA_GAS_LIMIT },
  );
  return simulator;
}

// TODO(sn): WARN: simple-contract-data-source Couldn't get fn name for debugging. Contract not in tester's ContractDataSource. Using selector: calldata[0]
// But the fuzzer can produce calldata[0] that is not a valid selector.
async function executeBytecodeBase64(
  avmBytecodeBase64: string,
  calldata: Fr[],
): Promise<{ reverted: boolean; output: Fr[] }> {
  const bytecode = Buffer.from(avmBytecodeBase64, 'base64');
  const simulator = await getSimulator(calldata);
  const results = await simulator.executeBytecode(bytecode);
  return { reverted: results.reverted, output: results.output };
}

export { executeBytecodeBase64 };
