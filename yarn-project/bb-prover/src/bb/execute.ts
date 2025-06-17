import { sha256 } from '@aztec/foundation/crypto';
import type { LogFn, Logger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import type { AvmCircuitInputs, AvmCircuitPublicInputs } from '@aztec/stdlib/avm';

import * as proc from 'child_process';
import { promises as fs } from 'fs';
import { basename, dirname, join } from 'path';

import type { UltraHonkFlavor } from '../honk.js';

export const VK_FILENAME = 'vk';
export const VK_FIELDS_FILENAME = 'vk_fields.json';
export const PUBLIC_INPUTS_FILENAME = 'public_inputs';
export const PUBLIC_INPUTS_FIELDS_FILENAME = 'public_inputs_fields.json';
export const PROOF_FILENAME = 'proof';
export const PROOF_FIELDS_FILENAME = 'proof_fields.json';
export const AVM_INPUTS_FILENAME = 'avm_inputs.bin';
export const AVM_BYTECODE_FILENAME = 'avm_bytecode.bin';
export const AVM_PUBLIC_INPUTS_FILENAME = 'avm_public_inputs.bin';
export const CLIENT_IVC_PROOF_FILE_NAME = 'proof';

export enum BB_RESULT {
  SUCCESS,
  FAILURE,
  ALREADY_PRESENT,
}

export type BBSuccess = {
  status: BB_RESULT.SUCCESS | BB_RESULT.ALREADY_PRESENT;
  durationMs: number;
  /** Full path of the public key. */
  pkPath?: string;
  /** Base directory for the VKs (raw, fields). */
  vkDirectoryPath?: string;
  /** Full path of the proof. */
  proofPath?: string;
  /** Full path of the contract. */
  contractPath?: string;
  /** The number of gates in the circuit. */
  circuitSize?: number;
};

export type BBFailure = {
  status: BB_RESULT.FAILURE;
  reason: string;
  retry?: boolean;
};

export type BBResult = BBSuccess | BBFailure;

type BBExecResult = {
  status: BB_RESULT;
  exitCode: number;
  signal: string | undefined;
};

/**
 * Invokes the Barretenberg binary with the provided command and args
 * @param pathToBB - The path to the BB binary
 * @param command - The command to execute
 * @param args - The arguments to pass
 * @param logger - A log function
 * @param timeout - An optional timeout before killing the BB process
 * @param resultParser - An optional handler for detecting success or failure
 * @returns The completed partial witness outputted from the circuit
 */
export function executeBB(
  pathToBB: string,
  command: string,
  args: string[],
  logger: LogFn,
  timeout?: number,
  resultParser = (code: number) => code === 0,
): Promise<BBExecResult> {
  return new Promise<BBExecResult>(resolve => {
    // spawn the bb process
    const { HARDWARE_CONCURRENCY: _, ...envWithoutConcurrency } = process.env;
    const env = process.env.HARDWARE_CONCURRENCY ? process.env : envWithoutConcurrency;
    logger(`Executing BB with: ${pathToBB} ${command} ${args.join(' ')}`);
    const bb = proc.spawn(pathToBB, [command, ...args], {
      env,
    });

    let timeoutId: NodeJS.Timeout | undefined;
    if (timeout !== undefined) {
      timeoutId = setTimeout(() => {
        logger(`BB execution timed out after ${timeout}ms, killing process`);
        if (bb.pid) {
          bb.kill('SIGKILL');
        }
        resolve({ status: BB_RESULT.FAILURE, exitCode: -1, signal: 'TIMEOUT' });
      }, timeout);
    }

    bb.stdout.on('data', data => {
      const message = data.toString('utf-8').replace(/\n$/, '');
      logger(message);
    });
    bb.stderr.on('data', data => {
      const message = data.toString('utf-8').replace(/\n$/, '');
      logger(message);
    });
    bb.on('close', (exitCode: number, signal?: string) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (resultParser(exitCode)) {
        resolve({ status: BB_RESULT.SUCCESS, exitCode, signal });
      } else {
        resolve({ status: BB_RESULT.FAILURE, exitCode, signal });
      }
    });
  }).catch(_ => ({ status: BB_RESULT.FAILURE, exitCode: -1, signal: undefined }));
}

