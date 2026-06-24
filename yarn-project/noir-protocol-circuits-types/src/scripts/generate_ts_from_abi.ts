import { createConsoleLogger } from '@aztec/foundation/log';
import { codegen } from '@aztec/noir-noir_codegen';
import type { CompiledCircuit } from '@aztec/noir-types';

import { pascalCase } from 'change-case';
import { promises as fs } from 'fs';

const log = createConsoleLogger('autogenerate');

const circuits = [
  'parity_base',
  'parity_root',
  'private_kernel_init',
  'private_kernel_init_2',
  'private_kernel_init_3',
  'private_kernel_init_4',
  'private_kernel_init_5',
  'private_kernel_inner',
  'private_kernel_inner_2',
  'private_kernel_inner_3',
  'private_kernel_inner_4',
  'private_kernel_inner_5',
  'private_kernel_reset',
  'private_kernel_reset_tail',
  'private_kernel_reset_tail_to_public',
  'hiding_kernel_to_rollup',
  'hiding_kernel_to_public',
  'chonk_verifier_public',
  'rollup_tx_base_private',
  'rollup_tx_base_public',
  'rollup_tx_merge',
  'rollup_block_root',
  'rollup_block_root_single_tx',
  'rollup_block_root_first',
  'rollup_block_root_first_single_tx',
  'rollup_block_root_first_empty_tx',
  'rollup_block_merge',
  'rollup_checkpoint_root',
  'rollup_checkpoint_root_single_block',
  'rollup_checkpoint_merge',
  'rollup_root',
  'ts_types',
];

const main = async () => {
  // Per-family variant lists. Each family needs at least one sample variant alongside its
  // protocol-maxima base, so noir-codegen renders mapping helpers generically over hint sizes
  // (see `TEMPLATE_DIMENSIONS` below for the differs-from-template invariant).
  const dimensionsByGroup = JSON.parse(
    await fs.readFile('../../noir-projects/noir-protocol-circuits/private_kernel_reset_dimensions.json', 'utf8'),
  ) as Record<string, number[][]>;

  // The template circuit has every dimension at the protocol max for that dimension. For codegen to
  // emit a generic over a given dimension we need the sample variant to differ from the template at
  // that position. The TEMPLATE_DIMENSIONS array mirrors `aliases.full` in
  // `noir-projects/noir-protocol-circuits/scripts/generate_variants.js` and must be kept in sync.
  const TEMPLATE_DIMENSIONS = [64, 64, 64, 64, 64, 64, 64, 64, 64];

  // Names align with `dimensionNames` in `noir-projects/noir-protocol-circuits/scripts/generate_variants.js`.
  const dimensionNames = [
    'NOTE_HASH_PENDING_READ',
    'NOTE_HASH_SETTLED_READ',
    'NULLIFIER_PENDING_READ',
    'NULLIFIER_SETTLED_READ',
    'KEY_VALIDATION',
    'TRANSIENT_DATA_SQUASHING',
    'NOTE_HASH_SILOING',
    'NULLIFIER_SILOING',
    'PRIVATE_LOG_SILOING',
  ];

  const differsFromTemplate = (d: number[]) => d.every((v, i) => v !== TEMPLATE_DIMENSIONS[i]);

  for (const [group, prefix] of [
    ['inner', 'private_kernel_reset'],
    ['finalTail', 'private_kernel_reset_tail'],
    ['finalTailToPublic', 'private_kernel_reset_tail_to_public'],
  ] as const) {
    const variants = dimensionsByGroup[group] ?? [];
    const sampleVariant = variants.find(differsFromTemplate);
    if (!sampleVariant) {
      const offenders = variants
        .map(d => {
          const matching = d
            .map((v, i) => ({ name: dimensionNames[i], value: v, template: TEMPLATE_DIMENSIONS[i] }))
            .filter(({ value, template }) => value === template)
            .map(({ name, value }) => `${name}=${value}`);
          return `[${d.join(', ')}] (matches template at ${matching.join(', ')})`;
        })
        .join('; ');
      throw new Error(
        `private_kernel_reset_dimensions.json's ${group} group must contain a variant that differs from the template ` +
          `at every dimension so noir-codegen renders the mapping helpers generically. Got: ${offenders}`,
      );
    }
    circuits.push(`${prefix}_${sampleVariant.join('_')}`);
  }

  try {
    await fs.access('./src/types/');
  } catch {
    await fs.mkdir('./src/types', { recursive: true });
  }
  const programs: [string, CompiledCircuit][] = [];
  // Collect all circuits
  for (const circuit of circuits) {
    const rawData = await fs.readFile(`./artifacts/${circuit}.json`, 'utf-8');
    const abiObj: CompiledCircuit = JSON.parse(rawData);
    // pascalCase('private_kernel_init_3') yields 'PrivateKernelInit_3'; collapse the
    // underscore-before-digit so emitted identifiers match the hand-written classes
    // (e.g. PrivateKernelInit3CircuitPrivateInputs) and pass the camelcase lint rule.
    programs.push([pascalCase(circuit).replace(/_(\d)/g, '$1'), abiObj]);
  }
  let code = codegen(
    programs,
    false, // Don't embed artifacts
    true, // Use fixed length arrays
  );
  code = code.replace(
    'export type ProofData<A, B extends number> = {\n  public_inputs: A;\n  proof: FixedLengthArray<Field, B>;\n  vk_data: VkData<115>;\n}',
    'export type ProofData<A, B extends number, C extends number = 115> = {\n  public_inputs: A;\n  proof: FixedLengthArray<Field, B>;\n  vk_data: VkData<C>;\n}',
  );

  await fs.writeFile('./src/types/index.ts', code);
};

try {
  await main();
} catch (err: unknown) {
  log(`Error generating types ${err}`);
  process.exit(1);
}
