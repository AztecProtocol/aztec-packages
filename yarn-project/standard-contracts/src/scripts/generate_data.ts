// Reads compiled Noir artifacts for each standard contract and derives their addresses, class IDs,
// bytecode commitments, and initialization hashes — emitting everything as precomputed constants
// into `standard_contract_data.ts` and as Noir address stamps into
// `noir-projects/aztec-nr/standard_addresses/src/lib.nr`. This avoids clients repeating the
// expensive hashing at runtime and keeps the Noir-side address aligned with the TS-side.
import { Fr } from '@aztec/foundation/curves/bn254';
import { createConsoleLogger } from '@aztec/foundation/log';
import { loadContractArtifact } from '@aztec/stdlib/abi';
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
// constant name to emit. Add a row here when introducing a new standard contract.
const standardContracts: { name: string; src: string; nrConst: string }[] = [
  { name: 'AuthRegistry', src: 'auth_registry_contract-AuthRegistry', nrConst: 'AUTH_REGISTRY_ADDRESS' },
];

type ContractData = {
  address: AztecAddress;
  classId: Fr;
  artifactHash: Fr;
  privateFunctionsRoot: Fr;
  publicBytecodeCommitment: Fr;
  initializationHash: Fr;
};

async function clearDestDir() {
  try {
    await fs.access(destArtifactsDir);
    await fs.rm(destArtifactsDir, { recursive: true, force: true, maxRetries: 3 });
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      log(`Error removing dest directory: ${err}`);
    }
  }
  await fs.mkdir(destArtifactsDir, { recursive: true });
}

async function copyArtifact(srcName: string, destName: string): Promise<NoirCompiledContract> {
  const src = path.join(srcPath, `${srcName}.json`);
  const artifact = JSON.parse(await fs.readFile(src, 'utf8')) as NoirCompiledContract;
  await fs.copyFile(src, path.join(destArtifactsDir, `${destName}.json`));
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

async function computeContractData(artifact: NoirCompiledContract): Promise<ContractData> {
  const loaded = loadContractArtifact(artifact);
  const contractClass = await getContractClassFromArtifact(loaded);
  const constructorArtifact = loaded.functions.find(f => f.name === 'constructor');
  const initializationHash = await computeInitializationHash(constructorArtifact, []);
  const address = await computeContractAddressFromInstance({
    version: 1 as const,
    currentContractClassId: contractClass.id,
    originalContractClassId: contractClass.id,
    initializationHash,
    publicKeys: PublicKeys.default(),
    salt,
    deployer,
  });
  return {
    address,
    classId: contractClass.id,
    artifactHash: contractClass.artifactHash,
    privateFunctionsRoot: contractClass.privateFunctionsRoot,
    publicBytecodeCommitment: contractClass.publicBytecodeCommitment,
    initializationHash,
  };
}

function renderTsData(entries: { name: string; data: ContractData }[]): string {
  const join = (render: (e: { name: string; data: ContractData }) => string) => entries.map(render).join(',\n');
  return `// GENERATED FILE - DO NOT EDIT. RUN \`yarn generate\` or \`yarn generate:data\`
import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

export const standardContractNames = [${entries.map(e => `'${e.name}'`).join(', ')}] as const;

export type StandardContractName = (typeof standardContractNames)[number];

export const StandardContractSalt: Record<StandardContractName, Fr> = {
  ${join(e => `${e.name}: new Fr(${salt.toNumber()})`)},
};

export const StandardContractAddress: Record<StandardContractName, AztecAddress> = {
  ${join(e => `${e.name}: AztecAddress.fromString('${e.data.address.toString()}')`)},
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  ${join(e => `${e.name}: Fr.fromString('${e.data.classId.toString()}')`)},
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  ${join(
    e => `${e.name}: {
    artifactHash: Fr.fromString('${e.data.artifactHash.toString()}'),
    privateFunctionsRoot: Fr.fromString('${e.data.privateFunctionsRoot.toString()}'),
    publicBytecodeCommitment: Fr.fromString('${e.data.publicBytecodeCommitment.toString()}'),
  }`,
  )},
};

export const StandardContractInitializationHash: Record<StandardContractName, Fr> = {
  ${join(e => `${e.name}: Fr.fromString('${e.data.initializationHash.toString()}')`)},
};
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

async function main() {
  await clearDestDir();

  const entries: { name: string; nrConst: string; data: ContractData }[] = [];
  for (const { name, src, nrConst } of standardContracts) {
    const artifact = await copyArtifact(src, name);
    await generateDeclarationFile(name);
    entries.push({ name, nrConst, data: await computeContractData(artifact) });
  }

  await fs.writeFile(outputFilePath, renderTsData(entries));

  await fs.mkdir(path.dirname(noirAddressesPath), { recursive: true });
  await fs.writeFile(
    noirAddressesPath,
    renderNoirAddresses(entries.map(e => ({ nrConst: e.nrConst, address: e.data.address }))),
  );
}

try {
  await main();
} catch (err: unknown) {
  log(`Error generating standard contract data: ${err}`);
  process.exit(1);
}
