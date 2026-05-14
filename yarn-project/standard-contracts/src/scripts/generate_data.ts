// Reads compiled Noir artifacts for each standard contract and derives their addresses, class IDs,
// bytecode commitments, and initialization hashes — emitting everything as precomputed constants
// into `standard_contract_data.ts` and as Noir address stamps into
// `noir-projects/aztec-nr/standard_addresses/src/lib.nr`. This avoids clients repeating the
// expensive hashing at runtime and keeps the Noir-side address aligned with the TS-side.
import { Fr } from '@aztec/foundation/curves/bn254';
import { createConsoleLogger } from '@aztec/foundation/log';
import { FunctionSelector, loadContractArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  computeContractAddressFromInstance,
  computeInitializationHash,
  getContractClassFromArtifact,
} from '@aztec/stdlib/contract';
import { PublicKeys } from '@aztec/stdlib/keys';
import { type NoirCompiledContract } from '@aztec/stdlib/noir';

import { promises as fs } from 'fs';
import path from 'path';

const log = createConsoleLogger('autogenerate');

const noirContractsRoot = '../../noir-projects/noir-contracts';
const srcPath = path.join(noirContractsRoot, './target');
const destArtifactsDir = './artifacts';
const outputFilePath = './src/standard_contract_data.ts';
const noirAddressesPath = '../../noir-projects/aztec-nr/standard_addresses/src/lib.nr';

const salt = new Fr(1);
const deployer = AztecAddress.zero();

// Maps each TS name to its source artifact name in `noir-contracts/target/` and the Noir
// constant name to emit. `nrConst: null` skips the Noir-side stamp for contracts with no
// Noir-side address consumer (e.g. account-side entrypoints). Add a row here when introducing
// a new standard contract.
const standardContracts: { name: string; src: string; nrConst: string | null }[] = [
  { name: 'AuthRegistry', src: 'auth_registry_contract-AuthRegistry', nrConst: 'AUTH_REGISTRY_ADDRESS' },
];

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
  const src = path.join(srcPath, `${srcName}.json`);
  const artifact = JSON.parse(await fs.readFile(src, 'utf8')) as NoirCompiledContract;
  const dest = path.join(destArtifactsDir, `${destName}.json`);
  await fs.copyFile(src, dest);
  return artifact;
}

type ContractData = {
  address: AztecAddress;
  classId: Fr;
  artifactHash: Fr;
  privateFunctionsRoot: Fr;
  publicBytecodeCommitment: Fr;
  initializationHash: Fr;
  privateFunctions: { selector: FunctionSelector; vkHash: Fr }[];
};

// Precompute all the expensive contract data that can be obtained from the artifact, to avoid redundant computations in clients.
// Standard contracts come from a trusted source (the build pipeline), so no class verifications are needed.
async function computeContractData(artifact: NoirCompiledContract): Promise<ContractData> {
  const loaded = loadContractArtifact(artifact);
  const contractClass = await getContractClassFromArtifact(loaded);
  const constructorArtifact = loaded.functions.find(f => f.name === 'constructor');
  const initializationHash = await computeInitializationHash(constructorArtifact, []);
  const instance = {
    version: 1 as const,
    currentContractClassId: contractClass.id,
    originalContractClassId: contractClass.id,
    initializationHash,
    publicKeys: PublicKeys.default(),
    salt,
    deployer,
  };
  const address = await computeContractAddressFromInstance(instance);
  return {
    address,
    classId: contractClass.id,
    artifactHash: contractClass.artifactHash,
    privateFunctionsRoot: contractClass.privateFunctionsRoot,
    publicBytecodeCommitment: contractClass.publicBytecodeCommitment,
    initializationHash,
    privateFunctions: contractClass.privateFunctions,
  };
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

async function generateOutputFile(names: string[], contractData: ContractData[]) {
  const content = `
    // GENERATED FILE - DO NOT EDIT. RUN \`yarn generate\` or \`yarn generate:data\`
    import { Fr } from '@aztec/foundation/curves/bn254';
    import { FunctionSelector } from '@aztec/stdlib/abi';
    import { AztecAddress } from '@aztec/stdlib/aztec-address';

    ${generateNames(names)}

    ${generateSalts(names)}

    ${generateAddresses(names, contractData)}

    ${generateClassIdPreimages(names, contractData)}
  `;
  await fs.writeFile(outputFilePath, content);
}

function generateNoirAddresses(rows: { nrConst: string; address: AztecAddress }[]): string {
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

async function main() {
  await clearDestDir();

  const names = standardContracts.map(c => c.name);
  const contractDataList: ContractData[] = [];
  for (const { name, src } of standardContracts) {
    const artifact = await copyArtifact(src, name);
    await generateDeclarationFile(name);
    contractDataList.push(await computeContractData(artifact));
  }

  await generateOutputFile(names, contractDataList);

  await fs.mkdir(path.dirname(noirAddressesPath), { recursive: true });
  await fs.writeFile(
    noirAddressesPath,
    generateNoirAddresses(
      standardContracts
        .map((c, i) => ({ nrConst: c.nrConst, address: contractDataList[i].address }))
        .filter((row): row is { nrConst: string; address: AztecAddress } => row.nrConst !== null),
    ),
  );
}

try {
  await main();
} catch (err: unknown) {
  log(`Error generating standard contract data: ${err}`);
  process.exit(1);
}
