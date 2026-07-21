// Build-time-only rendering and drift-detection plumbing shared by the generator
// (`scripts/generate_data.ts`) and the backup jest test (`standard_contract_data.test.ts`). Lives
// outside `contract_data.ts` so that `prettier` (a devDependency used only here) does not become a
// transitive runtime import of the published package.
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { promises as fs } from 'fs';
import path from 'path';
import * as prettier from 'prettier';

import {
  type ContractData,
  NOIR_STANDARD_ADDRESSES_PATHS,
  STANDARD_CONTRACT_DATA_OUTPUT_PATH,
  STANDARD_CONTRACT_SALT,
  standardContracts,
} from './contract_data.js';

function generateNames(names: string[]) {
  return `
    export const standardContractNames = [
      ${names.map(name => `'${name}'`).join(',\n')}
    ] as const;

    export type StandardContractName = typeof standardContractNames[number];
  `;
}

function generateSalts(names: string[]) {
  return `
    export const StandardContractSalt: Record<StandardContractName, Fr> = {
      ${names.map(name => `${name}: new Fr(${STANDARD_CONTRACT_SALT.toNumber()})`).join(',\n')}
    };
  `;
}

function generateAddresses(names: string[], contractData: ContractData[]) {
  return `
    export const StandardContractAddress: Record<StandardContractName, AztecAddress> = {
      ${contractData.map((d, i) => `${names[i]}: AztecAddress.fromStringUnsafe('${d.address.toString()}')`).join(',\n')}
    };
  `;
}

function generateClassIdPreimages(names: string[], contractData: ContractData[]) {
  return `
    export const StandardContractClassId: Record<StandardContractName, Fr> = {
      ${contractData.map((d, i) => `${names[i]}: Fr.fromString('${d.classId.toString()}')`).join(',\n')}
    };

    export const StandardContractClassIdPreimage: Record<StandardContractName, { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }> = {
      ${contractData
        .map(
          (d, i) => `${names[i]}: {
        artifactHash: Fr.fromString('${d.artifactHash.toString()}'),
        privateFunctionsRoot: Fr.fromString('${d.privateFunctionsRoot.toString()}'),
        publicBytecodeCommitment: Fr.fromString('${d.publicBytecodeCommitment.toString()}'),
      }`,
        )
        .join(',\n')}
    };

    export const StandardContractInitializationHash: Record<StandardContractName, Fr> = {
      ${contractData.map((d, i) => `${names[i]}: Fr.fromString('${d.initializationHash.toString()}')`).join(',\n')}
    };

    export const StandardContractPrivateFunctions: Record<StandardContractName, { selector: FunctionSelector; vkHash: Fr }[]> = {
      ${contractData
        .map(
          (d, i) =>
            `${names[i]}: [${d.privateFunctions
              .map(
                fn =>
                  `{ selector: FunctionSelector.fromField(Fr.fromString('${fn.selector.toField().toString()}')), vkHash: Fr.fromString('${fn.vkHash.toString()}') }`,
              )
              .join(', ')}]`,
        )
        .join(',\n')}
    };
  `;
}

/**
 * Renders the unformatted TypeScript content for `standard_contract_data.ts`. Run {@link formatTs}
 * on the result before comparing against the committed file — the committed file has been
 * prettier-formatted, so unformatted bytes will not byte-match.
 */
export function renderOutputFile(names: string[], contractData: ContractData[]): string {
  return `
    // GENERATED FILE - DO NOT EDIT. RUN \`yarn generate\` or \`yarn generate:data\`
    import { Fr } from '@aztec/foundation/curves/bn254';
    import { FunctionSelector } from '@aztec/stdlib/abi';
    import { AztecAddress } from '@aztec/stdlib/aztec-address';

    ${generateNames(names)}

    ${generateSalts(names)}

    ${generateAddresses(names, contractData)}

    ${generateClassIdPreimages(names, contractData)}
  `;
}

