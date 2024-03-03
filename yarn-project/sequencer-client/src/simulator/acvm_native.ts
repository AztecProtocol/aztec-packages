import { DecodedInputs } from "@aztec/noir-protocol-circuits-types";
import { Abi, abiDecode, abiEncode } from "@noir-lang/noirc_abi";

import { WitnessMap } from "@noir-lang/acvm_js";
import * as proc from 'child_process';
import fs from 'fs/promises';
import { SimulationProvider } from "./simulation_provider.js";
import { NoirCompiledCircuit } from "@aztec/types/noir";

function parseIntoWitnessMap(outputString: string) {
  const lines = outputString.split('\n');
  return new Map<number, string>(lines.filter((line: string) => line.length).map((line: string) => {
    const pair = line.replaceAll(' ', '').split('=');
    return [Number(pair[0]), pair[1].replaceAll('"', '')];
  }));
}

export async function executeNativeCircuit(inputWitness: WitnessMap, bytecode: Buffer, workingDirectory: string, pathToAcvm: string) {
  const bytecodeFilename = 'bytecode';
  const witnessFilename = 'input_witness.toml';
  let witness_map = '';
  inputWitness.forEach((value: string, key: number) => {
    witness_map = witness_map.concat(`${key} = \'${value}\'\n`);
  });

  await fs.rm(workingDirectory, { recursive: true, force: true });
  await fs.mkdir(workingDirectory, {recursive: true});
  await fs.writeFile(`${workingDirectory}/${bytecodeFilename}`, bytecode);
  await fs.writeFile(`${workingDirectory}/${witnessFilename}`, witness_map);
  const args = [`execute`, `--working-directory`, `${workingDirectory}`, `--bytecode`, `${bytecodeFilename}`, `--input-witness`, `${witnessFilename}`, `--print`];
  const processPromise = new Promise<string>((resolve, reject) => {
    let outputWitness = Buffer.alloc(0);
    let errorBuffer = Buffer.alloc(0);
    const acvm = proc.spawn(pathToAcvm, args);
    acvm.stdout.on('data', (data) => {
      outputWitness = Buffer.concat([outputWitness, data]);
    });
    acvm.stderr.on('data', (data) => {
      errorBuffer = Buffer.concat([errorBuffer, data]);
    });
    acvm.on('close', (code) => {
      if (code === 0) {
        resolve(outputWitness.toString('utf-8'));
      } else {
        reject(errorBuffer.toString('utf-8'));
      }      
    })
  });

  try {
    const output = await processPromise;    
    return parseIntoWitnessMap(output);
  } finally {
    await fs.rm(workingDirectory, { recursive: true, force: true });
  }
}

export class NativeACVMSimulator implements SimulationProvider {
  private count = 0;
  constructor(private workingDirectory: string, private pathToAcvm: string) {}
  async simulateCircuit(input: WitnessMap, compiledCircuit: NoirCompiledCircuit): Promise<WitnessMap> {
    // Execute the circuit on those initial witness values
    //
    // Decode the bytecode from base64 since the acvm does not know about base64 encoding
    const decodedBytecode = Buffer.from(compiledCircuit.bytecode, 'base64');
    //
    // Execute the circuit
    const directory = `${this.workingDirectory}/${this.count}`;
    ++this.count;
    const _witnessMap = await executeNativeCircuit(input, decodedBytecode, directory, this.pathToAcvm);
  
    return _witnessMap;
  }
}

