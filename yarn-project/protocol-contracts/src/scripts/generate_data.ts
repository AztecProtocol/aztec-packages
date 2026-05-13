// Reads compiled Noir artifacts for each protocol contract and derives their addresses, class IDs,
// bytecode commitments, and other deployment data, emitting everything as precomputed constants into
// `protocol_contract_data.ts`. This avoids clients repeating the expensive hashing at runtime and
// ensures a single source of truth for the protocol contracts hash enforced by circuits, P2P, and L1.
import {
  CONTRACT_CLASS_REGISTRY_CONTRACT_ADDRESS,
  CONTRACT_INSTANCE_PUBLISHED_MAGIC_VALUE,
  CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS,
  FEE_JUICE_ADDRESS,
  MAX_PROTOCOL_CONTRACTS,
} from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createConsoleLogger } from '@aztec/foundation/log';
import { FunctionSelector, loadContractArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  computeContractAddressFromInstance,
  computeInitializationHash,
  getContractClassFromArtifact,
} from '@aztec/stdlib/contract';
import { computeSiloedPrivateLogFirstField } from '@aztec/stdlib/hash';
import { PublicKeys } from '@aztec/stdlib/keys';
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
  ContractInstanceRegistry: CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS,
  ContractClassRegistry: CONTRACT_CLASS_REGISTRY_CONTRACT_ADDRESS,
  FeeJuice: FEE_JUICE_ADDRESS,
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
// Protocol contracts come from a trusted source, so no class verifications are needed.
async function computeContractData(artifact: NoirCompiledContract, deployer: AztecAddress): Promise<ContractData> {
  const loaded = loadContractArtifact(artifact);
  const contractClass = await getContractClassFromArtifact(loaded);
  const constructorArtifact = loaded.functions.find(f => f.name === 'constructor');
  const initializationHash = await computeInitializationHash(constructorArtifact, []);
  const instance = {
    version: 2 as const,
    currentContractClassId: contractClass.id,
    originalContractClassId: contractClass.id,
    initializationHash,
    immutablesHash: Fr.ZERO, // Protocol Contracts Have No Immutables
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

function generateDerivedAddresses(names: string[], contractData: ContractData[]) {
  return `
    export const ProtocolContractDerivedAddress = {
      ${contractData.map((d, i) => `${names[i]}: AztecAddress.fromString('${d.address.toString()}')`).join(',\n')}
    };
  `;
}

function generateClassIdPreimages(names: string[], contractData: ContractData[]) {
  return `
    export const ProtocolContractClassId: Record<ProtocolContractName, Fr> = {
      ${contractData.map((d, i) => `${names[i]}: Fr.fromString('${d.classId.toString()}')`).join(',\n')}
    };

    export const ProtocolContractClassIdPreimage: Record<ProtocolContractName, { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }> = {
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

    export const ProtocolContractInitializationHash: Record<ProtocolContractName, Fr> = {
      ${contractData.map((d, i) => `${names[i]}: Fr.fromString('${d.initializationHash.toString()}')`).join(',\n')}
    };

    export const ProtocolContractPrivateFunctions: Record<ProtocolContractName, { selector: FunctionSelector; vkHash: Fr }[]> = {
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

async function generateProtocolContractsList(names: string[], contractData: ContractData[]) {
  const list = makeTuple(MAX_PROTOCOL_CONTRACTS, () => AztecAddress.zero());
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const address = contractAddressMapping[name];
    const derivedAddressIndex = address - 1;
    if (!list[derivedAddressIndex].equals(AztecAddress.zero())) {
      throw new Error(`Duplicate protocol contract address: ${address.toString()}`);
    }
    list[derivedAddressIndex] = contractData[i].address;
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
  export const CONTRACT_INSTANCE_PUBLISHED_EVENT_TAG = Fr.fromHexString('${await computeSiloedPrivateLogFirstField(
    new AztecAddress(new Fr(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS)),
    new Fr(CONTRACT_INSTANCE_PUBLISHED_MAGIC_VALUE),
  )}');
  `;
}

async function generateOutputFile(names: string[], contractData: ContractData[]) {
  const content = `
    // GENERATED FILE - DO NOT EDIT. RUN \`yarn generate\` or \`yarn generate:data\`
    import { Fr } from '@aztec/foundation/curves/bn254';
    import { FunctionSelector } from '@aztec/stdlib/abi';
    import { AztecAddress } from '@aztec/stdlib/aztec-address';
    import { ProtocolContracts } from '@aztec/stdlib/tx';

    ${generateNames(names)}

    ${generateSalts(names)}

    ${generateContractAddresses(names)}

    ${generateDerivedAddresses(names, contractData)}

    ${generateClassIdPreimages(names, contractData)}

    ${await generateProtocolContractsList(names, contractData)}

    ${await generateLogTags()}
  `;
  await fs.writeFile(outputFilePath, content);
}

async function main() {
  await clearDestDir();

  const srcNames = JSON.parse(
    await fs.readFile(path.join(noirContractsRoot, 'protocol_contracts.json'), 'utf8'),
  ) as string[];

  const contractDataList: ContractData[] = [];
  const destNames = srcNames.map(n => n.split('-')[1]);
  for (let i = 0; i < srcNames.length; i++) {
    const srcName = srcNames[i];
    const destName = destNames[i];
    const artifact = await copyArtifact(srcName, destName);
    await generateDeclarationFile(destName);
    contractDataList.push(
      await computeContractData(artifact, AztecAddress.fromBigInt(BigInt(contractAddressMapping[destName]))),
    );
  }

  await generateOutputFile(destNames, contractDataList);
}

try {
  await main();
} catch (err: unknown) {
  log(`Error copying protocol contract artifacts: ${err}`);
  process.exit(1);
}
