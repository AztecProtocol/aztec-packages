import { createConsoleLogger } from '@aztec/foundation/log';
import { NoirCompiledCircuit, generateTypescriptProgramInterface } from '@aztec/noir-compiler';

import fs from 'fs/promises';

const log = createConsoleLogger('aztec:noir-contracts');

const circuits = [
  'private_kernel_init',
  'private_kernel_inner',
  'private_kernel_ordering',
  'public_kernel_private_previous',
  'public_kernel_public_previous',
  'rollup_base',
  'rollup_merge',
  'rollup_root',
];

const main = async () => {
  for (const circuit of circuits) {
    const rawData = await fs.readFile(`./src/target/${circuit}.json`, 'utf-8');
    const abiObj: NoirCompiledCircuit = JSON.parse(rawData);
    const generatedInterface = generateTypescriptProgramInterface(abiObj.abi);
    await fs.writeFile(`./src/types/${circuit}_types.ts`, generatedInterface);
  }
};

try {
  await main();
} catch (err: unknown) {
  log(`Error generating types ${err}`);
  process.exit(1);
}
