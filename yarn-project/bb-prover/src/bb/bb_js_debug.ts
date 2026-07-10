import type { AvmStat } from '@aztec/bb.js';
import type { Logger } from '@aztec/foundation/log';

import { promises as fs } from 'fs';
import * as path from 'path';
import { gzipSync } from 'zlib';

import type { UltraHonkFlavor } from '../honk.js';
import type { BBJsApi, BBJsProofResult } from './bb_js_backend.js';

/**
 * Maps UltraHonk flavors to the CLI flags used by the bb binary.
 * The CLI always uses `--scheme ultra_honk`; flavors are expressed via
 * `--oracle_hash` and `--ipa_accumulation`.
 */
function getCliFlags(flavor: UltraHonkFlavor): string {
  const base = '--scheme ultra_honk --disable_zk';
  switch (flavor) {
    case 'ultra_honk':
      return `${base} --oracle_hash poseidon2`;
    case 'ultra_keccak_honk':
      return `${base} --oracle_hash keccak`;
    case 'ultra_starknet_honk':
      return `${base} --oracle_hash starknet`;
    case 'ultra_rollup_honk':
      return `${base} --oracle_hash poseidon2 --ipa_accumulation`;
  }
}

/** Concatenate an array of 32-byte field elements into a single buffer. */
function concatFields(fields: Uint8Array[]): Buffer {
  const totalLen = fields.reduce((sum, f) => sum + f.length, 0);
  const buf = Buffer.alloc(totalLen);
  let offset = 0;
  for (const f of fields) {
    buf.set(f, offset);
    offset += f.length;
  }
  return buf;
}

/**
 * Process-wide dump counter. The factory creates a fresh instance (and thus a fresh debug
 * wrapper) per proving job, so a per-instance counter would make every job of the same
 * circuit type write to the same directory and clobber earlier dumps. A module-level
 * counter also preserves the global dispatch order across concurrent jobs.
 */
let dumpCounter = 0;

/**
 * Wraps a BBJsApi instance to write debug files and log equivalent CLI commands.
 * Activated when BB_DEBUG_OUTPUT_DIR is set. Each operation writes its inputs
 * and outputs to a numbered subdirectory, enabling offline reproduction.
 */
export class DebugBBJsInstance implements BBJsApi {
  constructor(
    private inner: BBJsApi,
    private debugDir: string,
    private bbPath: string,
    private logger: Logger,
  ) {}

  private nextDir(prefix: string): string {
    const padded = String(++dumpCounter).padStart(4, '0');
    return path.join(this.debugDir, `${padded}-${prefix}-pid${process.pid}`);
  }

  /** Write a command string to both the logger and a command.sh file in the given directory. */
  private async logCommand(dir: string, command: string): Promise<void> {
    this.logger.info(`Executing BB with: ${command}`);
    await fs.writeFile(path.join(dir, 'command.sh'), `#!/bin/bash\n${command}\n`, { mode: 0o755 });
  }

  async generateProof(
    circuitName: string,
    bytecode: Uint8Array,
    verificationKey: Uint8Array,
    witness: Uint8Array,
    flavor: UltraHonkFlavor,
  ): Promise<BBJsProofResult> {
    const dir = this.nextDir(circuitName);
    await fs.mkdir(dir, { recursive: true });

    const bytecodePath = path.join(dir, `${circuitName}-bytecode.gz`);
    const vkPath = path.join(dir, `${circuitName}-vk`);
    const witnessPath = path.join(dir, 'partial-witness.gz');

    await Promise.all([
      fs.writeFile(bytecodePath, gzipSync(bytecode)),
      fs.writeFile(vkPath, verificationKey),
      fs.writeFile(witnessPath, gzipSync(witness)),
    ]);

    const flags = getCliFlags(flavor);
    await this.logCommand(
      dir,
      `${this.bbPath} prove ${flags} -o ${dir} -b ${bytecodePath} -k ${vkPath} -w ${witnessPath}`,
    );

    const result = await this.inner.generateProof(circuitName, bytecode, verificationKey, witness, flavor);

    const proofBuf = concatFields(result.proofFields);
    const publicInputsBuf = concatFields(result.publicInputFields);
    await Promise.all([
      fs.writeFile(path.join(dir, 'proof'), proofBuf),
      fs.writeFile(path.join(dir, 'public_inputs'), publicInputsBuf),
    ]);

    return result;
  }