export async function executeBbClientIvcProof(
  pathToBB: string,
  workingDirectory: string,
  inputsPath: string,
  log: LogFn,
  writeVk = false,
): Promise<BBFailure | BBSuccess> {
  // Check that the working directory exists
  try {
    await fs.access(workingDirectory);
  } catch {
    return { status: BB_RESULT.FAILURE, reason: `Working directory ${workingDirectory} does not exist` };
  }

  // The proof is written to e.g. /workingDirectory/proof
  const outputPath = `${workingDirectory}`;

  const binaryPresent = await fs
    .access(pathToBB, fs.constants.R_OK)
    .then(_ => true)
    .catch(_ => false);
  if (!binaryPresent) {
    return { status: BB_RESULT.FAILURE, reason: `Failed to find bb binary at ${pathToBB}` };
  }

  try {
    // Write the bytecode to the working directory
    log(`inputsPath ${inputsPath}`);
    const timer = new Timer();
    const logFunction = (message: string) => {
      log(`bb - ${message}`);
    };

    const args = ['-o', outputPath, '--ivc_inputs_path', inputsPath, '-v', '--scheme', 'client_ivc'];
    if (writeVk) {
      args.push('--write_vk');
    }
    const result = await executeBB(pathToBB, 'prove', args, logFunction);
    const durationMs = timer.ms();

    if (result.status == BB_RESULT.SUCCESS) {
      return {
        status: BB_RESULT.SUCCESS,
        durationMs,
        proofPath: `${outputPath}`,
        pkPath: undefined,
        vkDirectoryPath: `${outputPath}`,
      };
    }
    // Not a great error message here but it is difficult to decipher what comes from bb
    return {
      status: BB_RESULT.FAILURE,
      reason: `Failed to generate proof. Exit code ${result.exitCode}. Signal ${result.signal}.`,
      retry: !!result.signal,
    };
  } catch (error) {
    return { status: BB_RESULT.FAILURE, reason: `${error}` };
  }
}

function getArgs(flavor: UltraHonkFlavor) {
  switch (flavor) {
    case 'ultra_honk': {
      return ['--scheme', 'ultra_honk', '--oracle_hash', 'poseidon2'];
    }
    case 'ultra_keccak_honk': {
      return ['--scheme', 'ultra_honk', '--oracle_hash', 'keccak'];
    }
    case 'ultra_starknet_honk': {
      return ['--scheme', 'ultra_honk', '--oracle_hash', 'starknet'];
    }
    case 'ultra_rollup_honk': {
      return ['--scheme', 'ultra_honk', '--oracle_hash', 'poseidon2', '--ipa_accumulation'];
    }
  }
}

/**
 * Used for generating proofs of noir circuits.
 * It is assumed that the working directory is a temporary and/or random directory used solely for generating this proof.
 * @param pathToBB - The full path to the bb binary
 * @param workingDirectory - A working directory for use by bb
 * @param circuitName - An identifier for the circuit
 * @param bytecode - The compiled circuit bytecode
 * @param inputWitnessFile - The circuit input witness
 * @param log - A logging function
 * @returns An object containing a result indication, the location of the proof and the duration taken
 */
export async function generateProof(
  pathToBB: string,
  workingDirectory: string,
  circuitName: string,
  bytecode: Buffer,
  recursive: boolean,
  inputWitnessFile: string,
  flavor: UltraHonkFlavor,
  log: LogFn,
): Promise<BBFailure | BBSuccess> {
  // Check that the working directory exists
  try {
    await fs.access(workingDirectory);
  } catch {
    return { status: BB_RESULT.FAILURE, reason: `Working directory ${workingDirectory} does not exist` };
  }

  // The bytecode is written to e.g. /workingDirectory/BaseParityArtifact-bytecode
  const bytecodePath = `${workingDirectory}/${circuitName}-bytecode`;

  // The proof is written to e.g. /workingDirectory/ultra_honk/proof
  const outputPath = `${workingDirectory}`;

  const binaryPresent = await fs
    .access(pathToBB, fs.constants.R_OK)
    .then(_ => true)
    .catch(_ => false);
  if (!binaryPresent) {
    return { status: BB_RESULT.FAILURE, reason: `Failed to find bb binary at ${pathToBB}` };
  }

  try {
    // Write the bytecode to the working directory
    await fs.writeFile(bytecodePath, bytecode);
    // TODO(#15043): Avoid write_vk flag here.
    const args = getArgs(flavor).concat([
      '--disable_zk',
      '--output_format',
      'bytes_and_fields',
      '--write_vk',
      '-o',
      outputPath,
      '-b',
      bytecodePath,
      '-w',
      inputWitnessFile,
      '-v',
    ]);
    if (recursive) {
      args.push('--init_kzg_accumulator');
    }
    const timer = new Timer();
    const logFunction = (message: string) => {
      log(`${circuitName} BB out - ${message}`);
    };
    const result = await executeBB(pathToBB, `prove`, args, logFunction);
    const duration = timer.ms();

    if (result.status == BB_RESULT.SUCCESS) {
      return {
        status: BB_RESULT.SUCCESS,
        durationMs: duration,
        proofPath: `${outputPath}`,
        pkPath: undefined,
        vkDirectoryPath: `${outputPath}`,
      };
    }
    // Not a great error message here but it is difficult to decipher what comes from bb
    return {
      status: BB_RESULT.FAILURE,
      reason: `Failed to generate proof. Exit code ${result.exitCode}. Signal ${result.signal}.`,
      retry: !!result.signal,
    };
  } catch (error) {
    return { status: BB_RESULT.FAILURE, reason: `${error}` };
  }
}

