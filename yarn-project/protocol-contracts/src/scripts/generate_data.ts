import {
  CANONICAL_AUTH_REGISTRY_ADDRESS,
  DEPLOYER_CONTRACT_ADDRESS,
  FEE_JUICE_ADDRESS,
  Fr,
  MULTI_CALL_ENTRYPOINT_ADDRESS,
  REGISTERER_CONTRACT_ADDRESS,
  ROUTER_ADDRESS,
  getContractInstanceFromDeployParams,
} from '@aztec/circuits.js';
import { createConsoleLogger } from '@aztec/foundation/log';
import { loadContractArtifact } from '@aztec/types/abi';
import { type NoirCompiledContract } from '@aztec/types/noir';

import fs from 'fs/promises';
import path from 'path';

import { buildProtocolContractTree } from '../build_protocol_contract_tree.js';

const log = createConsoleLogger('aztec:autogenerate');

const noirContractsRoot = '../../noir-projects/noir-contracts';
const srcPath = path.join(noirContractsRoot, './target');
const destArtifactsDir = './artifacts';
const outputFilePath = './src/protocol_contract_data.ts';

const salt = new Fr(1);

const contractAddressMapping: { [name: string]: number } = {
  AuthRegistry: CANONICAL_AUTH_REGISTRY_ADDRESS,
  ContractInstanceDeployer: DEPLOYER_CONTRACT_ADDRESS,
  ContractClassRegisterer: REGISTERER_CONTRACT_ADDRESS,
  MultiCallEntrypoint: MULTI_CALL_ENTRYPOINT_ADDRESS,
  FeeJuice: FEE_JUICE_ADDRESS,
  Router: ROUTER_ADDRESS,
};

async function clearDestDir() {
  try {
    await fs.access(destArtifactsDir);
    // If the directory exists, remove it recursively.
    await fs.rm(destArtifactsDir, { recursive: true, force: true });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      // If the directory does not exist, do nothing.
    } else {
      log(`Error removing dest directory: ${err}`);
    }
  }
  await fs.mkdir(destArtifactsDir, { recursive: true });
}

function getPrivateFunctionNames(artifact: NoirCompiledContract) {
  return artifact.functions.filter(fn => fn.custom_attributes.includes('private')).map(fn => fn.name);
}

async function copyArtifact(srcName: string, destName: string) {
  const src = path.join(srcPath, `${srcName}.json`);
  const artifact = JSON.parse(await fs.readFile(src, 'utf8')) as NoirCompiledContract;
  const dest = path.join(destArtifactsDir, `${destName}.json`);
  await fs.copyFile(src, dest);
  return artifact;
}

async function copyVks(srcName: string, destName: string, fnNames: string[]) {
  const deskVksDir = path.join(destArtifactsDir, 'keys', destName);
  await fs.mkdir(deskVksDir, { recursive: true });

  for (const fnName of fnNames) {
    const src = path.join(srcPath, 'keys', `${srcName}-${fnName}.vk.data.json`);
    const dest = path.join(deskVksDir, `${fnName}.vk.data.json`);
    await fs.copyFile(src, dest);
  }
}

function computeContractLeaf(artifact: NoirCompiledContract) {
  const instance = getContractInstanceFromDeployParams(loadContractArtifact(artifact), { salt });
  return instance.address;
}

function computeRoot(names: string[], leaves: Fr[]) {
  const data = names.map((name, i) => ({ address: new Fr(contractAddressMapping[name]), leaf: leaves[i] }));
  const tree = buildProtocolContractTree(data);
  return Fr.fromBuffer(tree.root);
}

async function generateDeclarationFile(destName: string) {
  const content = `
    import { type NoirCompiledContract } from '@aztec/types/noir';
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

function generateArtifacts(names: string[]) {
  const imports = names
    .map(name => {
      return `
      import ${name}Json from '../artifacts/${name}.json' assert { type: 'json' };
    `;
    })
    .join('\n');

  const exports = names.map(name => `${name}: loadContractArtifact(${name}Json as NoirCompiledContract)`).join(',\n');

  return `
    ${imports}

    export const ProtocolContractArtifact: Record<ProtocolContractName, ContractArtifact> = {
      ${exports}
    };
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
    export const ProtocolContractLeaf = {
      ${leaves.map((leaf, i) => `${names[i]}: Fr.fromString('${leaf.toString()}')`).join(',\n')}
    };
  `;
}

function generateRoot(names: string[], leaves: Fr[]) {
  const root = computeRoot(names, leaves);
  return `
    export const protocolContractTreeRoot = Fr.fromString('${root.toString()}');
  `;
}

async function generateOutputFile(names: string[], leaves: Fr[]) {
  const content = `
    // GENERATED FILE - DO NOT EDIT. RUN \`yarn generate\` or \`yarn generate:data\`
    import { AztecAddress, Fr } from '@aztec/circuits.js';
    import { type ContractArtifact } from '@aztec/foundation/abi';
    import { loadContractArtifact } from '@aztec/types/abi';
    import { type NoirCompiledContract } from '@aztec/types/noir';

    ${generateNames(names)}

    ${generateArtifacts(names)}

    ${generateSalts(names)}

    ${generateContractAddresses(names)}

    ${generateContractLeaves(names, leaves)}

    ${generateRoot(names, leaves)}
  `;
  await fs.writeFile(outputFilePath, content);
}

async function main() {
  await clearDestDir();

  const srcNames = JSON.parse(
    await fs.readFile(path.join(noirContractsRoot, 'protocol_contracts.json'), 'utf8'),
  ) as string[];

  const leaves = [];
  const destNames = srcNames.map(n => n.split('-')[1]);
  for (let i = 0; i < srcNames.length; i++) {
    const srcName = srcNames[i];
    const destName = destNames[i];
    const artifact = await copyArtifact(srcName, destName);
    const fnNames = getPrivateFunctionNames(artifact);
    await copyVks(srcName, destName, fnNames);
    await generateDeclarationFile(destName);
    leaves.push(computeContractLeaf(artifact));
  }

  await generateOutputFile(destNames, leaves);
}

try {
  await main();
} catch (err: unknown) {
  log(`Error copying protocol contract artifacts: ${err}`);
  process.exit(1);
}
