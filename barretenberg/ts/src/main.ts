#!/usr/bin/env node
import 'source-map-support/register.js';
import { Crs, GrumpkinCrs, Barretenberg, RawBuffer } from './index.js';
import createDebug from 'debug';
import { readFileSync, writeFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { ungzip } from 'pako';
import { Command } from 'commander';
import { decode } from '@msgpack/msgpack';
import { Timer, writeBenchmark } from './benchmark/index.js';
import path from 'path';
import { UltraHonkBackendOptions } from './barretenberg/backend.js';
createDebug.log = console.error.bind(console);
const debug = createDebug('bb.js');

// Maximum circuit size for plonk we support in node and the browser is 2^19.
// This is because both node and browser use barretenberg.wasm which has a 4GB memory limit.
//
// This is not a restriction in the bb binary and one should be
// aware of this discrepancy, when creating proofs in bb versus
// creating the same proofs in the node CLI.
const MAX_ULTRAPLONK_CIRCUIT_SIZE_IN_WASM = 2 ** 19;
const threads = +process.env.HARDWARE_CONCURRENCY! || undefined;

function getBytecode(bytecodePath: string) {
  const extension = bytecodePath.substring(bytecodePath.lastIndexOf('.') + 1);

  if (extension == 'json') {
    const encodedCircuit = JSON.parse(readFileSync(bytecodePath, 'utf8'));
    const decompressed = gunzipSync(Buffer.from(encodedCircuit.bytecode, 'base64'));
    return decompressed;
  }

  const encodedCircuit = readFileSync(bytecodePath);
  const decompressed = gunzipSync(encodedCircuit);
  return decompressed;
}

function base64ToUint8Array(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function readStack(bytecodePath: string, numToDrop = 0) {
  const encodedPackedZippedBytecodeArray = readFileSync(bytecodePath, 'utf-8');
  const packedZippedBytecodeArray = base64ToUint8Array(encodedPackedZippedBytecodeArray);
  const zipped = decode(
    packedZippedBytecodeArray.subarray(0, packedZippedBytecodeArray.length - numToDrop),
  ) as Uint8Array[];
  const bytecodeArray = zipped.map((arr: Uint8Array) => ungzip(arr));
  return bytecodeArray;
}

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1126): split this into separate Plonk and Honk functions as their gate count differs
async function getGatesUltra(bytecodePath: string, recursive: boolean, honkRecursion: boolean, api: Barretenberg) {
  const { total } = await computeCircuitSize(bytecodePath, recursive, honkRecursion, api);
  return total;
}

function getWitness(witnessPath: string) {
  const data = readFileSync(witnessPath);
  const decompressed = gunzipSync(data);
  return decompressed;
}

async function computeCircuitSize(bytecodePath: string, recursive: boolean, honkRecursion: boolean, api: Barretenberg) {
  debug(`computing circuit size...`);
  const bytecode = getBytecode(bytecodePath);
  const [total, subgroup] = await api.acirGetCircuitSizes(bytecode, recursive, honkRecursion);
  return { total, subgroup };
}

async function initUltraPlonk(
  bytecodePath: string,
  recursive: boolean,
  crsPath: string,
  subgroupSizeOverride = -1,
  honkRecursion = false,
) {
  const api = await Barretenberg.new({ threads });

  // TODO(https://github.com/AztecProtocol/barretenberg/issues/1126): use specific UltraPlonk function
  const circuitSize = await getGatesUltra(bytecodePath, recursive, honkRecursion, api);
  // TODO(https://github.com/AztecProtocol/barretenberg/issues/811): remove subgroupSizeOverride hack for goblin
  const subgroupSize = Math.max(subgroupSizeOverride, Math.pow(2, Math.ceil(Math.log2(circuitSize))));

  if (subgroupSize > MAX_ULTRAPLONK_CIRCUIT_SIZE_IN_WASM) {
    throw new Error(`Circuit size of ${subgroupSize} exceeds max supported of ${MAX_ULTRAPLONK_CIRCUIT_SIZE_IN_WASM}`);
  }
  debug(`circuit size: ${circuitSize}`);
  debug(`subgroup size: ${subgroupSize}`);
  debug('loading crs...');
  // Plus 1 needed! (Move +1 into Crs?)
  const crs = await Crs.new(subgroupSize + 1, crsPath);

  // // Important to init slab allocator as first thing, to ensure maximum memory efficiency for Plonk.
  // TODO(https://github.com/AztecProtocol/barretenberg/issues/1129): Do slab allocator initialization?
  // await api.commonInitSlabAllocator(subgroupSize);

  // Load CRS into wasm global CRS state.
  // TODO: Make RawBuffer be default behavior, and have a specific Vector type for when wanting length prefixed.
  await api.srsInitSrs(new RawBuffer(crs.getG1Data()), crs.numPoints, new RawBuffer(crs.getG2Data()));
  const acirComposer = await api.acirNewAcirComposer(subgroupSize);
  return { api, acirComposer, circuitSize, subgroupSize };
}

async function initUltraHonk(bytecodePath: string, recursive: boolean, crsPath: string) {
  const api = await Barretenberg.new({ threads });

  // TODO(https://github.com/AztecProtocol/barretenberg/issues/1126): use specific UltraHonk function
  const circuitSize = await getGatesUltra(bytecodePath, recursive, /*honkRecursion=*/ true, api);
  // TODO(https://github.com/AztecProtocol/barretenberg/issues/811): remove subgroupSizeOverride hack for goblin
  const dyadicCircuitSize = Math.pow(2, Math.ceil(Math.log2(circuitSize)));

  debug(`circuit size: ${circuitSize}`);
  debug(`dyadic circuit size size: ${dyadicCircuitSize}`);
  debug('loading crs...');
  const crs = await Crs.new(dyadicCircuitSize + 1, crsPath);

  // Load CRS into wasm global CRS state.
  // TODO: Make RawBuffer be default behavior, and have a specific Vector type for when wanting length prefixed.
  await api.srsInitSrs(new RawBuffer(crs.getG1Data()), crs.numPoints, new RawBuffer(crs.getG2Data()));
  return { api, circuitSize, dyadicCircuitSize };
}

async function initClientIVC(crsPath: string) {
  const api = await Barretenberg.new({ threads });

  debug('loading BN254 and Grumpkin crs...');
  const crs = await Crs.new(2 ** 21 + 1, crsPath);
  const grumpkinCrs = await GrumpkinCrs.new(2 ** 16 + 1, crsPath);

  // Load CRS into wasm global CRS state.
  // TODO: Make RawBuffer be default behavior, and have a specific Vector type for when wanting length prefixed.
  await api.srsInitSrs(new RawBuffer(crs.getG1Data()), crs.numPoints, new RawBuffer(crs.getG2Data()));
  await api.srsInitGrumpkinSrs(new RawBuffer(grumpkinCrs.getG1Data()), grumpkinCrs.numPoints);
  return { api };
}

async function initLite(crsPath: string) {
  const api = await Barretenberg.new({ threads: 1 });

  // Plus 1 needed! (Move +1 into Crs?)
  const crs = await Crs.new(1, crsPath);

  // Load CRS into wasm global CRS state.
  await api.srsInitSrs(new RawBuffer(crs.getG1Data()), crs.numPoints, new RawBuffer(crs.getG2Data()));

  const acirComposer = await api.acirNewAcirComposer(0);
  return { api, acirComposer };
}

export async function proveAndVerify(bytecodePath: string, recursive: boolean, witnessPath: string, crsPath: string) {
  /* eslint-disable camelcase */
  const acir_test = path.basename(process.cwd());

  const { api, acirComposer, circuitSize, subgroupSize } = await initUltraPlonk(bytecodePath, recursive, crsPath);
  try {
    debug(`creating proof...`);
    const bytecode = getBytecode(bytecodePath);
    const witness = getWitness(witnessPath);

    const pkTimer = new Timer();
    await api.acirInitProvingKey(acirComposer, bytecode, recursive);
    writeBenchmark('pk_construction_time', pkTimer.ms(), { acir_test, threads });
    writeBenchmark('gate_count', circuitSize, { acir_test, threads });
    writeBenchmark('subgroup_size', subgroupSize, { acir_test, threads });

    const proofTimer = new Timer();
    const proof = await api.acirCreateProof(acirComposer, bytecode, recursive, witness);
    writeBenchmark('proof_construction_time', proofTimer.ms(), { acir_test, threads });

    debug(`verifying...`);
    const verified = await api.acirVerifyProof(acirComposer, proof);
    debug(`verified: ${verified}`);
    return verified;
  } finally {
    await api.destroy();
  }
  /* eslint-enable camelcase */
}

export async function proveAndVerifyUltraHonk(
  bytecodePath: string,
  recursive: boolean,
  witnessPath: string,
  crsPath: string,
) {
  /* eslint-disable camelcase */
  const { api } = await initUltraHonk(bytecodePath, false, crsPath);
  try {
    const bytecode = getBytecode(bytecodePath);
    const witness = getWitness(witnessPath);

    const verified = await api.acirProveAndVerifyUltraHonk(bytecode, recursive, witness);
    return verified;
  } finally {
    await api.destroy();
  }
  /* eslint-enable camelcase */
}

export async function proveAndVerifyMegaHonk(
  bytecodePath: string,
  recursive: boolean,
  witnessPath: string,
  crsPath: string,
) {
  /* eslint-disable camelcase */
  const { api } = await initUltraPlonk(bytecodePath, false, crsPath);
  try {
    const bytecode = getBytecode(bytecodePath);
    const witness = getWitness(witnessPath);

    const verified = await api.acirProveAndVerifyMegaHonk(bytecode, recursive, witness);
    return verified;
  } finally {
    await api.destroy();
  }
  /* eslint-enable camelcase */
}

export async function proveAndVerifyAztecClient(bytecodePath: string, witnessPath: string, crsPath: string) {
  /* eslint-disable camelcase */
  const { api } = await initClientIVC(crsPath);
  try {
    const bytecode = readStack(bytecodePath);
    const witness = readStack(witnessPath);

    const verified = await api.acirProveAndVerifyAztecClient(bytecode, witness);
    console.log(`verified?: ${verified}`);
    return verified;
  } finally {
    await api.destroy();
  }
  /* eslint-enable camelcase */
}

export async function foldAndVerifyProgram(
  bytecodePath: string,
  recursive: boolean,
  witnessPath: string,
  crsPath: string,
) {
  /* eslint-disable camelcase */
  const { api } = await initClientIVC(crsPath);
  try {
    const bytecode = getBytecode(bytecodePath);
    const witness = getWitness(witnessPath);

    const verified = await api.acirFoldAndVerifyProgramStack(bytecode, recursive, witness);
    debug(`verified: ${verified}`);
    return verified;
  } finally {
    await api.destroy();
  }
  /* eslint-enable camelcase */
}

export async function prove(
  bytecodePath: string,
  recursive: boolean,
  witnessPath: string,
  crsPath: string,
  outputPath: string,
) {
  const { api, acirComposer } = await initUltraPlonk(bytecodePath, recursive, crsPath);
  try {
    debug(`creating proof...`);
    const bytecode = getBytecode(bytecodePath);
    const witness = getWitness(witnessPath);
    const proof = await api.acirCreateProof(acirComposer, bytecode, recursive, witness);
    debug(`done.`);

    if (outputPath === '-') {
      process.stdout.write(proof);
      debug(`proof written to stdout`);
    } else {
      writeFileSync(outputPath, proof);
      debug(`proof written to: ${outputPath}`);
    }
  } finally {
    await api.destroy();
  }
}

export async function gateCountUltra(bytecodePath: string, recursive: boolean, honkRecursion: boolean) {
  const api = await Barretenberg.new({ threads: 1 });
  try {
    const numberOfGates = await getGatesUltra(bytecodePath, recursive, honkRecursion, api);
    debug(`number of gates: : ${numberOfGates}`);
    // Create an 8-byte buffer and write the number into it.
    // Writing number directly to stdout will result in a variable sized
    // input depending on the size.
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64LE(BigInt(numberOfGates));

    process.stdout.write(buffer);
  } finally {
    await api.destroy();
  }
}

export async function verify(proofPath: string, vkPath: string, crsPath: string) {
  const { api, acirComposer } = await initLite(crsPath);
  try {
    await api.acirLoadVerificationKey(acirComposer, new RawBuffer(readFileSync(vkPath)));
    const verified = await api.acirVerifyProof(acirComposer, readFileSync(proofPath));
    debug(`verified: ${verified}`);
    return verified;
  } finally {
    await api.destroy();
  }
}

export async function contract(outputPath: string, vkPath: string, crsPath: string) {
  const { api, acirComposer } = await initLite(crsPath);
  try {
    await api.acirLoadVerificationKey(acirComposer, new RawBuffer(readFileSync(vkPath)));
    const contract = await api.acirGetSolidityVerifier(acirComposer);

    if (outputPath === '-') {
      process.stdout.write(contract);
      debug(`contract written to stdout`);
    } else {
      writeFileSync(outputPath, contract);
      debug(`contract written to: ${outputPath}`);
    }
  } finally {
    await api.destroy();
  }
}

export async function contractUltraHonk(bytecodePath: string, vkPath: string, crsPath: string, outputPath: string) {
  const { api } = await initUltraHonk(bytecodePath, false, crsPath);
  try {
    console.log('bytecodePath', bytecodePath);
    const bytecode = getBytecode(bytecodePath);
    console.log('vkPath', vkPath);
    const vk = new RawBuffer(readFileSync(vkPath));
    const contract = await api.acirHonkSolidityVerifier(bytecode, vk);

    if (outputPath === '-') {
      process.stdout.write(contract);
      debug(`contract written to stdout`);
    } else {
      writeFileSync(outputPath, contract);
      debug(`contract written to: ${outputPath}`);
    }
  } finally {
    await api.destroy();
  }
}

export async function writeVk(bytecodePath: string, recursive: boolean, crsPath: string, outputPath: string) {
  const { api, acirComposer } = await initUltraPlonk(bytecodePath, recursive, crsPath);
  try {
    debug('initing proving key...');
    const bytecode = getBytecode(bytecodePath);
    await api.acirInitProvingKey(acirComposer, bytecode, recursive);

    debug('initing verification key...');
    const vk = await api.acirGetVerificationKey(acirComposer);

    if (outputPath === '-') {
      process.stdout.write(vk);
      debug(`vk written to stdout`);
    } else {
      writeFileSync(outputPath, vk);
      debug(`vk written to: ${outputPath}`);
    }
  } finally {
    await api.destroy();
  }
}

export async function writePk(bytecodePath: string, recursive: boolean, crsPath: string, outputPath: string) {
  const { api, acirComposer } = await initUltraPlonk(bytecodePath, recursive, crsPath);
  try {
    debug('initing proving key...');
    const bytecode = getBytecode(bytecodePath);
    const pk = await api.acirGetProvingKey(acirComposer, bytecode, recursive);

    if (outputPath === '-') {
      process.stdout.write(pk);
      debug(`pk written to stdout`);
    } else {
      writeFileSync(outputPath, pk);
      debug(`pk written to: ${outputPath}`);
    }
  } finally {
    await api.destroy();
  }
}

export async function proofAsFields(proofPath: string, vkPath: string, outputPath: string, crsPath: string) {
  const { api, acirComposer } = await initLite(crsPath);

  try {
    debug('serializing proof byte array into field elements');
    const numPublicInputs = readFileSync(vkPath).readUint32BE(8);
    const proofAsFields = await api.acirSerializeProofIntoFields(
      acirComposer,
      readFileSync(proofPath),
      numPublicInputs,
    );
    const jsonProofAsFields = JSON.stringify(proofAsFields.map(f => f.toString()));

    if (outputPath === '-') {
      process.stdout.write(jsonProofAsFields);
      debug(`proofAsFields written to stdout`);
    } else {
      writeFileSync(outputPath, jsonProofAsFields);
      debug(`proofAsFields written to: ${outputPath}`);
    }

    debug('done.');
  } finally {
    await api.destroy();
  }
}

export async function vkAsFields(vkPath: string, vkeyOutputPath: string, crsPath: string) {
  const { api, acirComposer } = await initLite(crsPath);

  try {
    debug('serializing vk byte array into field elements');
    await api.acirLoadVerificationKey(acirComposer, new RawBuffer(readFileSync(vkPath)));
    const [vkAsFields, vkHash] = await api.acirSerializeVerificationKeyIntoFields(acirComposer);
    const output = [vkHash, ...vkAsFields].map(f => f.toString());
    const jsonVKAsFields = JSON.stringify(output);

    if (vkeyOutputPath === '-') {
      process.stdout.write(jsonVKAsFields);
      debug(`vkAsFields written to stdout`);
    } else {
      writeFileSync(vkeyOutputPath, jsonVKAsFields);
      debug(`vkAsFields written to: ${vkeyOutputPath}`);
    }

    debug('done.');
  } finally {
    await api.destroy();
  }
}

export async function proveUltraHonk(
  bytecodePath: string,
  recursive: boolean,
  witnessPath: string,
  crsPath: string,
  outputPath: string,
  options?: UltraHonkBackendOptions,
) {
  const { api } = await initUltraHonk(bytecodePath, recursive, crsPath);
  try {
    debug(`creating proof...`);
    const bytecode = getBytecode(bytecodePath);
    const witness = getWitness(witnessPath);

    const acirProveUltraHonk = options?.keccak
      ? api.acirProveUltraKeccakHonk.bind(api)
      : api.acirProveUltraHonk.bind(api);
    const proof = await acirProveUltraHonk(bytecode, recursive, witness);
    debug(`done.`);

    if (outputPath === '-') {
      process.stdout.write(proof);
      debug(`proof written to stdout`);
    } else {
      writeFileSync(outputPath, proof);
      debug(`proof written to: ${outputPath}`);
    }
  } finally {
    await api.destroy();
  }
}

export async function writeVkUltraHonk(
  bytecodePath: string,
  recursive: boolean,
  crsPath: string,
  outputPath: string,
  options?: UltraHonkBackendOptions,
) {
  const { api } = await initUltraHonk(bytecodePath, recursive, crsPath);
  try {
    const bytecode = getBytecode(bytecodePath);
    debug('initing verification key...');

    const acirWriteVkUltraHonk = options?.keccak
      ? api.acirWriteVkUltraKeccakHonk.bind(api)
      : api.acirWriteVkUltraHonk.bind(api);
    const vk = await acirWriteVkUltraHonk(bytecode, recursive);

    if (outputPath === '-') {
      process.stdout.write(vk);
      debug(`vk written to stdout`);
    } else {
      writeFileSync(outputPath, vk);
      debug(`vk written to: ${outputPath}`);
    }
  } finally {
    await api.destroy();
  }
}

export async function verifyUltraHonk(
  proofPath: string,
  vkPath: string,
  crsPath: string,
  options?: UltraHonkBackendOptions,
) {
  const { api } = await initLite(crsPath);
  try {
    const acirVerifyUltraHonk = options?.keccak
      ? api.acirVerifyUltraKeccakHonk.bind(api)
      : api.acirVerifyUltraHonk.bind(api);
    const verified = await acirVerifyUltraHonk(readFileSync(proofPath), new RawBuffer(readFileSync(vkPath)));

    debug(`verified: ${verified}`);
    return verified;
  } finally {
    await api.destroy();
  }
}

export async function proofAsFieldsUltraHonk(proofPath: string, outputPath: string, crsPath: string) {
  const { api } = await initLite(crsPath);
  try {
    debug('outputting proof as vector of fields');
    const proofAsFields = await api.acirProofAsFieldsUltraHonk(readFileSync(proofPath));
    const jsonProofAsFields = JSON.stringify(proofAsFields.map(f => f.toString()));

    if (outputPath === '-') {
      process.stdout.write(jsonProofAsFields);
      debug(`proofAsFieldsUltraHonk written to stdout`);
    } else {
      writeFileSync(outputPath, jsonProofAsFields);
      debug(`proofAsFieldsUltraHonk written to: ${outputPath}`);
    }

    debug('done.');
  } finally {
    await api.destroy();
  }
}

export async function vkAsFieldsUltraHonk(vkPath: string, vkeyOutputPath: string, crsPath: string) {
  const { api } = await initLite(crsPath);

  try {
    debug('serializing vk byte array into field elements');
    const vkAsFields = await api.acirVkAsFieldsUltraHonk(new RawBuffer(readFileSync(vkPath)));
    const jsonVKAsFields = JSON.stringify(vkAsFields.map(f => f.toString()));

    if (vkeyOutputPath === '-') {
      process.stdout.write(jsonVKAsFields);
      debug(`vkAsFieldsUltraHonk written to stdout`);
    } else {
      writeFileSync(vkeyOutputPath, jsonVKAsFields);
      debug(`vkAsFieldsUltraHonk written to: ${vkeyOutputPath}`);
    }

    debug('done.');
  } finally {
    await api.destroy();
  }
}

const program = new Command('bb');

program.option('-v, --verbose', 'enable verbose logging', false);
program.option('-c, --crs-path <path>', 'set crs path', './crs');

function handleGlobalOptions() {
  if (program.opts().verbose) {
    createDebug.enable('bb.js*');
  }
  return { crsPath: program.opts().crsPath };
}

program
  .command('prove_and_verify')
  .description('Generate a proof and verify it. Process exits with success or failure code.')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-r, --recursive', 'Whether to use a SNARK friendly proof', false)
  .option('-w, --witness-path <path>', 'Specify the witness path', './target/witness.gz')
  .action(async ({ bytecodePath, recursive, witnessPath }) => {
    const { crsPath } = handleGlobalOptions();
    const result = await proveAndVerify(bytecodePath, recursive, witnessPath, crsPath);
    process.exit(result ? 0 : 1);
  });

program
  .command('prove_and_verify_ultra_honk')
  .description('Generate an UltraHonk proof and verify it. Process exits with success or failure code.')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-r, --recursive', 'Whether to use a SNARK friendly proof', false)
  .option('-w, --witness-path <path>', 'Specify the witness path', './target/witness.gz')
  .action(async ({ bytecodePath, recursive, witnessPath }) => {
    const { crsPath } = handleGlobalOptions();
    const result = await proveAndVerifyUltraHonk(bytecodePath, recursive, witnessPath, crsPath);
    process.exit(result ? 0 : 1);
  });

program
  .command('prove_and_verify_mega_honk')
  .description('Generate a MegaHonk proof and verify it. Process exits with success or failure code.')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-r, --recursive', 'Whether to use a SNARK friendly proof', false)
  .option('-w, --witness-path <path>', 'Specify the witness path', './target/witness.gz')
  .action(async ({ bytecodePath, recursive, witnessPath }) => {
    const { crsPath } = handleGlobalOptions();
    const result = await proveAndVerifyMegaHonk(bytecodePath, recursive, witnessPath, crsPath);
    process.exit(result ? 0 : 1);
  });

program
  .command('client_ivc_prove_and_verify')
  .description('Generate a ClientIVC proof.')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/acir.msgpack.b64')
  .option('-w, --witness-path <path>', 'Specify the witness path', './target/witnesses.msgpack.b64')
  .action(async ({ bytecodePath, witnessPath }) => {
    const { crsPath } = handleGlobalOptions();
    const result = await proveAndVerifyAztecClient(bytecodePath, witnessPath, crsPath);
    process.exit(result ? 0 : 1);
  });

program
  .command('fold_and_verify_program')
  .description('Accumulate a set of circuits using ClientIvc then verify. Process exits with success or failure code.')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-r, --recursive', 'Create a SNARK friendly proof', false)
  .option('-w, --witness-path <path>', 'Specify the witness path', './target/witness.gz')
  .action(async ({ bytecodePath, recursive, witnessPath }) => {
    const { crsPath } = handleGlobalOptions();
    const result = await foldAndVerifyProgram(bytecodePath, recursive, witnessPath, crsPath);
    process.exit(result ? 0 : 1);
  });

program
  .command('prove')
  .description('Generate a proof and write it to a file.')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-r, --recursive', 'Create a SNARK friendly proof', false)
  .option('-w, --witness-path <path>', 'Specify the witness path', './target/witness.gz')
  .option('-o, --output-path <path>', 'Specify the proof output path', './proofs/proof')
  .action(async ({ bytecodePath, recursive, witnessPath, outputPath }) => {
    const { crsPath } = handleGlobalOptions();
    await prove(bytecodePath, recursive, witnessPath, crsPath, outputPath);
  });

program
  .command('gates')
  .description('Print Ultra Builder gate count to standard output.')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-r, --recursive', 'Create a SNARK friendly proof', false)
  .option('-hr, --honk-recursion', 'Specify whether to use UltraHonk recursion', false)
  .action(async ({ bytecodePath, recursive, honkRecursion: honkRecursion }) => {
    handleGlobalOptions();
    await gateCountUltra(bytecodePath, recursive, honkRecursion);
  });

program
  .command('verify')
  .description('Verify a proof. Process exists with success or failure code.')
  .requiredOption('-p, --proof-path <path>', 'Specify the path to the proof')
  .requiredOption('-k, --vk <path>', 'path to a verification key. avoids recomputation.')
  .action(async ({ proofPath, vk }) => {
    const { crsPath } = handleGlobalOptions();
    const result = await verify(proofPath, vk, crsPath);
    process.exit(result ? 0 : 1);
  });

program
  .command('contract')
  .description('Output solidity verification key contract.')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-o, --output-path <path>', 'Specify the path to write the contract', './target/contract.sol')
  .requiredOption('-k, --vk-path <path>', 'Path to a verification key. avoids recomputation.')
  .action(async ({ outputPath, vkPath }) => {
    const { crsPath } = handleGlobalOptions();
    await contract(outputPath, vkPath, crsPath);
  });

program
  .command('contract_ultra_honk')
  .description('Output solidity verification key contract.')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-o, --output-path <path>', 'Specify the path to write the contract', './target/contract.sol')
  .requiredOption('-k, --vk-path <path>', 'Path to a verification key.')
  .action(async ({ bytecodePath, outputPath, vkPath, crsPath }) => {
    handleGlobalOptions();
    await contractUltraHonk(bytecodePath, vkPath, crsPath, outputPath);
  });

program
  .command('write_vk')
  .description('Output verification key.')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-r, --recursive', 'Create a SNARK friendly proof', false)
  .option('-o, --output-path <path>', 'Specify the path to write the key')
  .action(async ({ bytecodePath, recursive, outputPath }) => {
    const { crsPath } = handleGlobalOptions();
    await writeVk(bytecodePath, recursive, crsPath, outputPath);
  });

program
  .command('write_pk')
  .description('Output proving key.')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-r, --recursive', 'Create a SNARK friendly proof', false)
  .requiredOption('-o, --output-path <path>', 'Specify the path to write the key')
  .action(async ({ bytecodePath, recursive, outputPath }) => {
    const { crsPath } = handleGlobalOptions();
    await writePk(bytecodePath, recursive, crsPath, outputPath);
  });

program
  .command('proof_as_fields')
  .description('Return the proof as fields elements')
  .requiredOption('-p, --proof-path <path>', 'Specify the proof path')
  .requiredOption('-k, --vk-path <path>', 'Path to verification key.')
  .requiredOption('-o, --output-path <path>', 'Specify the JSON path to write the proof fields')
  .action(async ({ proofPath, vkPath, outputPath }) => {
    const { crsPath } = handleGlobalOptions();
    await proofAsFields(proofPath, vkPath, outputPath, crsPath);
  });

program
  .command('vk_as_fields')
  .description('Return the verification key represented as fields elements. Also return the verification key hash.')
  .requiredOption('-k, --vk-path <path>', 'Path to verification key.')
  .requiredOption('-o, --output-path <path>', 'Specify the JSON path to write the verification key fields and key hash')
  .action(async ({ vkPath, outputPath }) => {
    const { crsPath } = handleGlobalOptions();
    await vkAsFields(vkPath, outputPath, crsPath);
  });

program
  .command('prove_ultra_honk')
  .description('Generate a proof and write it to a file.')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-r, --recursive', 'Create a SNARK friendly proof', false)
  .option('-w, --witness-path <path>', 'Specify the witness path', './target/witness.gz')
  .option('-o, --output-path <path>', 'Specify the proof output path', './proofs/proof')
  .action(async ({ bytecodePath, recursive, witnessPath, outputPath }) => {
    const { crsPath } = handleGlobalOptions();
    await proveUltraHonk(bytecodePath, recursive, witnessPath, crsPath, outputPath);
  });

program
  .command('prove_ultra_keccak_honk')
  .description('Generate a proof and write it to a file.')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-r, --recursive', 'Create a SNARK friendly proof', false)
  .option('-w, --witness-path <path>', 'Specify the witness path', './target/witness.gz')
  .option('-o, --output-path <path>', 'Specify the proof output path', './proofs/proof')
  .action(async ({ bytecodePath, recursive, witnessPath, outputPath, crsPath }) => {
    handleGlobalOptions();
    await proveUltraHonk(bytecodePath, recursive, witnessPath, crsPath, outputPath, { keccak: true });
  });

program
  .command('write_vk_ultra_honk')
  .description('Output verification key.')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-r, --recursive', 'Create a SNARK friendly proof', false)
  .requiredOption('-o, --output-path <path>', 'Specify the path to write the key')
  .action(async ({ bytecodePath, recursive, outputPath }) => {
    const { crsPath } = handleGlobalOptions();
    await writeVkUltraHonk(bytecodePath, recursive, crsPath, outputPath);
  });

program
  .command('write_vk_ultra_keccak_honk')
  .description('Output verification key.')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-r, --recursive', 'Create a SNARK friendly proof', false)
  .requiredOption('-o, --output-path <path>', 'Specify the path to write the key')
  .action(async ({ bytecodePath, recursive, outputPath, crsPath }) => {
    handleGlobalOptions();
    await writeVkUltraHonk(bytecodePath, recursive, crsPath, outputPath, { keccak: true });
  });

program
  .command('verify_ultra_honk')
  .description('Verify a proof. Process exists with success or failure code.')
  .requiredOption('-p, --proof-path <path>', 'Specify the path to the proof')
  .requiredOption('-k, --vk <path>', 'path to a verification key. avoids recomputation.')
  .action(async ({ proofPath, vk }) => {
    const { crsPath } = handleGlobalOptions();
    const result = await verifyUltraHonk(proofPath, vk, crsPath);
    process.exit(result ? 0 : 1);
  });

program
  .command('verify_ultra_keccak_honk')
  .description('Verify a proof. Process exists with success or failure code.')
  .requiredOption('-p, --proof-path <path>', 'Specify the path to the proof')
  .requiredOption('-k, --vk <path>', 'path to a verification key. avoids recomputation.')
  .action(async ({ proofPath, vk }) => {
    const { crsPath } = handleGlobalOptions();
    const result = await verifyUltraHonk(proofPath, vk, crsPath, { keccak: true });
    process.exit(result ? 0 : 1);
  });

program
  .command('proof_as_fields_honk')
  .description('Return the proof as fields elements')
  .requiredOption('-p, --proof-path <path>', 'Specify the proof path')
  .requiredOption('-o, --output-path <path>', 'Specify the JSON path to write the proof fields')
  .action(async ({ proofPath, outputPath }) => {
    const { crsPath } = handleGlobalOptions();
    await proofAsFieldsUltraHonk(proofPath, outputPath, crsPath);
  });

program
  .command('vk_as_fields_ultra_honk')
  .description('Return the verification key represented as fields elements.')
  .requiredOption('-k, --vk-path <path>', 'Path to verification key.')
  .requiredOption('-o, --output-path <path>', 'Specify the JSON path to write the verification key fields.')
  .action(async ({ vkPath, outputPath }) => {
    const { crsPath } = handleGlobalOptions();
    await vkAsFieldsUltraHonk(vkPath, outputPath, crsPath);
  });

program.name('bb.js').parse(process.argv);
