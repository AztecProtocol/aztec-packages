// Reads compiled Noir artifacts for each standard contract and derives their addresses, class IDs,
// bytecode commitments, and initialization hashes — emitting everything as precomputed constants
// into `standard_contract_data.ts` and as Noir address stamps into the `standard_addresses.nr`
// modules of `aztec-nr/aztec` and `noir-contracts/.../aztec_sublib`. This avoids clients repeating
// the expensive hashing at runtime and keeps the Noir-side address aligned with the TS-side.
//
// Drift detection: every invocation regenerates the output files unconditionally, then compares
// against the pre-write snapshot. If any file's content actually changed, the generator writes the
// new content (so the developer gets the regeneration for free) and exits non-zero with a clear
// error. This makes stale-address bugs loud at build time: the first pass writes the fresh
// addresses and fails, and a second `./bootstrap.sh` then recompiles dependent Noir contracts
// against the now-correct values.
import { Fr } from '@aztec/foundation/curves/bn254';
import { createConsoleLogger } from '@aztec/foundation/log';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { promises as fs } from 'fs';
import path from 'path';
import * as prettier from 'prettier';

import {
  type ContractData,
  computeContractData,
  destArtifactsDir,
  loadArtifact,
  noirAddressesPaths,
  outputFilePath,
  salt,
  srcArtifactsPath,
  standardContracts,
} from '../contract_data.js';

const log = createConsoleLogger('autogenerate');

async function clearDestDir() {
  try {
    await fs.access(destArtifactsDir);
    // If the directory exists, remove it recursively.
    await fs.rm(destArtifactsDir, { recursive: true, force: true, maxRetries: 3 });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      // If the directory does not exist, do nothing.
    } else {
      log(`Error removing dest directory: ${err}`);
    }
  }
  await fs.mkdir(destArtifactsDir, { recursive: true });
}

async function copyArtifact(srcName: string, destName: string) {
  const artifact = await loadArtifact(srcName);
  const src = path.join(srcArtifactsPath, `${srcName}.json`);
  const dest = path.join(destArtifactsDir, `${destName}.json`);
  await fs.copyFile(src, dest);
  return artifact;
}

async function generateDeclarationFile(destName: string) {
  const content = `
    import type { NoirCompiledContract } from '@aztec/stdlib/noir';
    const circuit: NoirCompiledContract;
    export = circuit;
  `;
  await fs.writeFile(path.join(destArtifactsDir, `${destName}.d.json.ts`), content);
}

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
      ${names.map(name => `${name}: new Fr(${salt.toNumber()})`).join(',\n')}
    };
  `;
}

function generateAddresses(names: string[], contractData: ContractData[]) {
  return `
    export const StandardContractAddress: Record<StandardContractName, AztecAddress> = {
      ${contractData.map((d, i) => `${names[i]}: AztecAddress.fromString('${d.address.toString()}')`).join(',\n')}
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

function renderOutputFile(names: string[], contractData: ContractData[]) {
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

function renderNoirAddresses(rows: { nrConst: string; address: AztecAddress }[]): string {
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
 * Reads a file's current content, or returns `null` if it doesn't exist. Used to snapshot a file
 * before overwriting so we can detect whether the new content actually differs.
 */
async function readIfExists(filePath: string): Promise<string | null> {
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
 * Formats TypeScript content with the repo's prettier config so the bytes written by the generator
 * match what the eventual `format` step in bootstrap.sh produces. Without this normalization the
 * drift check would false-positive on every run since the raw template-string output differs from
 * the prettier-formatted committed content. The Noir output skips this — its renderer already
 * emits format-stable content (`nargo fmt` would not rewrite it).
 */
async function formatTs(filePath: string, content: string): Promise<string> {
  const config = (await prettier.resolveConfig(path.resolve(filePath))) ?? {};
  return prettier.format(content, { ...config, filepath: filePath });
}

/**
 * Writes `content` to `filePath` unconditionally, then returns `filePath` if the on-disk content
 * actually changed (including the file not existing before). Returns `null` if the write was a
 * no-op. The caller collects the returned paths to decide whether to fail the build.
 */
async function writeAndDetectDrift(filePath: string, content: string): Promise<string | null> {
  const before = await readIfExists(filePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  return before === content ? null : filePath;
}

async function main() {
  await clearDestDir();

  const names = standardContracts.map(c => c.name);
  const contractDataList: ContractData[] = [];
  for (const { name, src } of standardContracts) {
    const artifact = await copyArtifact(src, name);
    await generateDeclarationFile(name);
    contractDataList.push(await computeContractData(artifact));
  }

  const driftedFiles: string[] = [];

  const tsOutput = await formatTs(outputFilePath, renderOutputFile(names, contractDataList));
  const tsDrift = await writeAndDetectDrift(outputFilePath, tsOutput);
  if (tsDrift !== null) {
    driftedFiles.push(tsDrift);
  }

  const noirAddressesContent = renderNoirAddresses(
    standardContracts
      .map((c, i) => ({ nrConst: c.nrConst, address: contractDataList[i].address }))
      .filter((row): row is { nrConst: string; address: AztecAddress } => row.nrConst !== null),
  );
  for (const noirAddressesPath of noirAddressesPaths) {
    const noirDrift = await writeAndDetectDrift(noirAddressesPath, noirAddressesContent);
    if (noirDrift !== null) {
      driftedFiles.push(noirDrift);
    }
  }

  if (driftedFiles.length > 0) {
    const list = driftedFiles.map(f => `  - ${f}`).join('\n');
    throw new Error(
      `Standard contract addresses have changed. The following generated files were out of date and have been rewritten with the freshly-derived values:\n${list}\n\n` +
        `Any aztec-nr-using Noir contract that already compiled against the previous addresses now has stale bytecode. ` +
        `Rebuild aztec-nr and noir-contracts so dependent contracts pick up the fresh addresses — re-running \`./bootstrap.sh\` ` +
        `once more is sufficient; the second pass picks up the now-correct values.`,
    );
  }
}

try {
  await main();
} catch (err: unknown) {
  log(`Error generating standard contract data: ${err}`);
  process.exit(1);
}