  async verifyProof(
    proofFields: Uint8Array[],
    verificationKey: Uint8Array,
    publicInputFields: Uint8Array[],
    flavor: UltraHonkFlavor,
  ): Promise<{ verified: boolean; durationMs: number }> {
    const dir = this.nextDir(`verify-${flavor}`);
    await fs.mkdir(dir, { recursive: true });

    const proofPath = path.join(dir, 'proof');
    const vkPath = path.join(dir, 'vk');
    const publicInputsPath = path.join(dir, 'public_inputs');

    const proofBuf = concatFields(proofFields);
    const publicInputsBuf = concatFields(publicInputFields);
    await Promise.all([
      fs.writeFile(proofPath, proofBuf),
      fs.writeFile(vkPath, verificationKey),
      fs.writeFile(publicInputsPath, publicInputsBuf),
    ]);

    const flags = getCliFlags(flavor);
    await this.logCommand(dir, `${this.bbPath} verify ${flags} -p ${proofPath} -k ${vkPath} -i ${publicInputsPath}`);

    return this.inner.verifyProof(proofFields, verificationKey, publicInputFields, flavor);
  }

  async verifyChonkProof(
    fieldsWithPublicInputs: Uint8Array[],
    verificationKey: Uint8Array,
  ): Promise<{ verified: boolean; durationMs: number }> {
    const dir = this.nextDir('verify-chonk');
    await fs.mkdir(dir, { recursive: true });

    const proofPath = path.join(dir, 'proof');
    const vkPath = path.join(dir, 'vk');

    const proofBuf = concatFields(fieldsWithPublicInputs);
    await Promise.all([fs.writeFile(proofPath, proofBuf), fs.writeFile(vkPath, verificationKey)]);

    await this.logCommand(dir, `${this.bbPath} verify --scheme chonk -p ${proofPath} -k ${vkPath} -v`);

    return this.inner.verifyChonkProof(fieldsWithPublicInputs, verificationKey);
  }

  async computeGateCount(
    circuitName: string,
    bytecode: Uint8Array,
    flavor: UltraHonkFlavor | 'mega_honk',
  ): Promise<{ circuitSize: number; durationMs: number }> {
    const dir = this.nextDir(`gates-${circuitName}`);
    await fs.mkdir(dir, { recursive: true });

    const bytecodePath = path.join(dir, `${circuitName}-bytecode.gz`);
    await fs.writeFile(bytecodePath, gzipSync(bytecode));

    if (flavor === 'mega_honk') {
      await this.logCommand(dir, `${this.bbPath} gates --scheme chonk -b ${bytecodePath}`);
    } else {
      const flags = getCliFlags(flavor);
      await this.logCommand(dir, `${this.bbPath} gates ${flags} -b ${bytecodePath}`);
    }

    return this.inner.computeGateCount(circuitName, bytecode, flavor);
  }

  async generateAvmProof(inputs: Uint8Array): Promise<{ proof: Uint8Array[]; stats: AvmStat[]; durationMs: number }> {
    const dir = this.nextDir('avm-prove');
    await fs.mkdir(dir, { recursive: true });

    const inputsPath = path.join(dir, 'avm_inputs.bin');
    await fs.writeFile(inputsPath, inputs);

    await this.logCommand(dir, `${this.bbPath} avm_prove --avm-inputs ${inputsPath} -o ${dir}`);

    const result = await this.inner.generateAvmProof(inputs);

    const proofBuf = concatFields(result.proof);
    await fs.writeFile(path.join(dir, 'proof'), proofBuf);

    return result;
  }

  async verifyAvmProof(
    proof: Uint8Array[],
    publicInputs: Uint8Array,
  ): Promise<{ verified: boolean; durationMs: number }> {
    const dir = this.nextDir('avm-verify');
    await fs.mkdir(dir, { recursive: true });

    const proofPath = path.join(dir, 'proof');
    const publicInputsPath = path.join(dir, 'avm_public_inputs.bin');

    const proofBuf = concatFields(proof);
    await Promise.all([fs.writeFile(proofPath, proofBuf), fs.writeFile(publicInputsPath, publicInputs)]);

    await this.logCommand(dir, `${this.bbPath} avm_verify -p ${proofPath} --avm-public-inputs ${publicInputsPath}`);

    return this.inner.verifyAvmProof(proof, publicInputs);
  }

  async checkAvmCircuit(inputs: Uint8Array): Promise<{ passed: boolean; stats: AvmStat[]; durationMs: number }> {
    const dir = this.nextDir('avm-check-circuit');
    await fs.mkdir(dir, { recursive: true });

    const inputsPath = path.join(dir, 'avm_inputs.bin');
    await fs.writeFile(inputsPath, inputs);

    await this.logCommand(dir, `${this.bbPath} avm_check_circuit --avm-inputs ${inputsPath}`);

    return this.inner.checkAvmCircuit(inputs);
  }

  generateContract(verificationKey: Uint8Array): Promise<{ solidityCode: string; durationMs: number }> {
    return this.inner.generateContract(verificationKey);
  }

  destroy(): Promise<void> {
    return this.inner.destroy();
  }
}
