import {
  MAX_KEY_VALIDATION_REQUESTS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
  PRIVATE_KERNEL_RESET_BLOCK_END,
  PRIVATE_KERNEL_RESET_TAIL_TO_PUBLIC_VK_INDEX,
  PRIVATE_KERNEL_RESET_TAIL_VK_INDEX,
  PRIVATE_KERNEL_RESET_VK_INDEX,
  VK_TREE_HEIGHT,
} from '@aztec/constants';
import { createConsoleLogger } from '@aztec/foundation/log';
import type { PrivateKernelResetDimensionsConfig } from '@aztec/stdlib/kernel';

import { promises as fs } from 'fs';

const log = createConsoleLogger('autogenerate');

const outputFilename = './src/private_kernel_reset_data.ts';
const outputTypesFilename = './src/private_kernel_reset_types.ts';
const outputVksFilename = './src/private_kernel_reset_vks.ts';

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

// A "family" groups the codegen for one of the three reset-circuit catalog groups:
//   - inner:             mid-tx reset variants (no siloing). Compiled artifacts named
//                        `private_kernel_reset[_<tag>]`. VK indices counted from
//                        PRIVATE_KERNEL_RESET_VK_INDEX. Type union name is `PrivateResetArtifact`.
//   - finalTail:         terminal reset+tail variants (private-only). Artifacts
//                        `private_kernel_reset_tail[_<tag>]`. VK indices from
//                        PRIVATE_KERNEL_RESET_TAIL_VK_INDEX. Type `PrivateResetTailArtifact`.
//   - finalTailToPublic: terminal reset+tail-to-public variants (public-bound). Artifacts
//                        `private_kernel_reset_tail_to_public[_<tag>]`. VK indices from
//                        PRIVATE_KERNEL_RESET_TAIL_TO_PUBLIC_VK_INDEX. Type
//                        `PrivateResetTailToPublicArtifact`.
//
// All three groups generate parallel output sections in `private_kernel_reset_{data,types,vks}.ts`.
interface Family {
  group: 'inner' | 'finalTail' | 'finalTailToPublic';
  /** File-name prefix used both for the constrained and `_simulated` Noir artifacts. */
  filePrefix: string;
  /** Symbol prefix for generated TypeScript identifiers (artifact map keys, JSON-import vars). */
  artifactSymbolPrefix: string;
  /** Name of the per-family TypeScript type union exported by `private_kernel_reset_types.ts`. */
  typeName: string;
  /** Name of the per-family file-name table exported by `private_kernel_reset_types.ts`. */
  fileNamesTableName: string;
  /** Name of the per-family artifact map exported by `private_kernel_reset_data.ts`. */
  artifactsMapName: string;
  /** Name of the per-family simulated-artifact map exported by `private_kernel_reset_data.ts`. */
  simulatedArtifactsMapName: string;
  /** Name of the per-family VK map exported by `private_kernel_reset_vks.ts`. */
  vksMapName: string;
  /** Name of the per-family VK-index map exported by `private_kernel_reset_vks.ts`. */
  vkIndexesMapName: string;
  /** VK-tree index of the family's first variant. Subsequent variants get +1, +2, ... */
  vkIndexBase: number;
}

