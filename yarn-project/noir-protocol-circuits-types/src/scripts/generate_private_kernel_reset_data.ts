import {
  MAX_KEY_VALIDATION_REQUESTS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
  PRIVATE_KERNEL_RESET_INDEX,
  type PrivateKernelResetDimensionsConfig,
  VK_TREE_HEIGHT,
  privateKernelResetDimensionNames,
} from '@aztec/circuits.js';
import { createConsoleLogger } from '@aztec/foundation/log';

import fs from 'fs/promises';

const log = createConsoleLogger('aztec:autogenerate');

const outputFilename = './src/private_kernel_reset_data.ts';

// Must match the values in noir-projects/noir-protocol-circuits/crates/private-kernel-reset/src/main.nr
const maxDimensions = [
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MAX_KEY_VALIDATION_REQUESTS_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
];

function generateImports() {
  return `
    import { PrivateKernelResetDimensions, type PrivateKernelResetDimensionsConfig, type VerificationKeyData } from '@aztec/circuits.js';
    import { type NoirCompiledCircuit } from '@aztec/types/noir';
    import { keyJsonToVKData } from './utils/vk_json.js';
  `;
}

function generateArtifactImports(importTags: string[]) {
  return importTags
    .map(
      tag =>
        `import PrivateKernelResetJson${tag} from '../artifacts/private_kernel_reset${tag}.json' assert { type: 'json' };`,
    )
    .join('\n');
}

function generateSimulatedArtifactImports(importTags: string[]) {
  return importTags
    .map(
      tag =>
        `import PrivateKernelResetSimulatedJson${tag} from '../artifacts/private_kernel_reset_simulated${tag}.json' assert { type: 'json' };`,
    )
    .join('\n');
}

function generateVksImports(importTags: string[]) {
  return importTags
    .map(
      tag =>
        `import PrivateKernelResetVkJson${tag} from '../artifacts/keys/private_kernel_reset${tag}.vk.data.json' assert { type: 'json' };`,
    )
    .join('\n');
}

function getArtifactName(tag: string) {
  return `PrivateKernelResetArtifact${tag}`;
}

function generateArtifactNames(resetVariantTags: string[]) {
  const artifacts = resetVariantTags.map(tag => `'${getArtifactName(tag)}'`);
  return `export type PrivateResetArtifact = ${artifacts.join('|')};`;
}

function generateArtifacts(resetVariantTags: string[], importTags: string[]) {
  const artifacts = resetVariantTags.map(
    (tag, i) => `${getArtifactName(tag)}: PrivateKernelResetJson${importTags[i]} as NoirCompiledCircuit,`,
  );
  return `
    export const PrivateKernelResetArtifacts: Record<PrivateResetArtifact, NoirCompiledCircuit> = {
      ${artifacts.join('\n')}
    };
  `;
}

function generateSimulatedArtifacts(resetVariantTags: string[], importTags: string[]) {
  const artifacts = resetVariantTags.map(
    (tag, i) => `${getArtifactName(tag)}: PrivateKernelResetSimulatedJson${importTags[i]} as NoirCompiledCircuit,`,
  );
  return `
    export const PrivateKernelResetSimulatedArtifacts: Record<PrivateResetArtifact, NoirCompiledCircuit> = {
      ${artifacts.join('\n')}
    };
  `;
}

function generateVks(resetVariantTags: string[], importTags: string[]) {
  const artifacts = resetVariantTags.map(
    (tag, i) => `${getArtifactName(tag)}: keyJsonToVKData(PrivateKernelResetVkJson${importTags[i]}),`,
  );
  return `
    export const PrivateKernelResetVks: Record<PrivateResetArtifact, VerificationKeyData> = {
      ${artifacts.join('\n')}
    };
  `;
}

function generateVkIndexes(resetVariantTags: string[]) {
  const artifacts = resetVariantTags.map((tag, i) => `${getArtifactName(tag)}: ${PRIVATE_KERNEL_RESET_INDEX + i},`);
  return `
    export const PrivateKernelResetVkIndexes: Record<PrivateResetArtifact, number> = {
      ${artifacts.join('\n')}
    };
  `;
}

function checkDimensionNames(config: PrivateKernelResetDimensionsConfig) {
  const expected = Object.keys(config.dimensions);
  if (
    expected.length !== privateKernelResetDimensionNames.length ||
    !privateKernelResetDimensionNames.every((name, i) => name === expected[i])
  ) {
    throw new Error('privateKernelResetDimensionNames must be listed in the same order as in the config.');
  }
}

function checkMaxDimensions(dimensionsList: number[][]) {
  if (!dimensionsList.some(dimensions => dimensions.every((v, i) => v === maxDimensions[i]))) {
    throw new Error(`Max dimensions is not defined in the config. Expected: [${maxDimensions.join(',')}]`);
  }
}

function checkVkTreeSize(numResetCircuits: number) {
  const treeSize = 2 ** VK_TREE_HEIGHT;
  const maxIndex = numResetCircuits + PRIVATE_KERNEL_RESET_INDEX;
  if (maxIndex >= treeSize) {
    throw new Error(
      `Insufficient VK tree height. Maximum private kernel reset index: ${maxIndex}. Required tree height at lease: ${Math.ceil(
        Math.log2(maxIndex + 1),
      )}. Current height: ${VK_TREE_HEIGHT}.`,
    );
  }
}

const main = async () => {
  const config = JSON.parse(
    await fs.readFile('../../noir-projects/noir-protocol-circuits/private_kernel_reset_config.json', 'utf8'),
  ) as PrivateKernelResetDimensionsConfig;

  checkDimensionNames(config);

  const dimensionsList = JSON.parse(
    await fs.readFile('../../noir-projects/noir-protocol-circuits/private_kernel_reset_dimensions.json', 'utf8'),
  ) as number[][];

  checkMaxDimensions(dimensionsList);

  checkVkTreeSize(dimensionsList.length);

  const resetVariantTags = dimensionsList.map(dimensions => `_${dimensions.join('_')}`);
  const maxDimensionsTag = maxDimensions.join('_');
  const importTags = dimensionsList
    .map(dimensions => dimensions.join('_'))
    .map(tag => (tag === maxDimensionsTag ? '' : `_${tag}`));

  const content = `
    /* eslint-disable camelcase */
    // GENERATED FILE - DO NOT EDIT. RUN \`yarn generate\` or \`yarn generate:reset-data\`

    ${generateImports()}
    ${generateArtifactImports(importTags)}
    ${generateSimulatedArtifactImports(importTags)}
    ${generateVksImports(importTags)}

    ${generateArtifactNames(resetVariantTags)}

    ${generateArtifacts(resetVariantTags, importTags)}

    ${generateSimulatedArtifacts(resetVariantTags, importTags)}

    ${generateVks(resetVariantTags, importTags)}

    ${generateVkIndexes(resetVariantTags)}

    export const privateKernelResetDimensionsConfig: PrivateKernelResetDimensionsConfig = ${JSON.stringify(config)};

    export const maxPrivateKernelResetDimensions = PrivateKernelResetDimensions.fromValues([${maxDimensions.join(
      ',',
    )}]);
  `;

  await fs.writeFile(outputFilename, content);
};

try {
  await main();
} catch (err: unknown) {
  log(`Error generating private kernel reset data: ${err}`);
  process.exit(1);
}
