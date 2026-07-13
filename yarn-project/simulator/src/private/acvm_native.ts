import { runInDirectory } from '@aztec/foundation/fs';
import { type Logger, type LoggerBindings, resolveLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import type { ForeignCallHandler, WitnessMap } from '@aztec/noir-acvm_js';
import type { FunctionArtifactWithContractName } from '@aztec/stdlib/abi';
import type { NoirCompiledCircuitWithName } from '@aztec/stdlib/noir';

import * as proc from 'child_process';
import { promises as fs } from 'fs';

import type { ACIRCallback, ACIRExecutionResult } from './acvm/acvm.js';
import type { ACVMWitness } from './acvm/acvm_types.js';
import type { CircuitSimulator } from './circuit_simulator.js';

export enum ACVM_RESULT {
  SUCCESS,
  FAILURE,
}

export type ACVMSuccess = {
  status: ACVM_RESULT.SUCCESS;
  duration: number;
  witness: Map<number, string>;
};

export type ACVMFailure = {
  status: ACVM_RESULT.FAILURE;
  reason: string;
};

export type ACVMResult = ACVMSuccess | ACVMFailure;

/**
 * Parses a TOML format witness map string into a Map structure
 * @param outputString - The witness map in TOML format
 * @returns The parsed witness map
 */
function parseIntoWitnessMap(outputString: string) {
  const lines = outputString.split('\n');
  return new Map<number, string>(
    lines
      .filter((line: string) => line.length)
      .map((line: string) => {
        const pair = line.replaceAll(' ', '').split('=');
        return [Number(pair[0]), pair[1].replaceAll('"', '')];
      }),
  );
}

/**
 *
 * @param inputWitness - The circuit's input witness
 * @param bytecode - The circuit bytecode
 * @param workingDirectory - A directory to use for temporary files by the ACVM
 * @param pathToAcvm - The path to the ACVM binary
 * @param outputFilename - If specified, the output will be stored as a file, encoded using Bincode
 * @returns The completed partial witness outputted from the circuit
 */
export async function executeNativeCircuit(
  inputWitness: WitnessMap,
  bytecode: Buffer,
  workingDirectory: string,
  pathToAcvm: string,
  outputFilename?: string,
  loggerOrBindings?: Logger | LoggerBindings,
): Promise<ACVMResult> {
  const logger = resolveLogger('simulator:acvm-native', loggerOrBindings);
  const bytecodeFilename = 'bytecode';
  const witnessFilename = 'input_witness.toml';

  // convert the witness map to TOML format
  let witnessMap = '';
  inputWitness.forEach((value: string, key: number) => {
    witnessMap = witnessMap.concat(`${key} = '${value}'\n`);
  });

  try {
    // Check that the directory exists
    await fs.access(workingDirectory);
  } catch {
    return { status: ACVM_RESULT.FAILURE, reason: `Working directory ${workingDirectory} does not exist` };
  }

  try {
    // Write the bytecode and input witness to the working directory
    await fs.writeFile(`${workingDirectory}/${bytecodeFilename}`, bytecode);
    await fs.writeFile(`${workingDirectory}/${witnessFilename}`, witnessMap);

    // Execute the ACVM using the given args
    const args = [
      `execute`,
      `--working-directory`,
      `${workingDirectory}`,
      `--bytecode`,
      `${bytecodeFilename}`,
      `--input-witness`,
      `${witnessFilename}`,
      '--print',
      '--output-witness',
      'output-witness',
    ];

    logger.debug(`Calling ACVM with ${args.join(' ')}`);

    const processPromise = new Promise<string>((resolve, reject) => {
      const outChunks: Buffer[] = [];
      const errChunks: Buffer[] = [];
      let outLen = 0;
      let errLen = 0;
      const acvm = proc.spawn(pathToAcvm, args);
      acvm.stdout.on('data', (data: Buffer) => {
        outChunks.push(data);
        outLen += data.length;
      });
      acvm.stderr.on('data', (data: Buffer) => {
        errChunks.push(data);
        errLen += data.length;
      });
      acvm.on('close', code => {
        if (code === 0) {
          resolve(Buffer.concat(outChunks, outLen).toString('utf-8'));
        } else {
          const stderr = Buffer.concat(errChunks, errLen);
          logger.error(`From ACVM: ${stderr.toString('utf-8')}`);
          reject(stderr.toString('utf-8'));
        }
      });
    });

    const timer = new Timer();
    const output = await processPromise;
    const duration = timer.ms();
    if (outputFilename) {
      const outputWitnessFileName = `${workingDirectory}/output-witness.gz`;
      await fs.copyFile(outputWitnessFileName, outputFilename);
    }
    // TODO: We shouldn't be parsing the witness from stdout, it's not very performant, and we end up with two ways of fetching the witness.
    // We probably should implement the WitnessStack type, run the ACVM with msgpack serialization mode (env variable), and ungzip and parse the witness from
    // the outputted gz witness file.
    const witness = parseIntoWitnessMap(output);
    return { status: ACVM_RESULT.SUCCESS, witness, duration };
  } catch (error) {
    return { status: ACVM_RESULT.FAILURE, reason: `${error}` };
  }
}

/**
 * Executes a circuit with the native ACVM and leaves the output witness in a file, without parsing it. Unlike
 * `executeNativeCircuit` this does not pass `--print`, so the (potentially huge) output witness is never buffered on
 * stdout nor parsed into a map — callers that only need the witness file (e.g. the server prover, which recovers the
 * circuit outputs from the proof's public inputs) skip that cost entirely.
 * @param inputWitness - The circuit's input witness
 * @param bytecode - The circuit bytecode
 * @param workingDirectory - A directory to use for temporary files by the ACVM
 * @param pathToAcvm - The path to the ACVM binary
 * @param outputFilename - The file to store the output witness in, encoded using Bincode
 */
export async function executeNativeCircuitToWitnessFile(
  inputWitness: WitnessMap,
  bytecode: Buffer,
  workingDirectory: string,
  pathToAcvm: string,
  outputFilename: string,
  loggerOrBindings?: Logger | LoggerBindings,
): Promise<Omit<ACVMSuccess, 'witness'> | ACVMFailure> {
  const logger = resolveLogger('simulator:acvm-native', loggerOrBindings);
  const bytecodeFilename = 'bytecode';
  const witnessFilename = 'input_witness.toml';

  // convert the witness map to TOML format
  const witnessLines: string[] = [];
  inputWitness.forEach((value: string, key: number) => {
    witnessLines.push(`${key} = '${value}'`);
  });

  try {
    // Check that the directory exists
    await fs.access(workingDirectory);
  } catch {
    return { status: ACVM_RESULT.FAILURE, reason: `Working directory ${workingDirectory} does not exist` };
  }

  try {
    // Write the bytecode and input witness to the working directory
    await fs.writeFile(`${workingDirectory}/${bytecodeFilename}`, bytecode);
    await fs.writeFile(`${workingDirectory}/${witnessFilename}`, witnessLines.join('\n'));

    // Execute the ACVM using the given args
    const args = [
      `execute`,
      `--working-directory`,
      `${workingDirectory}`,
      `--bytecode`,
      `${bytecodeFilename}`,
      `--input-witness`,
      `${witnessFilename}`,
      '--output-witness',
      'output-witness',
    ];

    logger.debug(`Calling ACVM with ${args.join(' ')}`);

    const processPromise = new Promise<void>((resolve, reject) => {
      const errChunks: Buffer[] = [];
      let errLen = 0;
      const acvm = proc.spawn(pathToAcvm, args);
      acvm.stderr.on('data', (data: Buffer) => {
        errChunks.push(data);
        errLen += data.length;
      });
      acvm.on('close', code => {
        if (code === 0) {
          resolve();
        } else {
          const stderr = Buffer.concat(errChunks, errLen).toString('utf-8');
          logger.error(`From ACVM: ${stderr}`);
          reject(stderr);
        }
      });
    });

    const timer = new Timer();
    await processPromise;
    const duration = timer.ms();
    await fs.copyFile(`${workingDirectory}/output-witness.gz`, outputFilename);
    return { status: ACVM_RESULT.SUCCESS, duration };
  } catch (error) {
    return { status: ACVM_RESULT.FAILURE, reason: `${error}` };
  }
}

export class NativeACVMSimulator implements CircuitSimulator {
  private logger: Logger;

  constructor(
    private workingDirectory: string,
    private pathToAcvm: string,
    private witnessFilename?: string,
    loggerOrBindings?: Logger | LoggerBindings,
  ) {
    this.logger = resolveLogger('simulator:acvm-native', loggerOrBindings);
  }

  async executeProtocolCircuit(
    input: ACVMWitness,
    artifact: NoirCompiledCircuitWithName,
    callback: ForeignCallHandler | undefined,
  ): Promise<ACVMSuccess> {
    // Execute the circuit on those initial witness values

    if (callback) {
      throw new Error('Native ACVM simulator does not support foreign calls. Ignoring callback.');
    }

    const operation = async (directory: string) => {
      // Decode the bytecode from base64 since the acvm does not know about base64 encoding
      const decodedBytecode = Buffer.from(artifact.bytecode, 'base64');
      // Execute the circuit
      const result = await executeNativeCircuit(
        input,
        decodedBytecode,
        directory,
        this.pathToAcvm,
        this.witnessFilename,
        this.logger,
      );

      if (result.status == ACVM_RESULT.FAILURE) {
        throw new Error(`Failed to generate witness: ${result.reason}`);
      }

      return result;
    };

    return await runInDirectory(this.workingDirectory, operation, false, this.logger);
  }

  /**
   * Executes a protocol circuit natively and writes the output witness to the configured witness file, without
   * parsing the witness. Callers that only need the witness file (e.g. the server prover, which recovers the circuit
   * outputs from the proof's public inputs) avoid buffering and parsing the full output witness.
   */
  async executeProtocolCircuitToWitnessFile(
    input: ACVMWitness,
    artifact: NoirCompiledCircuitWithName,
  ): Promise<{ duration: number }> {
    const witnessFilename = this.witnessFilename;
    if (!witnessFilename) {
      throw new Error('A witness filename is required to execute a circuit to a witness file');
    }

    const operation = async (directory: string) => {
      // Decode the bytecode from base64 since the acvm does not know about base64 encoding
      const decodedBytecode = Buffer.from(artifact.bytecode, 'base64');
      // Execute the circuit
      const result = await executeNativeCircuitToWitnessFile(
        input,
        decodedBytecode,
        directory,
        this.pathToAcvm,
        witnessFilename,
        this.logger,
      );

      if (result.status == ACVM_RESULT.FAILURE) {
        throw new Error(`Failed to generate witness: ${result.reason}`);
      }

      return { duration: result.duration };
    };

    return await runInDirectory(this.workingDirectory, operation, false, this.logger);
  }

  executeUserCircuit(
    _input: ACVMWitness,
    _artifact: FunctionArtifactWithContractName,
    _callback: ACIRCallback,
  ): Promise<ACIRExecutionResult> {
    throw new Error('Not implemented');
  }
}
