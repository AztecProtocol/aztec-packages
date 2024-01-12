import { createConsoleLogger } from '@aztec/foundation/log';

import { codegen } from '@noir-lang/noir_codegen';
import { CompiledCircuit } from '@noir-lang/types';
import fs from 'fs/promises';

const log = createConsoleLogger('aztec:noir-contracts');

const circuitsNames = [
  'private_kernel_init',
  'private_kernel_init_simulated',
  'private_kernel_inner',
  'private_kernel_inner_simulated',
  'private_kernel_ordering',
  'private_kernel_ordering_simulated',
  'public_kernel_private_previous',
  'public_kernel_private_previous_simulated',
  'public_kernel_public_previous',
  'public_kernel_public_previous_simulated',
  'rollup_base',
  'rollup_base_simulated',
  'rollup_merge',
  'rollup_root',
];

const main = async () => {
  try {
    await fs.access('./src/types/');
  } catch (error) {
    await fs.mkdir('./src/types', { recursive: true });
  }

  const circuits: [string, CompiledCircuit][] = [];
  for (const circuit of circuitsNames) {
    const rawData = await fs.readFile(`./src/target/${circuit}.json`, 'utf-8');
    const abiObj: CompiledCircuit = JSON.parse(rawData);
    circuits.push([circuit, abiObj]);
  }

  const output = codegen(circuits);
  const outputFile = `./src/types/index.ts`;
  await fs.writeFile(outputFile, output);
};

try {
  await main();
} catch (err: unknown) {
  log(`Error generating types ${err}`);
  process.exit(1);
}