const families: Family[] = [
  {
    group: 'inner',
    filePrefix: 'private_kernel_reset',
    artifactSymbolPrefix: 'PrivateKernelResetArtifact',
    typeName: 'PrivateResetArtifact',
    fileNamesTableName: 'PrivateKernelResetArtifactFileNames',
    artifactsMapName: 'PrivateKernelResetArtifacts',
    simulatedArtifactsMapName: 'PrivateKernelResetSimulatedArtifacts',
    vksMapName: 'PrivateKernelResetVks',
    vkIndexesMapName: 'PrivateKernelResetVkIndexes',
    vkIndexBase: PRIVATE_KERNEL_RESET_VK_INDEX,
  },
  {
    group: 'finalTail',
    filePrefix: 'private_kernel_reset_tail',
    artifactSymbolPrefix: 'PrivateKernelResetTailArtifact',
    typeName: 'PrivateResetTailArtifact',
    fileNamesTableName: 'PrivateKernelResetTailArtifactFileNames',
    artifactsMapName: 'PrivateKernelResetTailArtifacts',
    simulatedArtifactsMapName: 'PrivateKernelResetTailSimulatedArtifacts',
    vksMapName: 'PrivateKernelResetTailVks',
    vkIndexesMapName: 'PrivateKernelResetTailVkIndexes',
    vkIndexBase: PRIVATE_KERNEL_RESET_TAIL_VK_INDEX,
  },
  {
    group: 'finalTailToPublic',
    filePrefix: 'private_kernel_reset_tail_to_public',
    artifactSymbolPrefix: 'PrivateKernelResetTailToPublicArtifact',
    typeName: 'PrivateResetTailToPublicArtifact',
    fileNamesTableName: 'PrivateKernelResetTailToPublicArtifactFileNames',
    artifactsMapName: 'PrivateKernelResetTailToPublicArtifacts',
    simulatedArtifactsMapName: 'PrivateKernelResetTailToPublicSimulatedArtifacts',
    vksMapName: 'PrivateKernelResetTailToPublicVks',
    vkIndexesMapName: 'PrivateKernelResetTailToPublicVkIndexes',
    vkIndexBase: PRIVATE_KERNEL_RESET_TAIL_TO_PUBLIC_VK_INDEX,
  },
];

function tagOf(dimensions: number[]) {
  return dimensions.join('_');
}

function isFullDimensions(dimensions: number[]) {
  return dimensions.every((v, i) => v === maxDimensions[i]);
}

function artifactSymbol(family: Family, dimensions: number[]) {
  return `${family.artifactSymbolPrefix}_${tagOf(dimensions)}`;
}

// Variants whose dimensions equal the protocol maxima use the un-tagged base file
// (e.g. `private_kernel_reset.json` rather than `private_kernel_reset_64_64_...json`).
function artifactFileName(family: Family, dimensions: number[]) {
  return isFullDimensions(dimensions) ? family.filePrefix : `${family.filePrefix}_${tagOf(dimensions)}`;
}

function jsonImportVar(family: Family, dimensions: number[], simulated = false) {
  const suffix = isFullDimensions(dimensions) ? '' : `_${tagOf(dimensions)}`;
  return `${simulated ? `${family.artifactSymbolPrefix}SimulatedJson` : `${family.artifactSymbolPrefix}Json`}${suffix}`;
}

function generateFamilyArtifactImports(family: Family, dimensionsList: number[][]) {
  return dimensionsList
    .map(
      dims =>
        `import ${jsonImportVar(family, dims, false)} from '../artifacts/${artifactFileName(family, dims)}.json' with { type: 'json' };`,
    )
    .join('\n');
}

function generateFamilySimulatedArtifactImports(family: Family, dimensionsList: number[][]) {
  return dimensionsList
    .map(
      dims =>
        `import ${jsonImportVar(family, dims, true)} from '../artifacts/${family.filePrefix}_simulated${isFullDimensions(dims) ? '' : `_${tagOf(dims)}`}.json' with { type: 'json' };`,
    )
    .join('\n');
}

function generateFamilyTypeUnion(family: Family, dimensionsList: number[][]) {
  const symbols = dimensionsList.map(dims => `'${artifactSymbol(family, dims)}'`).join('|');
  return `export type ${family.typeName} = ${symbols};`;
}

function generateFamilyFileNamesTable(family: Family, dimensionsList: number[][]) {
  const entries = dimensionsList
    .map(dims => `  ${artifactSymbol(family, dims)}: '${artifactFileName(family, dims)}'`)
    .join(',\n');
  return `export const ${family.fileNamesTableName} = {\n${entries}\n};`;
}

function generateFamilyArtifactsMap(family: Family, dimensionsList: number[][], simulated: boolean) {
  const mapName = simulated ? family.simulatedArtifactsMapName : family.artifactsMapName;
  const entries = dimensionsList
    .map(dims => `  ${artifactSymbol(family, dims)}: ${jsonImportVar(family, dims, simulated)} as NoirCompiledCircuit,`)
    .join('\n');
  return `export const ${mapName}: Record<${family.typeName}, NoirCompiledCircuit> = {\n${entries}\n};`;
}

