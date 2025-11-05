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
  MAX_PROTOCOL_CONTRACTS,
  MULTI_CALL_ENTRYPOINT_ADDRESS,
  ROUTER_ADDRESS,
} from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { createConsoleLogger } from '@aztec/foundation/log';
import { loadContractArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import { type NoirCompiledContract } from '@aztec/stdlib/noir';
import { ProtocolContracts } from '@aztec/stdlib/tx';

import { promises as fs } from 'fs';
import path from 'path';

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

async function computeAddress(artifact: NoirCompiledContract) {
  const instance = await getContractInstanceFromInstantiationParams(loadContractArtifact(artifact), { salt });
  return instance.address;
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

function generateDerivedAddresses(names: string[], derivedAddresses: AztecAddress[]) {
  return `
    export const ProtocolContractDerivedAddress = {
      ${derivedAddresses.map((address, i) => `${names[i]}: AztecAddress.fromString('${address.toString()}')`).join(',\n')}
    };
  `;
}

async function generateProtocolContractsList(names: string[], derivedAddresses: AztecAddress[]) {
  const list = makeTuple(MAX_PROTOCOL_CONTRACTS, () => AztecAddress.zero());
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const address = contractAddressMapping[name];
    const derivedAddressIndex = address - 1;
    if (!list[derivedAddressIndex].equals(AztecAddress.zero())) {
      throw new Error(`Duplicate protocol contract address: ${address.toString()}`);
    }
    list[derivedAddressIndex] = derivedAddresses[i];
  }

  return `
    export const ProtocolContractsList = new ProtocolContracts([
      ${list.map(address => `AztecAddress.fromString('${address.toString()}')`).join(',\n')}
    ]);

    export const protocolContractsHash = Fr.fromString('${(await new ProtocolContracts(list).hash()).toString()}');
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

async function generateOutputFile(names: string[], derivedAddresses: AztecAddress[]) {
  const content = `
    // GENERATED FILE - DO NOT EDIT. RUN \`yarn generate\` or \`yarn generate:data\`
    import { Fr } from '@aztec/foundation/fields';
    import { AztecAddress } from '@aztec/stdlib/aztec-address';
    import { ProtocolContracts } from '@aztec/stdlib/tx';

    ${generateNames(names)}

    ${generateSalts(names)}

    ${generateContractAddresses(names)}

    ${generateDerivedAddresses(names, derivedAddresses)}

    ${await generateProtocolContractsList(names, derivedAddresses)}

    ${await generateLogTags()}
  `;
  await fs.writeFile(outputFilePath, content);
}

async function main() {
  await clearDestDir();

  const srcNames = JSON.parse(
    await fs.readFile(path.join(noirContractsRoot, 'protocol_contracts.json'), 'utf8'),
  ) as string[];

  const derivedAddresses: AztecAddress[] = [];
  const destNames = srcNames.map(n => n.split('-')[1]);
  for (let i = 0; i < srcNames.length; i++) {
    const srcName = srcNames[i];
    const destName = destNames[i];
    const artifact = await copyArtifact(srcName, destName);
    await generateDeclarationFile(destName);
    derivedAddresses.push(await computeAddress(artifact));
  }

  await generateOutputFile(destNames, derivedAddresses);
}

try {
  await main();
} catch (err: unknown) {
  log(`Error copying protocol contract artifacts: ${err}`);
  process.exit(1);
}
