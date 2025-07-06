import {
  CANONICAL_AUTH_REGISTRY_ADDRESS,
  CONTRACT_CLASS_PUBLISHED_MAGIC_VALUE,
  CONTRACT_CLASS_REGISTRY_CONTRACT_ADDRESS,
  CONTRACT_CLASS_REGISTRY_PRIVATE_FUNCTION_BROADCASTED_MAGIC_VALUE,
  CONTRACT_CLASS_REGISTRY_UTILITY_FUNCTION_BROADCASTED_MAGIC_VALUE,
  CONTRACT_INSTANCE_PUBLISHED_MAGIC_VALUE,
  CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS,
  CONTRACT_INSTANCE_UPDATED_MAGIC_VALUE,
  FEE_JUICE_ADDRESS,
  MULTI_CALL_ENTRYPOINT_ADDRESS,
  ROUTER_ADDRESS,
} from '@aztec/constants';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { createConsoleLogger } from '@aztec/foundation/log';
import { loadContractArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import { type NoirCompiledContract } from '@aztec/stdlib/noir';

import { promises as fs } from 'fs';
import path from 'path';

import { buildProtocolContractTree } from '../build_protocol_contract_tree.js';

const log = createConsoleLogger('autogenerate');

const noirContractsRoot = '../../noir-projects/noir-contracts';
const srcPath = path.join(noirContractsRoot, './target');
const destArtifactsDir = './artifacts';
const outputFilePath = './src/protocol_contract_data.ts';

const salt = new Fr(1);

const contractAddressMapping: { [name: string]: number } = {
  AuthRegistry: CANONICAL_AUTH_REGISTRY_ADDRESS,
  ContractInstanceRegistry: CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS,
  ContractClassRegistry: CONTRACT_CLASS_REGISTRY_CONTRACT_ADDRESS,
  MultiCallEntrypoint: MULTI_CALL_ENTRYPOINT_ADDRESS,
  FeeJuice: FEE_JUICE_ADDRESS,
  Router: ROUTER_ADDRESS,
};

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

async function computeContractLeaf(artifact: NoirCompiledContract) {
  const instance = await getContractInstanceFromInstantiationParams(loadContractArtifact(artifact), { salt });
  return instance.address;
}

async function computeRoot(names: string[], leaves: Fr[]) {
  const data = names.map((name, i) => ({
    address: new AztecAddress(new Fr(contractAddressMapping[name])),
    leaf: leaves[i],
  }));
  const tree = await buildProtocolContractTree(data);
  return Fr.fromBuffer(tree.root);
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
    export const protocolContractNames = [
      ${names.map(name => `'${name}'`).join(',\n')}
    ] as const;

    export type ProtocolContractName = typeof protocolContractNames[number];
  `;
}

function generateSalts(names: string[]) {
  return `
    export const ProtocolContractSalt: Record<ProtocolContractName, Fr> = {
      ${names.map(name => `${name}: new Fr(${salt.toNumber()})`).join(',\n')}
    };
  `;
}

function generateContractAddresses(names: string[]) {
  const addresses = names.map(name => `${name}: AztecAddress.fromBigInt(${contractAddressMapping[name]}n)`).join(',\n');
  return `
    export const ProtocolContractAddress: Record<ProtocolContractName, AztecAddress> = {
      ${addresses}
    };
  `;
}

function generateContractLeaves(names: string[], leaves: Fr[]) {
  return `
    export const ProtocolContractLeaves = {
      ${leaves.map((leaf, i) => `${names[i]}: Fr.fromHexString('${leaf.toString()}')`).join(',\n')}
    };
  `;
}

async function generateRoot(names: string[], leaves: Fr[]) {
  const root = await computeRoot(names, leaves);
  return `
    export const protocolContractTreeRoot = Fr.fromHexString('${root.toString()}');
  `;
}

// Generate the siloed log tags for events emitted via private logs.
async function generateLogTags() {
  return `
  export const CONTRACT_INSTANCE_PUBLISHED_EVENT_TAG = Fr.fromHexString('${await poseidon2Hash([
    CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS,
    CONTRACT_INSTANCE_PUBLISHED_MAGIC_VALUE,
  ])}');
  `;
}

async function generateOutputFile(names: string[], leaves: Fr[]) {
  const content = `
    // GENERATED FILE - DO NOT EDIT. RUN \`yarn generate\` or \`yarn generate:data\`
    import { Fr } from '@aztec/foundation/fields';
    import { AztecAddress } from '@aztec/stdlib/aztec-address';

    ${generateNames(names)}

    ${generateSalts(names)}

    ${generateContractAddresses(names)}

    ${generateContractLeaves(names, leaves)}

    ${await generateRoot(names, leaves)}

    ${await generateLogTags()}
  `;
  await fs.writeFile(outputFilePath, content);
}

async function main() {
  await clearDestDir();

  const srcNames = JSON.parse(
    await fs.readFile(path.join(noirContractsRoot, 'protocol_contracts.json'), 'utf8'),
  ) as string[];

  const leaves: Fr[] = [];
  const destNames = srcNames.map(n => n.split('-')[1]);
  for (let i = 0; i < srcNames.length; i++) {
    const srcName = srcNames[i];
    const destName = destNames[i];
    const artifact = await copyArtifact(srcName, destName);
    await generateDeclarationFile(destName);
    const contractLeaf = await computeContractLeaf(artifact);
    leaves.push(contractLeaf.toField());
  }

  await generateOutputFile(destNames, leaves);
}

try {
  await main();
} catch (err: unknown) {
  log(`Error copying protocol contract artifacts: ${err}`);
  process.exit(1);
}