function generateFamilyVksMap(family: Family, dimensionsList: number[][]) {
  const entries = dimensionsList
    .map(dims => `  ${artifactSymbol(family, dims)}: abiToVKData(${jsonImportVar(family, dims, false)}),`)
    .join('\n');
  return `export const ${family.vksMapName}: Record<${family.typeName}, VerificationKeyData> = {\n${entries}\n};`;
}

function generateFamilyVkIndexes(family: Family, dimensionsList: number[][]) {
  const entries = dimensionsList
    .map((dims, i) => `  ${artifactSymbol(family, dims)}: ${family.vkIndexBase + i},`)
    .join('\n');
  return `export const ${family.vkIndexesMapName}: Record<${family.typeName}, number> = {\n${entries}\n};`;
}

function checkVariantsCovered(group: string, dimensionsList: number[][]) {
  if (!dimensionsList.length) {
    throw new Error(`private_kernel_reset_dimensions.json contains no ${group} variants`);
  }
  dimensionsList.forEach(dimensions => {
    if (dimensions.some((v, i) => v > maxDimensions[i])) {
      throw new Error(
        `${group} variant dimensions exceed protocol maxima: variant=[${dimensions.join(',')}] max=[${maxDimensions.join(',')}]`,
      );
    }
  });
  // Each terminal-reset family must contain a catch-all matching protocol maxima so the selector
  // can always find a fall-through. The inner family does not need this (mid-tx resets can split
  // work across multiple variants if no single one covers).
  if (group !== 'inner' && !dimensionsList.some(dims => dims.every((v, i) => v === maxDimensions[i]))) {
    throw new Error(`${group} family must contain a variant matching protocol maxima: [${maxDimensions.join(',')}]`);
  }
}

function checkVkTreeSize(families: Family[], dimensionsByGroup: Record<string, number[][]>) {
  const treeSize = 2 ** VK_TREE_HEIGHT;
  for (const family of families) {
    const maxIndex = family.vkIndexBase + dimensionsByGroup[family.group].length;
    if (maxIndex >= treeSize) {
      throw new Error(
        `Insufficient VK tree height for ${family.group}: max index ${maxIndex} ≥ tree size ${treeSize}.`,
      );
    }
  }
}

// Both terminal families must expose identical dimension shapes: the selector picks dimensions
// identically for either path, so a shape missing from one family would silently fall through to
// the catch-all (`all_64`) and degrade gate counts without a build failure.
function checkTerminalFamiliesShareShapes(dimensionsByGroup: Record<string, number[][]>) {
  const tail = dimensionsByGroup.finalTail.map(d => d.join('_')).sort();
  const tailToPublic = dimensionsByGroup.finalTailToPublic.map(d => d.join('_')).sort();
  if (tail.length !== tailToPublic.length || tail.some((s, i) => s !== tailToPublic[i])) {
    throw new Error(
      'finalTail and finalTailToPublic must contain identical dimension shapes ' +
        '(see comment in generate_private_kernel_reset_data.ts).\n' +
        `  finalTail:         ${tail.join(', ')}\n` +
        `  finalTailToPublic: ${tailToPublic.join(', ')}`,
    );
  }
}

// VK index blocks must remain contiguous and non-overlapping within the reset-family range
// [PRIVATE_KERNEL_RESET_VK_INDEX, PRIVATE_KERNEL_RESET_BLOCK_END). If a family grows past its
// allocated block it will collide with the next family's base, or (for the last family) spill
// past PRIVATE_KERNEL_RESET_BLOCK_END into non-reset VK indices.
function checkVkBlocksFit(families: Family[], dimensionsByGroup: Record<string, number[][]>) {
  const ordered = [...families].sort((a, b) => a.vkIndexBase - b.vkIndexBase);
  for (let i = 0; i < ordered.length; i++) {
    const fam = ordered[i];
    const size = dimensionsByGroup[fam.group].length;
    const nextBase = i + 1 < ordered.length ? ordered[i + 1].vkIndexBase : PRIVATE_KERNEL_RESET_BLOCK_END;
    if (fam.vkIndexBase + size > nextBase) {
      const boundLabel =
        i + 1 < ordered.length
          ? `next family starts at ${nextBase}`
          : `the reset-reserved block ends at ${PRIVATE_KERNEL_RESET_BLOCK_END} (PRIVATE_KERNEL_RESET_BLOCK_END)`;
      throw new Error(
        `Family ${fam.group} overflows its allocated VK index block: base=${fam.vkIndexBase}, ` +
          `size=${size}, would reach ${fam.vkIndexBase + size - 1} but ${boundLabel}. ` +
          `Bump the bounds in noir-projects/.../constants.nr (and the corresponding TypeScript ` +
          `constant) to make room.`,
      );
    }
  }
}

