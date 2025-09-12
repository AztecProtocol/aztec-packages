import { DEFAULT_DA_GAS_LIMIT, DEFAULT_L2_GAS_LIMIT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GlobalVariables } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';
import { NativeWorldStateService } from '@aztec/world-state';

import * as readline from 'readline';

import { AvmSimulator } from '../../public/avm/avm_simulator.js';
import { SimpleContractDataSource } from '../../public/fixtures/simple_contract_data_source.js';
import { PublicContractsDB, PublicTreesDB } from '../../public/public_db_sources.js';
import { SideEffectTrace } from '../../public/side_effect_trace.js';
import { PublicPersistableStateManager } from '../../public/state_manager/state_manager.js';

function stringToField(str: string): Fr {
  let number = BigInt(str);
  if (number < 0) {
    number = Fr.MODULUS + number;
  }
  return new Fr(number);
}

function stringArrayToFields(arr: string[]): Fr[] {
  return arr.map(stringToField);
}

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

async function executeBytecodeBase64(
  avmBytecodeBase64: string,
  calldata: Fr[],
): Promise<{ reverted: boolean; output: Fr[] }> {
  const bytecode = Buffer.from(avmBytecodeBase64, 'base64');
  const simulator = await getSimulator(calldata);
  const results = await simulator.executeBytecode(bytecode);
  return { reverted: results.reverted, output: results.output };
}

async function processJson(jsonLine: string): Promise<void> {
  try {
    const input = JSON.parse(jsonLine.trim());
    if (!input.bytecode || !input.inputs) {
      process.stderr.write('Error: JSON must contain "bytecode" and "inputs" fields\n');
      return;
    }
    const calldata = stringArrayToFields(input.inputs);
    const result = await executeBytecodeBase64(input.bytecode, calldata);
    process.stdout.write(
      JSON.stringify({
        reverted: result.reverted,
        output: result.output.map(fr => fr.toString()),
      }) + '\n',
    );
  } catch (error) {
    process.stderr.write(`Error: ${error}\n`);
  }
}

// Read json line-by-line from stdin {"bytecode": "...", "inputs": ["1", "2", ...]}
// Process it and print the result of the execution to stdout {"reverted":false,"output":["0x0000000000000000000000000000000000000000000000000000000000000000"]}
async function mainLoop() {
  await init();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });
  rl.on('line', (line: string) => {
    if (line.trim()) {
      void processJson(line);
    }
  });
  rl.on('close', () => {
    process.exit(0);
  });
}

void mainLoop();
