#!/usr/bin/env node
import 'source-map-support/register.js';
import { Crs, Barretenberg, RawBuffer } from './index.js';
import { createDebugLogger, initLogger } from './log/index.js';
import { readFileSync, writeFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { Command } from 'commander';
import { UltraHonkBackendOptions } from './barretenberg/backend.js';

let debug: (msg: string) => void;

const threads = +process.env.HARDWARE_CONCURRENCY! || undefined;

function getBytecode(bytecodePath: string): Uint8Array {
  const extension = bytecodePath.substring(bytecodePath.lastIndexOf('.') + 1);

  if (extension == 'json') {
    const encodedCircuit = JSON.parse(readFileSync(bytecodePath, 'utf8'));
    const decompressed = gunzipSync(Buffer.from(encodedCircuit.bytecode, 'base64'));
    return Uint8Array.from(decompressed);
  }

  const encodedCircuit = readFileSync(bytecodePath);
  const decompressed = gunzipSync(encodedCircuit);
  return Uint8Array.from(decompressed);
}

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1126): split this into separate Plonk and Honk functions as their gate count differs
async function getGatesUltra(bytecodePath: string, recursive: boolean, honkRecursion: boolean, api: Barretenberg) {
  const { total } = await computeCircuitSize(bytecodePath, recursive, honkRecursion, api);
  return total;
}

function getWitness(witnessPath: string): Uint8Array {
  const data = readFileSync(witnessPath);
  const decompressed = gunzipSync(data);
  return Uint8Array.from(decompressed);
}

async function computeCircuitSize(bytecodePath: string, recursive: boolean, honkRecursion: boolean, api: Barretenberg) {
  debug(`Computing circuit size for ${bytecodePath}`);
  const bytecode = getBytecode(bytecodePath);
  const [total, subgroup] = await api.acirGetCircuitSizes(bytecode, recursive, honkRecursion);
  return { total, subgroup };
}

async function initUltraHonk(bytecodePath: string, crsPath: string) {
  const api = await Barretenberg.new({
    threads,
  });

  // TODO(https://github.com/AztecProtocol/barretenberg/issues/1248): Get rid of this call to avoid building the circuit twice.
  // TODO(https://github.com/AztecProtocol/barretenberg/issues/1126): use specific UltraHonk function
  // recursive here is useless for UH, as it does not affect anything
  const circuitSize = await getGatesUltra(bytecodePath, /*recursive=*/ false, /*honkRecursion=*/ true, api);
  // TODO(https://github.com/AztecProtocol/barretenberg/issues/811): remove subgroupSizeOverride hack for goblin
  const dyadicCircuitSize = Math.pow(2, Math.ceil(Math.log2(circuitSize)));

  debug(`Loading CRS for UltraHonk with circuit-size=${circuitSize} dyadic-circuit-size=${dyadicCircuitSize}`);
  const crs = await Crs.new(dyadicCircuitSize + 1, crsPath);

  // Load CRS into wasm global CRS state.
  // TODO: Make RawBuffer be default behavior, and have a specific Vector type for when wanting length prefixed.
  await api.srsInitSrs(new RawBuffer(crs.getG1Data()), crs.numPoints, new RawBuffer(crs.getG2Data()));
  return { api, circuitSize, dyadicCircuitSize };
}

async function initLite(crsPath: string) {
  const api = await Barretenberg.new({ threads: 1 });

  // Plus 1 needed! (Move +1 into Crs?)
  const crs = await Crs.new(1, crsPath);

  // Load CRS into wasm global CRS state.
  await api.srsInitSrs(new RawBuffer(crs.getG1Data()), crs.numPoints, new RawBuffer(crs.getG2Data()));

  return { api };
}

export async function proveAndVerifyUltraHonk(bytecodePath: string, witnessPath: string, crsPath: string) {
  /* eslint-disable camelcase */
  const { api } = await initUltraHonk(bytecodePath, crsPath);
  try {
    const bytecode = getBytecode(bytecodePath);
    const witness = getWitness(witnessPath);

    const verified = await api.acirProveAndVerifyUltraHonk(bytecode, witness);
    return verified;
  } finally {
    await api.destroy();
  }
  /* eslint-enable camelcase */
}

export async function proveAndVerifyMegaHonk(bytecodePath: string, witnessPath: string, crsPath: string) {
  /* eslint-disable camelcase */
  const { api } = await initUltraHonk(bytecodePath, crsPath);
  try {
    const bytecode = getBytecode(bytecodePath);
    const witness = getWitness(witnessPath);

    const verified = await api.acirProveAndVerifyMegaHonk(bytecode, witness);
    return verified;
  } finally {
    await api.destroy();
  }
  /* eslint-enable camelcase */
}