/**
 * Used for generating proofs of the tube circuit
 * It is assumed that the working directory is a temporary and/or random directory used solely for generating this proof.
 *
 * @returns An object containing a result indication, the location of the proof and the duration taken
 */
export async function generateTubeProof(
  pathToBB: string,
  workingDirectory: string,
  vkPath: string,
  log: LogFn,
): Promise<BBFailure | BBSuccess> {
  // Check that the working directory exists
  try {
    await fs.access(workingDirectory);
  } catch {
    return { status: BB_RESULT.FAILURE, reason: `Working directory ${workingDirectory} does not exist` };
  }

  // Paths for the inputs
  const proofPath = join(workingDirectory, CLIENT_IVC_PROOF_FILE_NAME);

  // The proof is written to e.g. /workingDirectory/proof
  const outputPath = workingDirectory;
  const filePresent = async (file: string) =>
    await fs
      .access(file, fs.constants.R_OK)
      .then(_ => true)
      .catch(_ => false);

  const binaryPresent = await filePresent(pathToBB);
  if (!binaryPresent) {
    return { status: BB_RESULT.FAILURE, reason: `Failed to find bb binary at ${pathToBB}` };
  }

  try {
    if (!(await filePresent(proofPath))) {
      return { status: BB_RESULT.FAILURE, reason: `Client IVC input files not present in  ${workingDirectory}` };
    }
    const args = ['-o', outputPath, '-k', vkPath, '-v'];

    const timer = new Timer();
    const logFunction = (message: string) => {
      log(`TubeCircuit (prove) BB out - ${message}`);
    };
    const result = await executeBB(pathToBB, 'prove_tube', args, logFunction);
    const durationMs = timer.ms();

    if (result.status == BB_RESULT.SUCCESS) {
      return {
        status: BB_RESULT.SUCCESS,
        durationMs,
        proofPath: outputPath,
        pkPath: undefined,
        vkDirectoryPath: outputPath,
      };
    }
    // Not a great error message here but it is difficult to decipher what comes from bb
    return {
      status: BB_RESULT.FAILURE,
      reason: `Failed to generate proof. Exit code ${result.exitCode}. Signal ${result.signal}.`,
      retry: !!result.signal,
    };
  } catch (error) {
    return { status: BB_RESULT.FAILURE, reason: `${error}` };
  }
}

/**
 * Used for generating AVM proofs.
 * It is assumed that the working directory is a temporary and/or random directory used solely for generating this proof.
 * @param pathToBB - The full path to the bb binary
 * @param workingDirectory - A working directory for use by bb
 * @param input - The inputs for the public function to be proven
 * @param logger - A logging function
 * @param checkCircuitOnly - A boolean to toggle a "check-circuit only" operation instead of proving.
 * @returns An object containing a result indication, the location of the proof and the duration taken
 */