const main = async () => {
  const config = JSON.parse(
    await fs.readFile('../../noir-projects/noir-protocol-circuits/private_kernel_reset_config.json', 'utf8'),
  ) as PrivateKernelResetDimensionsConfig;

  const dimensionsByGroup = JSON.parse(
    await fs.readFile('../../noir-projects/noir-protocol-circuits/private_kernel_reset_dimensions.json', 'utf8'),
  ) as Record<string, number[][]>;

  for (const family of families) {
    const dimensionsList = dimensionsByGroup[family.group];
    if (!dimensionsList) {
      throw new Error(`private_kernel_reset_dimensions.json is missing the ${family.group} group`);
    }
    checkVariantsCovered(family.group, dimensionsList);
  }
  checkTerminalFamiliesShareShapes(dimensionsByGroup);
  checkVkTreeSize(families, dimensionsByGroup);
  checkVkBlocksFit(families, dimensionsByGroup);

  // Per-family sections of each output file.
  const dataSections = families.flatMap(family => {
    const dims = dimensionsByGroup[family.group];
    return [
      generateFamilyArtifactImports(family, dims),
      generateFamilySimulatedArtifactImports(family, dims),
      generateFamilyArtifactsMap(family, dims, false),
      generateFamilyArtifactsMap(family, dims, true),
    ];
  });

  const typeSections = families.flatMap(family => {
    const dims = dimensionsByGroup[family.group];
    return [generateFamilyTypeUnion(family, dims), generateFamilyFileNamesTable(family, dims)];
  });

  const vkSections = families.flatMap(family => {
    const dims = dimensionsByGroup[family.group];
    return [
      generateFamilyArtifactImports(family, dims),
      generateFamilyVksMap(family, dims),
      generateFamilyVkIndexes(family, dims),
    ];
  });

  const content = `
    /* eslint-disable camelcase */
    // GENERATED FILE - DO NOT EDIT. RUN \`yarn generate\` or \`yarn generate:reset-data\`

    import type { NoirCompiledCircuit } from '@aztec/stdlib/noir';

    import type {
      ${families.map(f => f.typeName).join(',\n      ')},
    } from './private_kernel_reset_types.js';

    ${dataSections.join('\n\n')}
  `;

  const typeFileContent = `
    /* eslint-disable camelcase */
    // GENERATED FILE - DO NOT EDIT. RUN \`yarn generate\` or \`yarn generate:reset-data\`

    import { PrivateKernelResetDimensions, type PrivateKernelResetDimensionsConfig } from '@aztec/stdlib/kernel';

    ${typeSections.join('\n\n')}

    export const privateKernelResetDimensionsConfig: PrivateKernelResetDimensionsConfig = ${JSON.stringify(config)};

    export const maxPrivateKernelResetDimensions = PrivateKernelResetDimensions.fromValues([${maxDimensions.join(',')}]);
  `;

  const vkFileContent = `
    /* eslint-disable camelcase */
    // GENERATED FILE - DO NOT EDIT. RUN \`yarn generate\` or \`yarn generate:reset-data\`

    import type { VerificationKeyData } from '@aztec/stdlib/vks';
    import { abiToVKData } from './utils/vk_json.js';

    import type {
      ${families.map(f => f.typeName).join(',\n      ')},
    } from './private_kernel_reset_types.js';

    ${vkSections.join('\n\n')}
  `;

  await fs.writeFile(outputFilename, content);
  await fs.writeFile(outputTypesFilename, typeFileContent);
  await fs.writeFile(outputVksFilename, vkFileContent);
};

try {
  await main();
} catch (err: unknown) {
  log(`Error generating private kernel reset data: ${err}`);
  process.exit(1);
}
