import { createConsoleLogger } from '@aztec/foundation/log';

import { codegen } from '@noir-lang/noir_codegen';
import { type CompiledCircuit } from '@noir-lang/types';
import { pascalCase } from 'change-case';
import { promises as fs } from 'fs';

const log = createConsoleLogger('autogenerate');

const circuits = [
  'parity_base',
  'parity_root',
  'private_kernel_init',
  'private_kernel_inner',
  'private_kernel_reset',
  'private_kernel_tail',
  'private_kernel_tail_to_public',
  'rollup_base_private',
  'rollup_base_public',
  'rollup_merge',
  'rollup_block_root',
  'rollup_block_merge',
  'rollup_block_root_empty',
  'rollup_root',
  'private_kernel_empty',
  'empty_nested',
];

const main = async () => {
  const dimensionsLists = JSON.parse(
    await fs.readFile('../../noir-projects/noir-protocol-circuits/private_kernel_reset_dimensions.json', 'utf8'),
  ) as number[][];
  // Need any variant in the set so that the type will be rendered with generics.
  circuits.push(`private_kernel_reset_${dimensionsLists[0].join('_')}`);

  try {
    await fs.access('./src/types/');
  } catch (error) {
    await fs.mkdir('./src/types', { recursive: true });
  }
  const programs: [string, CompiledCircuit][] = [];
  // Collect all circuits
  for (const circuit of circuits) {
    const rawData = await fs.readFile(`./artifacts/${circuit}.json`, 'utf-8');
    const abiObj: CompiledCircuit = JSON.parse(rawData);
    programs.push([pascalCase(circuit), abiObj]);
  }
  const code = codegen(
    programs,
    false, // Don't embed artifacts
    true, // Use fixed length arrays
  );
  await fs.writeFile('./src/types/index.ts', code);
};

try {
  await main();
} catch (err: unknown) {
  log(`Error generating types ${err}`);
  process.exit(1);
}