export async function generateAvmProof(
  pathToBB: string,
  workingDirectory: string,
  input: AvmCircuitInputs,
  logger: Logger,
  checkCircuitOnly: boolean = false,
): Promise<BBFailure | BBSuccess> {
  // Check that the working directory exists
  try {
    await fs.access(workingDirectory);
  } catch {
    return { status: BB_RESULT.FAILURE, reason: `Working directory ${workingDirectory} does not exist` };
  }

  // The proof is written to e.g. /workingDirectory/proof
  const outputPath = workingDirectory;

  const filePresent = async (file: string) =>
    await fs
      .access(file, fs.constants.R_OK)
      .then(_ => true)
      .catch(_ => false);

  const binaryPresent = await filePresent(pathToBB);
  if (!binaryPresent) {
    return { status: BB_RESULT.FAILURE, reason: `Failed to find bb binary at ${pathToBB}` };
  }

  const inputsBuffer = input.serializeWithMessagePack();

  try {
    // Write the inputs to the working directory.
    const avmInputsPath = join(workingDirectory, AVM_INPUTS_FILENAME);
    await fs.writeFile(avmInputsPath, inputsBuffer);
    if (!(await filePresent(avmInputsPath))) {
      return { status: BB_RESULT.FAILURE, reason: `Could not write avm inputs to ${avmInputsPath}` };
    }

    const args = checkCircuitOnly ? ['--avm-inputs', avmInputsPath] : ['--avm-inputs', avmInputsPath, '-o', outputPath];
    const loggingArg =
      logger.level === 'debug' || logger.level === 'trace' ? '-d' : logger.level === 'verbose' ? '-v' : '';
    if (loggingArg !== '') {
      args.push(loggingArg);
    }
    const timer = new Timer();

    const cmd = checkCircuitOnly ? 'avm_check_circuit' : 'avm_prove';
    const logFunction = (message: string) => {
      logger.verbose(`AvmCircuit (${cmd}) BB out - ${message}`);
    };
    const result = await executeBB(pathToBB, cmd, args, logFunction);
    const duration = timer.ms();

    if (result.status == BB_RESULT.SUCCESS) {
      return {
        status: BB_RESULT.SUCCESS,
        durationMs: duration,
        proofPath: join(outputPath, PROOF_FILENAME),
        pkPath: undefined,
        vkDirectoryPath: outputPath,
      };
    }
    // Not a great error message here but it is difficult to decipher what comes from bb
    return {
      status: BB_RESULT.FAILURE,
      reason: `Failed to generate proof. Exit code ${result.exitCode}. Signal ${result.signal}.`,
      retry: !!result.signal,
    };
  } catch (error) {
    return { status: BB_RESULT.FAILURE, reason: `${error}` };
  }
}

/**
 * Used for verifying proofs of noir circuits
 * @param pathToBB - The full path to the bb binary
 * @param proofFullPath - The full path to the proof to be verified
 * @param verificationKeyPath - The full path to the circuit verification key
 * @param log - A logging function
 * @returns An object containing a result indication and duration taken
 */
export async function verifyProof(
  pathToBB: string,
  proofFullPath: string,
  verificationKeyPath: string,
  ultraHonkFlavor: UltraHonkFlavor,
  log: Logger,
): Promise<BBFailure | BBSuccess> {
  return await verifyProofInternal(
    pathToBB,
    proofFullPath,
    verificationKeyPath,
    `verify`,
    log,
    getArgs(ultraHonkFlavor),
  );
}

export async function verifyAvmProof(
  pathToBB: string,
  workingDirectory: string,
  proofFullPath: string,
  publicInputs: AvmCircuitPublicInputs,
  verificationKeyPath: string,
  logger: Logger,
): Promise<BBFailure | BBSuccess> {
  const inputsBuffer = publicInputs.serializeWithMessagePack();

  // Write the inputs to the working directory.
  const filePresent = async (file: string) =>
    await fs
      .access(file, fs.constants.R_OK)
      .then(_ => true)
      .catch(_ => false);
  const avmInputsPath = join(workingDirectory, 'avm_public_inputs.bin');
  await fs.writeFile(avmInputsPath, inputsBuffer);
  if (!(await filePresent(avmInputsPath))) {
    return { status: BB_RESULT.FAILURE, reason: `Could not write avm inputs to ${avmInputsPath}` };
  }

  return await verifyProofInternal(pathToBB, proofFullPath, verificationKeyPath, 'avm_verify', logger, [
    '--avm-public-inputs',
    avmInputsPath,
  ]);
}

/**
 * Verifies a ClientIvcProof
 * TODO(#7370) The verification keys should be supplied separately
 * @param pathToBB - The full path to the bb binary
 * @param targetPath - The path to the folder with the proof, accumulator, and verification keys
 * @param log - A logging function
 * @returns An object containing a result indication and duration taken
 */