export async function gateCountUltra(bytecodePath: string, recursive: boolean, honkRecursion: boolean) {
  const api = await Barretenberg.new({ threads: 1 });
  try {
    const numberOfGates = await getGatesUltra(bytecodePath, recursive, honkRecursion, api);
    debug(`Number of gates: ${numberOfGates}`);
    // Create an 8-byte buffer and write the number into it.
    // Writing number directly to stdout will result in a variable sized
    // input depending on the size.
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64LE(BigInt(numberOfGates));

    process.stdout.write(Uint8Array.from(buffer));
  } finally {
    await api.destroy();
  }
}

export async function contractUltraHonk(bytecodePath: string, vkPath: string, crsPath: string, outputPath: string) {
  const { api } = await initUltraHonk(bytecodePath, crsPath);
  try {
    debug(`Creating UltraHonk verifier contract bytecode=${bytecodePath} vk=${vkPath}`);
    const bytecode = getBytecode(bytecodePath);
    const vk = new RawBuffer(readFileSync(vkPath));
    const contract = await api.acirHonkSolidityVerifier(bytecode, vk);

    if (outputPath === '-') {
      process.stdout.write(contract);
      debug(`Solidity verifier contract written to stdout`);
    } else {
      writeFileSync(outputPath, contract);
      debug(`Solidity verifier contract written to ${outputPath}`);
    }
  } finally {
    await api.destroy();
  }
}

export async function proveUltraHonk(
  bytecodePath: string,
  witnessPath: string,
  crsPath: string,
  outputPath: string,
  options?: UltraHonkBackendOptions,
) {
  const { api } = await initUltraHonk(bytecodePath, crsPath);
  try {
    debug(`Creating UltraHonk proof bytecode=${bytecodePath}`);
    const bytecode = getBytecode(bytecodePath);
    const witness = getWitness(witnessPath);

    const acirProveUltraHonk = options?.keccak
      ? api.acirProveUltraKeccakHonk.bind(api)
      : options?.keccakZK
        ? api.acirProveUltraKeccakZkHonk.bind(api)
        : options?.starknet
          ? api.acirProveUltraStarknetHonk.bind(api)
          : options?.starknetZK
            ? api.acirProveUltraStarknetZkHonk.bind(api)
            : api.acirProveUltraHonk.bind(api);
    const proof = await acirProveUltraHonk(bytecode, witness);

    if (outputPath === '-') {
      process.stdout.write(proof);
      debug(`Proof written to stdout`);
    } else {
      writeFileSync(outputPath, proof);
      debug(`Proof written to ${outputPath}`);
    }
  } finally {
    await api.destroy();
  }
}