/**
 * Renders the content for each `standard_addresses.nr` twin. Format-stable — `nargo fmt` will not
 * rewrite the output, so the bytes returned here are byte-equal to what should be on disk.
 */
export function renderNoirAddresses(rows: { nrConst: string; address: AztecAddress }[]): string {
  // Pre-wrapped to survive `nargo fmt`'s line-width pass without diff churn.
  const globals = rows
    .map(
      r => `pub global ${r.nrConst}: AztecAddress = AztecAddress::from_field(
    ${r.address.toField().toString()},
);`,
    )
    .join('\n\n');
  return `// GENERATED FILE - DO NOT EDIT. RUN \`yarn workspace @aztec/standard-contracts run generate\`.
use protocol_types::{address::AztecAddress, traits::FromField};

${globals}
`;
}

/**
 * Formats TypeScript content with the repo's prettier config so the bytes emitted by the generator
 * (and the expected bytes used by the drift test) match what the eventual `format` step in
 * bootstrap.sh produces. Without this normalization the drift check would false-positive on every
 * run since the raw template-string output differs from the prettier-formatted committed content.
 *
 * The typescript/estree plugins are loaded eagerly and passed explicitly: prettier 3's default
 * lazy-loading via ESM dynamic import is unreliable under jest's `experimental-vm-modules` (the
 * VM context can tear down before the dynamic import resolves), which causes intermittent
 * `Cannot read properties of undefined (reading 'estree')` failures.
 */
export async function formatTs(filePath: string, content: string): Promise<string> {
  const [typescriptPlugin, estreePlugin] = await Promise.all([
    import('prettier/plugins/typescript.js'),
    import('prettier/plugins/estree.js'),
  ]);
  const config = (await prettier.resolveConfig(path.resolve(filePath))) ?? {};
  return prettier.format(content, {
    ...config,
    filepath: filePath,
    parser: 'typescript',
    plugins: [typescriptPlugin.default ?? typescriptPlugin, estreePlugin.default ?? estreePlugin],
  });
}

/** A rendered target file: the destination path and the exact bytes that should be on disk. */
export type RenderedTarget = { path: string; content: string };

/**
 * Renders every generator output target (the TS data file plus each `standard_addresses.nr` twin)
 * from a list of derived `ContractData`. The TS output is prettier-formatted so the result is
 * byte-comparable against the committed file. Both the generator and the drift test build their
 * comparison against this single function.
 */
export async function renderAllTargets(names: string[], contractData: ContractData[]): Promise<RenderedTarget[]> {
  const tsContent = await formatTs(STANDARD_CONTRACT_DATA_OUTPUT_PATH, renderOutputFile(names, contractData));
  const noirRows = standardContracts
    .map((c, i) => ({ nrConst: c.nrConst, address: contractData[i].address }))
    .filter((row): row is { nrConst: string; address: AztecAddress } => row.nrConst !== null);
  const noirContent = renderNoirAddresses(noirRows);
  return [
    { path: STANDARD_CONTRACT_DATA_OUTPUT_PATH, content: tsContent },
    ...NOIR_STANDARD_ADDRESSES_PATHS.map(p => ({ path: p, content: noirContent })),
  ];
}

/**
 * Reads a file's current content, or returns `null` if it doesn't exist. Used by the generator to
 * compare against freshly rendered output before deciding to overwrite, and by the drift test to
 * compare the committed file's bytes against the expected bytes.
 */
export async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * Compares `content` against the bytes currently at `filePath`. If they differ (including the file
 * not existing), writes the new content and returns `true`. If they match, leaves the file
 * untouched and returns `false`. Skipping the write when the content is identical avoids mtime
 * churn that would otherwise re-trigger downstream build steps on every generator run.
 */
export async function writeIfChanged(filePath: string, content: string): Promise<boolean> {
  const existing = await readIfExists(filePath);
  if (existing === content) {
    return false;
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  return true;
}
