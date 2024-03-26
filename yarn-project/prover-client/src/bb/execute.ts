import { sha256 } from '@aztec/foundation/crypto';
import { LogFn } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { NoirCompiledCircuit } from '@aztec/types/noir';

import * as proc from 'child_process';
import * as fs from 'fs/promises';
import path from 'path';

enum BB_RESULT {
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
 * @returns The completed partial witness outputted from the circuit
 */
export function executeBB(pathToBB: string, command: string, args: string[], logger: LogFn) {
  return new Promise<BBResult>((resolve, reject) => {
    let errorBuffer = Buffer.alloc(0);
    const acvm = proc.spawn(pathToBB, [command, ...args]);
    acvm.stdout.on('data', data => {
      logger(data.toString('utf-8'));
    });
    acvm.stderr.on('data', data => {
      errorBuffer = Buffer.concat([errorBuffer, data]);
    });
    acvm.on('close', code => {
      if (code === 0) {
        resolve({ status: BB_RESULT.SUCCESS });
      } else {
        reject(errorBuffer.toString('utf-8'));
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
    return { result: alreadyPresent, circuitOutputDirectory };
  }

  const binaryPresent = await fs
    .access(pathToBB, fs.constants.R_OK)
    .then(_ => true)
    .catch(_ => false);
  if (!binaryPresent) {
    const failed: BBFailure = { status: BB_RESULT.FAILURE, reason: `Failed to find bb binary at ${pathToBB}` };
    return { result: failed, circuitOutputDirectory };
  }

  // Clear up the circuit output directory removing anything that is there
  await fs.rm(circuitOutputDirectory, { recursive: true, force: true });
  await fs.mkdir(circuitOutputDirectory, { recursive: true });
  // Write the bytecode and input witness to the working directory
  await fs.writeFile(bytecodePath, bytecode);
  const args = ['-o', circuitOutputDirectory, '-b', bytecodePath];
  const timer = new Timer();
  const result = await executeBB(pathToBB, `write_${key}`, args, log);
  const duration = timer.ms();
  await fs.rm(bytecodePath, { force: true });
  await fs.writeFile(bytecodeHashPath, bytecodeHash);
  return { result, duration, circuitOutputDirectory };
}

const directorySize = async (directory: string, filesToOmit: string[]) => {
  const files = await fs.readdir(directory);
  const stats = files
    .filter(f => !filesToOmit.find(file => file === f))
    .map(file => fs.stat(path.join(directory, file)));

  return (await Promise.all(stats)).reduce((accumulator, { size }) => accumulator + size, 0);
};

export async function generateVerificationKeyForNoirCircuit(
  pathToBB: string,
  workingDirectory: string,
  circuitName: string,
  compiledCircuit: NoirCompiledCircuit,
  log: LogFn,
) {
  const {
    result,
    duration,
    circuitOutputDirectory: keyPath,
  } = await generateKeyForNoirCircuit(pathToBB, workingDirectory, circuitName, compiledCircuit, 'vk', log);
  if (result.status === BB_RESULT.FAILURE) {
    log(`Failed to generate verification key for circuit ${circuitName}, reason: ${result.reason}`);
    return;
  }
  if (result.status === BB_RESULT.ALREADY_PRESENT) {
    log(`Verification key for circuit ${circuitName} was already present`);
    return;
  }
  const size = await directorySize(keyPath, [bytecodeHashFilename]);
  log(
    `Verification key for circuit ${circuitName} written to ${keyPath} in ${duration} ms, size: ${
      size / (1024 * 1024)
    } MB`,
  );
  return result;
}

export async function generateProvingKeyForNoirCircuit(
  pathToBB: string,
  workingDirectory: string,
  circuitName: string,
  compiledCircuit: NoirCompiledCircuit,
  log: LogFn,
) {
  const {
    result,
    duration,
    circuitOutputDirectory: keyPath,
  } = await generateKeyForNoirCircuit(pathToBB, workingDirectory, circuitName, compiledCircuit, 'pk', log);
  if (result.status === BB_RESULT.FAILURE) {
    log(`Failed to generate proving key for circuit ${circuitName}, reason: ${result.reason}`);
    return;
  }
  if (result.status === BB_RESULT.ALREADY_PRESENT) {
    log(`Proving key for circuit ${circuitName} was already present`);
    return;
  }
  const size = await directorySize(keyPath, [bytecodeHashFilename]);
  log(
    `Proving key for circuit ${circuitName} written to ${keyPath} in ${duration} ms, size: ${size / (1024 * 1024)} MB`,
  );
  return result;
}