export async function writeVkUltraHonk(
  bytecodePath: string,
  crsPath: string,
  outputPath: string,
  options?: UltraHonkBackendOptions,
) {
  const { api } = await initUltraHonk(bytecodePath, crsPath);
  try {
    const bytecode = getBytecode(bytecodePath);
    debug(`Initializing UltraHonk verification key bytecode=${bytecodePath}`);

    const acirWriteVkUltraHonk = options?.keccak
      ? api.acirWriteVkUltraKeccakHonk.bind(api)
      : options?.keccakZK
        ? api.acirWriteVkUltraKeccakZkHonk.bind(api)
        : options?.starknet
          ? api.acirWriteVkUltraStarknetHonk.bind(api)
          : options?.starknetZK
            ? api.acirWriteVkUltraStarknetZkHonk.bind(api)
            : api.acirWriteVkUltraHonk.bind(api);
    const vk = await acirWriteVkUltraHonk(bytecode);

    if (outputPath === '-') {
      process.stdout.write(vk);
      debug(`Verification key written to stdout`);
    } else {
      writeFileSync(outputPath, vk);
      debug(`Verification key written to ${outputPath}`);
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
      : options?.keccakZK
        ? api.acirVerifyUltraKeccakZkHonk.bind(api)
        : options?.starknet
          ? api.acirVerifyUltraStarknetHonk.bind(api)
          : options?.starknetZK
            ? api.acirVerifyUltraStarknetZkHonk.bind(api)
            : api.acirVerifyUltraHonk.bind(api);
    const verified = await acirVerifyUltraHonk(
      Uint8Array.from(readFileSync(proofPath)),
      new RawBuffer(readFileSync(vkPath)),
    );

    debug(`Verification ${verified ? 'successful' : 'failed'}`);
    return verified;
  } finally {
    await api.destroy();
  }
}

export async function proofAsFieldsUltraHonk(proofPath: string, outputPath: string, crsPath: string) {
  const { api } = await initLite(crsPath);
  try {
    debug(`Outputting UltraHonk proof as vector of fields proof=${proofPath}`);
    const proofAsFields = await api.acirProofAsFieldsUltraHonk(Uint8Array.from(readFileSync(proofPath)));
    const jsonProofAsFields = JSON.stringify(proofAsFields.map(f => f.toString()));

    if (outputPath === '-') {
      process.stdout.write(jsonProofAsFields);
      debug(`Proof as fields written to stdout`);
    } else {
      writeFileSync(outputPath, jsonProofAsFields);
      debug(`Proof as fields written to ${outputPath}`);
    }
  } finally {
    await api.destroy();
  }
}

export async function vkAsFieldsUltraHonk(vkPath: string, vkeyOutputPath: string, crsPath: string) {
  const { api } = await initLite(crsPath);

  try {
    debug(`Serializing vk byte array into field elements vk=${vkPath}`);
    const vkAsFields = await api.acirVkAsFieldsUltraHonk(new RawBuffer(readFileSync(vkPath)));
    const jsonVKAsFields = JSON.stringify(vkAsFields.map(f => f.toString()));

    if (vkeyOutputPath === '-') {
      process.stdout.write(jsonVKAsFields);
      debug(`Verification key as fields written to stdout`);
    } else {
      writeFileSync(vkeyOutputPath, jsonVKAsFields);
      debug(`Verification key as fields written to ${vkeyOutputPath}`);
    }
  } finally {
    await api.destroy();
  }
}

const program = new Command('bb');

program.option('-v, --verbose', 'enable verbose logging', false);
program.option('-c, --crs-path <path>', 'set crs path', './crs');

function handleGlobalOptions() {
  initLogger({ useStdErr: true, level: program.opts().verbose ? 'debug' : 'info' });
  debug = createDebugLogger('bb');
  return { crsPath: program.opts().crsPath };
}

const deprecatedCommandError = () => async () => {
  console.error(
    `Error: UltraPlonk is now deprecated (see https://github.com/AztecProtocol/barretenberg/issues/1377). Use UltraHonk!`,
  );
  process.exit(1);
};

program
  .command('prove_and_verify')
  .description('Generate a proof and verify it. Process exits with success or failure code. [DEPRECATED]')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-r, --recursive', 'Whether to use a SNARK friendly proof', false)
  .option('-w, --witness-path <path>', 'Specify the witness path', './target/witness.gz')
  .action(deprecatedCommandError());

program
  .command('prove_and_verify_ultra_honk')
  .description('Generate an UltraHonk proof and verify it. Process exits with success or failure code.')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-w, --witness-path <path>', 'Specify the witness path', './target/witness.gz')
  .action(async ({ bytecodePath, witnessPath }) => {
    const { crsPath } = handleGlobalOptions();
    const result = await proveAndVerifyUltraHonk(bytecodePath, witnessPath, crsPath);
    process.exit(result ? 0 : 1);
  });

program
  .command('prove_and_verify_mega_honk')
  .description('Generate a MegaHonk proof and verify it. Process exits with success or failure code.')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-w, --witness-path <path>', 'Specify the witness path', './target/witness.gz')
  .action(async ({ bytecodePath, witnessPath }) => {
    const { crsPath } = handleGlobalOptions();
    const result = await proveAndVerifyMegaHonk(bytecodePath, witnessPath, crsPath);
    process.exit(result ? 0 : 1);
  });

program
  .command('prove')
  .description('Generate a proof and write it to a file. [DEPRECATED]')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-r, --recursive', 'Create a SNARK friendly proof', false)
  .option('-w, --witness-path <path>', 'Specify the witness path', './target/witness.gz')
  .option('-o, --output-path <path>', 'Specify the proof output path', './proofs/proof')
  .action(deprecatedCommandError());

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
  .description('Verify a proof. Process exists with success or failure code. [DEPRECATED]')
  .requiredOption('-p, --proof-path <path>', 'Specify the path to the proof')
  .requiredOption('-k, --vk <path>', 'path to a verification key. avoids recomputation.')
  .action(deprecatedCommandError());

program
  .command('contract')
  .description('Output solidity verification key contract. [DEPRECATED]')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-o, --output-path <path>', 'Specify the path to write the contract', './target/contract.sol')
  .requiredOption('-k, --vk-path <path>', 'Path to a verification key. avoids recomputation.')
  .action(deprecatedCommandError());

program
  .command('contract_ultra_honk')
  .description('Output solidity verification key contract.')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-o, --output-path <path>', 'Specify the path to write the contract', './target/contract.sol')
  .requiredOption('-k, --vk-path <path>', 'Path to a verification key.')
  .action(async ({ bytecodePath, outputPath, vkPath }) => {
    const { crsPath } = handleGlobalOptions();
    await contractUltraHonk(bytecodePath, vkPath, crsPath, outputPath);
  });

program
  .command('write_vk')
  .description('Output verification key. [DEPRECATED]')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-r, --recursive', 'Create a SNARK friendly proof', false)
  .option('-o, --output-path <path>', 'Specify the path to write the key')
  .action(deprecatedCommandError());

program
  .command('write_pk')
  .description('Output proving key. [DEPRECATED]')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-r, --recursive', 'Create a SNARK friendly proof', false)
  .requiredOption('-o, --output-path <path>', 'Specify the path to write the key')
  .action(deprecatedCommandError());

program
  .command('proof_as_fields')
  .description('Return the proof as fields elements. [DEPRECATED]')
  .requiredOption('-p, --proof-path <path>', 'Specify the proof path')
  .requiredOption('-k, --vk-path <path>', 'Path to verification key.')
  .requiredOption('-o, --output-path <path>', 'Specify the JSON path to write the proof fields')
  .action(deprecatedCommandError());

program
  .command('vk_as_fields')
  .description(
    'Return the verification key represented as fields elements. Also return the verification key hash. [DEPRECATED]',
  )
  .requiredOption('-k, --vk-path <path>', 'Path to verification key.')
  .requiredOption('-o, --output-path <path>', 'Specify the JSON path to write the verification key fields and key hash')
  .action(deprecatedCommandError());

program
  .command('prove_ultra_honk')
  .description('Generate a proof and write it to a file.')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-w, --witness-path <path>', 'Specify the witness path', './target/witness.gz')
  .option('-o, --output-path <path>', 'Specify the proof output path', './proofs/proof')
  .action(async ({ bytecodePath, witnessPath, outputPath }) => {
    const { crsPath } = handleGlobalOptions();
    debug(`Creating UltraHonk proof bytecode=${bytecodePath}`);
    await proveUltraHonk(bytecodePath, witnessPath, crsPath, outputPath);
  });

program
  .command('prove_ultra_keccak_honk')
  .description('Generate a proof and write it to a file.')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-w, --witness-path <path>', 'Specify the witness path', './target/witness.gz')
  .option('-o, --output-path <path>', 'Specify the proof output path', './proofs/proof')
  .action(async ({ bytecodePath, witnessPath, outputPath }) => {
    const { crsPath } = handleGlobalOptions();
    await proveUltraHonk(bytecodePath, witnessPath, crsPath, outputPath, { keccak: true });
  });

program
  .command('prove_ultra_starknet_honk')
  .description('Generate a proof and write it to a file.')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-r, --recursive', 'Create a SNARK friendly proof', false)
  .option('-w, --witness-path <path>', 'Specify the witness path', './target/witness.gz')
  .option('-o, --output-path <path>', 'Specify the proof output path', './proofs/proof')
  .action(async ({ bytecodePath, witnessPath, outputPath }) => {
    const { crsPath } = handleGlobalOptions();
    await proveUltraHonk(bytecodePath, witnessPath, crsPath, outputPath, { starknet: true });
  });

program
  .command('write_vk_ultra_honk')
  .description('Output verification key.')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .requiredOption('-o, --output-path <path>', 'Specify the path to write the key')
  .action(async ({ bytecodePath, outputPath }) => {
    const { crsPath } = handleGlobalOptions();
    debug(`Writing verification key to ${outputPath}`);
    await writeVkUltraHonk(bytecodePath, crsPath, outputPath);
  });

program
  .command('write_vk_ultra_keccak_honk')
  .description('Output verification key.')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .requiredOption('-o, --output-path <path>', 'Specify the path to write the key')
  .action(async ({ bytecodePath, outputPath }) => {
    const { crsPath } = handleGlobalOptions();
    await writeVkUltraHonk(bytecodePath, crsPath, outputPath, { keccak: true });
  });

program
  .command('write_vk_ultra_starknet_honk')
  .description('Output verification key.')
  .option('-b, --bytecode-path <path>', 'Specify the bytecode path', './target/program.json')
  .option('-r, --recursive', 'Create a SNARK friendly proof', false)
  .requiredOption('-o, --output-path <path>', 'Specify the path to write the key')
  .action(async ({ bytecodePath, outputPath }) => {
    const { crsPath } = handleGlobalOptions();
    await writeVkUltraHonk(bytecodePath, crsPath, outputPath, { starknet: true });
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
  .command('verify_ultra_starknet_honk')
  .description('Verify a proof. Process exists with success or failure code.')
  .requiredOption('-p, --proof-path <path>', 'Specify the path to the proof')
  .requiredOption('-k, --vk <path>', 'path to a verification key. avoids recomputation.')
  .action(async ({ proofPath, vk }) => {
    const { crsPath } = handleGlobalOptions();
    const result = await verifyUltraHonk(proofPath, vk, crsPath, { starknet: true });
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