export async function verifyClientIvcProof(
  pathToBB: string,
  proofPath: string,
  keyPath: string,
  log: LogFn,
): Promise<BBFailure | BBSuccess> {
  const binaryPresent = await fs
    .access(pathToBB, fs.constants.R_OK)
    .then(_ => true)
    .catch(_ => false);
  if (!binaryPresent) {
    return { status: BB_RESULT.FAILURE, reason: `Failed to find bb binary at ${pathToBB}` };
  }

  try {
    const args = ['--scheme', 'client_ivc', '-p', proofPath, '-k', keyPath, '-v'];
    const timer = new Timer();
    const command = 'verify';
    const result = await executeBB(pathToBB, command, args, log);
    const duration = timer.ms();
    if (result.status == BB_RESULT.SUCCESS) {
      return { status: BB_RESULT.SUCCESS, durationMs: duration };
    }
    // Not a great error message here but it is difficult to decipher what comes from bb
    return {
      status: BB_RESULT.FAILURE,
      reason: `Failed to verify proof. Exit code ${result.exitCode}. Signal ${result.signal}.`,
      retry: !!result.signal,
    };
  } catch (error) {
    return { status: BB_RESULT.FAILURE, reason: `${error}` };
  }
}

/**
 * Used for verifying proofs with BB
 * @param pathToBB - The full path to the bb binary
 * @param proofFullPath - The full path to the proof to be verified
 * @param verificationKeyPath - The full path to the circuit verification key
 * @param command - The BB command to execute (verify/avm_verify)
 * @param log - A logging function
 * @returns An object containing a result indication and duration taken
 */
async function verifyProofInternal(
  pathToBB: string,
  proofFullPath: string,
  verificationKeyPath: string,
  command: 'verify' | 'avm_verify',
  logger: Logger,
  extraArgs: string[] = [],
): Promise<BBFailure | BBSuccess> {
  const binaryPresent = await fs
    .access(pathToBB, fs.constants.R_OK)
    .then(_ => true)
    .catch(_ => false);
  if (!binaryPresent) {
    return { status: BB_RESULT.FAILURE, reason: `Failed to find bb binary at ${pathToBB}` };
  }

  const logFunction = (message: string) => {
    logger.verbose(`bb-prover (verify) BB out - ${message}`);
  };

  try {
    let args;

    if (command == 'verify') {
      // Specify the public inputs path in the case of UH verification.
      // Take proofFullPath and remove the suffix past the / to get the directory.
      const proofDir = proofFullPath.substring(0, proofFullPath.lastIndexOf('/'));
      const publicInputsFullPath = join(proofDir, '/public_inputs');
      logger.debug(`public inputs path: ${publicInputsFullPath}`);

      args = ['-p', proofFullPath, '-k', verificationKeyPath, '-i', publicInputsFullPath, ...extraArgs];
    } else {
      args = ['-p', proofFullPath, '-k', verificationKeyPath, ...extraArgs];
    }

    const loggingArg =
      logger.level === 'debug' || logger.level === 'trace' ? '-d' : logger.level === 'verbose' ? '-v' : '';
    if (loggingArg !== '') {
      args.push(loggingArg);
    }
    args.push('--disable_zk');

    const timer = new Timer();
    const result = await executeBB(pathToBB, command, args, logFunction);
    const duration = timer.ms();
    if (result.status == BB_RESULT.SUCCESS) {
      return { status: BB_RESULT.SUCCESS, durationMs: duration };
    }
    // Not a great error message here but it is difficult to decipher what comes from bb
    return {
      status: BB_RESULT.FAILURE,
      reason: `Failed to verify proof. Exit code ${result.exitCode}. Signal ${result.signal}.`,
      retry: !!result.signal,
    };
  } catch (error) {
    return { status: BB_RESULT.FAILURE, reason: `${error}` };
  }
}

export async function generateContractForVerificationKey(
  pathToBB: string,
  vkFilePath: string,
  contractPath: string,
  log: LogFn,
): Promise<BBFailure | BBSuccess> {
  const binaryPresent = await fs
    .access(pathToBB, fs.constants.R_OK)
    .then(_ => true)
    .catch(_ => false);

  if (!binaryPresent) {
    return { status: BB_RESULT.FAILURE, reason: `Failed to find bb binary at ${pathToBB}` };
  }

  const outputDir = dirname(contractPath);
  const contractName = basename(contractPath);
  // cache contract generation based on vk file and contract name
  const cacheKey = sha256(Buffer.concat([Buffer.from(contractName), await fs.readFile(vkFilePath)]));

  await fs.mkdir(outputDir, { recursive: true });

  const res = await fsCache<BBSuccess | BBFailure>(outputDir, cacheKey, log, false, async () => {
    try {
      const args = ['--scheme', 'ultra_honk', '-k', vkFilePath, '-o', contractPath, '-v'];
      const timer = new Timer();
      const result = await executeBB(pathToBB, 'contract', args, log);
      const duration = timer.ms();
      if (result.status == BB_RESULT.SUCCESS) {
        return { status: BB_RESULT.SUCCESS, durationMs: duration, contractPath };
      }
      // Not a great error message here but it is difficult to decipher what comes from bb
      return {
        status: BB_RESULT.FAILURE,
        reason: `Failed to write verifier contract. Exit code ${result.exitCode}. Signal ${result.signal}.`,
        retry: !!result.signal,
      };
    } catch (error) {
      return { status: BB_RESULT.FAILURE, reason: `${error}` };
    }
  });

  if (!res) {
    return {
      status: BB_RESULT.ALREADY_PRESENT,
      durationMs: 0,
      contractPath,
    };
  }

  return res;
}

