import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  BB_RESULT,
  PROOF_FIELDS_FILENAME,
  PROOF_FILENAME,
  VK_FIELDS_FILENAME,
  VK_FILENAME,
  generateProof,
} from './execute.js';
import { runInDirectory } from './utils.js';
import { Circuit, FieldsAndBinary } from '../barretenberg_cmds/types.js';

/**
 * Implements the BarretenbergCmds interface using the native Barretenberg CLI.
 */
export class BarretenbergNativeCLI {
  constructor(private pathToBinary: string, private workingDirectory: string, private logger: (msg: string) => void) {}

  prove(circuit: Circuit, witness: Buffer): Promise<{ proof: FieldsAndBinary; vk: FieldsAndBinary }> {
    return this.withTmpDir(async dir => {
      const witnessFile = `${dir}/witness`;
      await fs.writeFile(witnessFile, witness);
      const provingResult = await generateProof(
        this.pathToBinary,
        dir,
        circuit.name,
        circuit.bytecode,
        witnessFile,
        this.logger,
      );

      if (provingResult.status === BB_RESULT.FAILURE) {
        throw new Error(`Failed to generate proof: ${provingResult.reason}`);
      }

      const { proofPath, vkPath } = provingResult;
      const [proofBinary, proofFields, vkBinary, vkFields] = await Promise.all([
        fs.readFile(path.join(proofPath!, PROOF_FILENAME)),
        this.readFields(path.join(proofPath!, PROOF_FIELDS_FILENAME)),
        fs.readFile(path.join(vkPath!, VK_FILENAME)),
        this.readFields(path.join(vkPath!, VK_FIELDS_FILENAME)),
      ]);

      return {
        proof: { binary: proofBinary, fields: proofFields },
        vk: { binary: vkBinary, fields: vkFields },
      };
    });
  }

  private withTmpDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    return runInDirectory(this.workingDirectory, fn, true);
  }

  private async readFields(path: string): Promise<Buffer[]> {
    const rawFields = await fs.readFile(path, { encoding: 'utf-8' });
    const fieldsJson = JSON.parse(rawFields);
    return fieldsJson.map((field: string) => Buffer.from(field.replace(/^0x/i, ''), 'hex'));
  }
}
