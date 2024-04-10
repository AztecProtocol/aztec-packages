import { sha256 } from '@aztec/foundation/crypto';
import { type LogFn } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { type NoirCompiledCircuit } from '@aztec/types/noir';

import * as proc from 'child_process';
import * as fs from 'fs/promises';

export enum BB_RESULT {
  SUCCESS,
  FAILURE,
  ALREADY_PRESENT,
}

export type BBSuccess = {
  status: BB_RESULT.SUCCESS | BB_RESULT.ALREADY_PRESENT;
};

export type BBFailure = {
  status: BB_RESULT.FAILURE;
  reason: string;
};

export type BBResult = BBSuccess | BBFailure;

/**
 * Invokes the Barretenberg binary with the provided command and args
 * @param pathToBB - The path to the BB binary
 * @param command - The command to execute
 * @param args - The arguments to pass
 * @param logger - A log function
 * @param resultParser - An optional handler for detecting success or failure
 * @returns The completed partial witness outputted from the circuit
 */
export function executeBB(
  pathToBB: string,
  command: string,
  args: string[],
  logger: LogFn,
  resultParser = (code: number) => code === 0,
) {
  return new Promise<BBResult>((resolve, reject) => {
    const acvm = proc.spawn(pathToBB, [command, ...args]);
    acvm.stdout.on('data', data => {
      const message = data.toString('utf-8').replace(/\n$/, '');
      logger(message);
    });
    acvm.stderr.on('data', data => {
      const message = data.toString('utf-8').replace(/\n$/, '');
      logger(message);
    });
    acvm.on('close', (code: number) => {
      if (resultParser(code)) {
        resolve({ status: BB_RESULT.SUCCESS });
      } else {
        reject('BB execution failed');
      }
    });
  }).catch((reason: string) => ({ status: BB_RESULT.FAILURE, reason }));
}

const bytecodeHashFilename = 'bytecode_hash';

async function generateKeyForNoirCircuit(
  pathToBB: string,
  workingDirectory: string,
  circuitName: string,
  compiledCircuit: NoirCompiledCircuit,
  key: 'vk' | 'pk',
  log: LogFn,
  force = false,
) {
  // The bytecode is written to e.g. /workingDirectory/pk/BaseParityArtifact-bytecode
  const bytecodePath = `${workingDirectory}/${key}/${circuitName}-bytecode`;
  const bytecode = Buffer.from(compiledCircuit.bytecode, 'base64');

  // The key generation outputs are written to e.g. /workingDirectory/pk/BaseParityArtifact/
  // The bytecode hash file is also written here as /workingDirectory/pk/BaseParityArtifact/bytecode-hash
  const circuitOutputDirectory = `${workingDirectory}/${key}/${circuitName}`;
  const bytecodeHashPath = `${circuitOutputDirectory}/${bytecodeHashFilename}`;
  const bytecodeHash = sha256(bytecode);

  const outputPath = `${circuitOutputDirectory}/${key}`;

  let mustRegenerate =
    force ||
    (await fs
      .access(bytecodeHashPath, fs.constants.R_OK)
      .then(_ => false)
      .catch(_ => true));

  if (!mustRegenerate) {
    const data: Buffer = await fs.readFile(bytecodeHashPath).catch(_ => Buffer.alloc(0));
    mustRegenerate = data.length == 0 || !data.equals(bytecodeHash);
  }

  if (!mustRegenerate) {
    const alreadyPresent: BBSuccess = { status: BB_RESULT.ALREADY_PRESENT };
    return { result: alreadyPresent, outputPath: outputPath };
  }

  const binaryPresent = await fs
    .access(pathToBB, fs.constants.R_OK)
    .then(_ => true)
    .catch(_ => false);
  if (!binaryPresent) {
    const failed: BBFailure = { status: BB_RESULT.FAILURE, reason: `Failed to find bb binary at ${pathToBB}` };
    return { result: failed, outputPath: outputPath };
  }

  // Clear up the circuit output directory removing anything that is there
  await fs.rm(circuitOutputDirectory, { recursive: true, force: true });
  await fs.mkdir(circuitOutputDirectory, { recursive: true });
  // Write the bytecode and input witness to the working directory
  await fs.writeFile(bytecodePath, bytecode);

  const args = ['-o', outputPath, '-b', bytecodePath];
  const timer = new Timer();
  const result = await executeBB(pathToBB, `write_${key}`, args, log);
  const duration = timer.ms();
  await fs.rm(bytecodePath, { force: true });
  await fs.writeFile(bytecodeHashPath, bytecodeHash);
  return { result, duration, outputPath };
}