/**
 * Compute bb gate count for a given circuit
 * @param pathToBB - The full path to the bb binary
 * @param workingDirectory - A temporary directory for writing the bytecode
 * @param circuitName - The name of the circuit
 * @param bytecode - The bytecode of the circuit
 * @param flavor - The flavor of the backend - mega_honk or ultra_honk variants
 * @returns An object containing the status, gate count, and time taken
 */
export async function computeGateCountForCircuit(
  pathToBB: string,
  workingDirectory: string,
  circuitName: string,
  bytecode: Buffer,
  flavor: UltraHonkFlavor | 'mega_honk',
  log: LogFn,
): Promise<BBFailure | BBSuccess> {
  // Check that the working directory exists
  try {
    await fs.access(workingDirectory);
  } catch {
    return { status: BB_RESULT.FAILURE, reason: `Working directory ${workingDirectory} does not exist` };
  }

  // The bytecode is written to e.g. /workingDirectory/BaseParityArtifact-bytecode
  const bytecodePath = `${workingDirectory}/${circuitName}-bytecode`;

  const binaryPresent = await fs
    .access(pathToBB, fs.constants.R_OK)
    .then(_ => true)
    .catch(_ => false);
  if (!binaryPresent) {
    return { status: BB_RESULT.FAILURE, reason: `Failed to find bb binary at ${pathToBB}` };
  }

  // Accumulate the stdout from bb
  let stdout = '';
  const logHandler = (message: string) => {
    stdout += message;
    log(message);
  };

  try {
    // Write the bytecode to the working directory
    await fs.writeFile(bytecodePath, bytecode);
    const timer = new Timer();

    const result = await executeBB(
      pathToBB,
      'gates',
      ['--scheme', flavor === 'mega_honk' ? 'client_ivc' : 'ultra_honk', '-b', bytecodePath, '-v'],
      logHandler,
    );
    const duration = timer.ms();

    if (result.status == BB_RESULT.SUCCESS) {
      // Look for "circuit_size" in the stdout and parse the number
      const circuitSizeMatch = stdout.match(/circuit_size": (\d+)/);
      if (!circuitSizeMatch) {
        return { status: BB_RESULT.FAILURE, reason: 'Failed to parse circuit_size from bb gates stdout.' };
      }
      const circuitSize = parseInt(circuitSizeMatch[1]);

      return {
        status: BB_RESULT.SUCCESS,
        durationMs: duration,
        circuitSize: circuitSize,
      };
    }

    return { status: BB_RESULT.FAILURE, reason: 'Failed getting the gate count.' };
  } catch (error) {
    return { status: BB_RESULT.FAILURE, reason: `${error}` };
  }
}

const CACHE_FILENAME = '.cache';
async function fsCache<T>(
  dir: string,
  expectedCacheKey: Buffer,
  logger: LogFn,
  force: boolean,
  action: () => Promise<T>,
): Promise<T | undefined> {
  const cacheFilePath = join(dir, CACHE_FILENAME);

  let run: boolean;
  if (force) {
    run = true;
  } else {
    try {
      run = !expectedCacheKey.equals(await fs.readFile(cacheFilePath));
    } catch (err: any) {
      if (err && 'code' in err && err.code === 'ENOENT') {
        // cache file doesn't exist, swallow error and run
        run = true;
      } else {
        throw err;
      }
    }
  }

  let res: T | undefined;
  if (run) {
    logger(`Cache miss or forced run. Running operation in ${dir}...`);
    res = await action();
  } else {
    logger(`Cache hit. Skipping operation in ${dir}...`);
  }

  try {
    await fs.writeFile(cacheFilePath, expectedCacheKey);
  } catch {
    logger(`Couldn't write cache data to ${cacheFilePath}. Skipping cache...`);
    // ignore
  }

  return res;
}