export async function generateVerificationKeyForNoirCircuit(
  pathToBB: string,
  workingDirectory: string,
  circuitName: string,
  compiledCircuit: NoirCompiledCircuit,
  log: LogFn,
) {
  const { result, duration, outputPath } = await generateKeyForNoirCircuit(
    pathToBB,
    workingDirectory,
    circuitName,
    compiledCircuit,
    'vk',
    log,
  );
  if (result.status === BB_RESULT.FAILURE) {
    log(`Failed to generate verification key for circuit ${circuitName}, reason: ${result.reason}`);
    return;
  }
  if (result.status === BB_RESULT.ALREADY_PRESENT) {
    log(`Verification key for circuit ${circuitName} was already present`);
    return outputPath;
  }
  const stats = await fs.stat(outputPath);
  log(
    `Verification key for circuit ${circuitName} generated in ${duration} ms, size: ${stats.size / (1024 * 1024)} MB`,
  );
  return outputPath;
}

export async function generateProvingKeyForNoirCircuit(
  pathToBB: string,
  workingDirectory: string,
  circuitName: string,
  compiledCircuit: NoirCompiledCircuit,
  log: LogFn,
) {
  const { result, duration, outputPath } = await generateKeyForNoirCircuit(
    pathToBB,
    workingDirectory,
    circuitName,
    compiledCircuit,
    'pk',
    log,
  );
  if (result.status === BB_RESULT.FAILURE) {
    log(`Failed to generate proving key for circuit ${circuitName}, reason: ${result.reason}`);
    return;
  }
  if (result.status === BB_RESULT.ALREADY_PRESENT) {
    log(`Proving key for circuit ${circuitName} was already present`);
    return outputPath;
  }
  const stats = await fs.stat(outputPath);
  log(
    `Proving key for circuit ${circuitName} written to ${outputPath} in ${duration} ms, size: ${
      stats.size / (1024 * 1024)
    } MB`,
  );
  return outputPath;
}

export async function generateProof(
  pathToBB: string,
  workingDirectory: string,
  circuitName: string,
  compiledCircuit: NoirCompiledCircuit,
  inputWitnessFile: string,
  log: LogFn,
) {
  // The bytecode is written to e.g. /workingDirectory/pk/BaseParityArtifact-bytecode
  const bytecodePath = `${workingDirectory}/proof/${circuitName}-bytecode`;
  const bytecode = Buffer.from(compiledCircuit.bytecode, 'base64');

  // The key generation outputs are written to e.g. /workingDirectory/pk/BaseParityArtifact/
  // The bytecode hash file is also written here as /workingDirectory/pk/BaseParityArtifact/bytecode-hash
  const circuitOutputDirectory = `${workingDirectory}/proof/${circuitName}`;

  const binaryPresent = await fs
    .access(pathToBB, fs.constants.R_OK)
    .then(_ => true)
    .catch(_ => false);
  if (!binaryPresent) {
    const failed: BBFailure = { status: BB_RESULT.FAILURE, reason: `Failed to find bb binary at ${pathToBB}` };
    return { result: failed, outputPath: circuitOutputDirectory, duration: 0 };
  }

  // Clear up the circuit output directory removing anything that is there
  await fs.rm(circuitOutputDirectory, { recursive: true, force: true });
  await fs.mkdir(circuitOutputDirectory, { recursive: true });
  // Write the bytecode and input witness to the working directory
  await fs.writeFile(bytecodePath, bytecode);

  const outputPath = `${circuitOutputDirectory}/proof`;
  const args = ['-o', outputPath, '-b', bytecodePath, '-w', inputWitnessFile];
  const command = 'prove';
  const timer = new Timer();
  const logFunction = (message: string) => {
    log(`${circuitName} BB out - ${message}`);
  };
  const result = await executeBB(pathToBB, command, args, logFunction);
  const duration = timer.ms();
  await fs.rm(bytecodePath, { force: true });
  return { result, duration, outputPath };
}

export async function verifyProof(pathToBB: string, proofFullPath: string, verificationKeyPath: string, log: LogFn) {
  const binaryPresent = await fs
    .access(pathToBB, fs.constants.R_OK)
    .then(_ => true)
    .catch(_ => false);
  if (!binaryPresent) {
    const failed: BBFailure = { status: BB_RESULT.FAILURE, reason: `Failed to find bb binary at ${pathToBB}` };
    return { result: failed, duration: 0 };
  }

  const args = ['-p', proofFullPath, '-k', verificationKeyPath];
  const timer = new Timer();
  const result = await executeBB(pathToBB, 'verify', args, log);
  const duration = timer.ms();
  return { result, duration };
}
