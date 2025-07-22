import { Buffer } from 'buffer';
import { Encoder, decode } from 'msgpackr';
import { readFileSync, writeFileSync } from 'fs';
import { gzipSync, gunzipSync } from 'zlib';
import { BbApiBase } from './generated/api_types.js';

/**
 * Represents a private execution step as stored in ivc-inputs.msgpack files.
 * Matches the C++ PrivateExecutionStepRaw structure.
 */
export interface IvcInputStep {
  bytecode: Buffer;
  witness: Buffer;
  vk: Buffer;
  functionName: string;
}

/**
 * Msgpack structure with snake_case fields as expected by C++
 */
interface MsgpackIvcInputStep {
  bytecode: Buffer;
  witness: Buffer;
  vk: Buffer;
  functionName: string;  // Note: This is camelCase in msgpack per C++ custom serialization
}

/**
 * Helper class for reading and writing IVC input files (ivc-inputs.msgpack).
 * These files contain arrays of private execution steps used by the Client IVC API.
 */
export class IvcInputs {
  private steps: IvcInputStep[] = [];

  constructor(steps: IvcInputStep[] = []) {
    this.steps = steps;
  }

  /**
   * Load IVC inputs from a msgpack file
   */
  static fromFile(path: string): IvcInputs {
    const buffer = readFileSync(path);
    const decoded = decode(buffer) as MsgpackIvcInputStep[];

    if (!Array.isArray(decoded)) {
      throw new Error('Expected an array of execution steps in msgpack file');
    }

    const steps = decoded.map(step => ({
      // Decompress bytecode and witness fields
      bytecode: gunzipSync(Buffer.from(step.bytecode)),
      witness: gunzipSync(Buffer.from(step.witness)),
      vk: Buffer.from(step.vk),
      functionName: step.functionName,
    }));

    return new IvcInputs(steps);
  }

  /**
   * Save IVC inputs to a msgpack file
   */
  toFile(path: string): void {
    const encoder = new Encoder({ useRecords: false });

    // Convert to msgpack format and compress bytecode/witness fields
    const msgpackSteps: MsgpackIvcInputStep[] = this.steps.map(step => ({
      bytecode: gzipSync(step.bytecode),
      witness: gzipSync(step.witness),
      vk: step.vk,
      functionName: step.functionName,
    }));

    const encoded = encoder.encode(msgpackSteps);
    writeFileSync(path, encoded);
  }

  /**
   * Add a step to the execution
   */
  addStep(step: IvcInputStep): void {
    this.steps.push(step);
  }

  /**
   * Get all execution steps
   */
  getSteps(): IvcInputStep[] {
    return this.steps;
  }

  /**
   * Get a specific step by index
   */
  getStep(index: number): IvcInputStep | undefined {
    return this.steps[index];
  }

  /**
   * Get the number of steps
   */
  getStepCount(): number {
    return this.steps.length;
  }

  /**
   * Clear all steps
   */
  clear(): void {
    this.steps = [];
  }
}

/**
 * High-level helper class for working with IVC inputs and any of the generated APIs.
 * This provides a convenient interface for common IVC operations.
 */
export class IvcRunner {
  constructor(private api: BbApiBase) {}

  /**
   * Initialize IVC with the given number of circuits
   */
  async start(numCircuits: number): Promise<void> {
    await this.api.clientIvcStart({ numCircuits });
  }

  /**
   * Accumulate a single step from IVC inputs
   */
  queueStep(step: IvcInputStep): void {
    this.api.clientIvcLoad({
      circuit: {
        name: step.functionName,
        bytecode: step.bytecode,
        verificationKey: step.vk,
      }
    });
    this.api.clientIvcAccumulate({
      witness: step.witness,
    });
  }

  /**
   * Accumulate all steps from an IVC inputs file
   */
  async accumulateFromFile(path: string): Promise<void> {
    const inputs = IvcInputs.fromFile(path);
    const steps = inputs.getSteps();

    // First, start IVC with the number of circuits
    await this.start(steps.length);
    console.log("start")

    // Then accumulate each step
    for (const step of steps) {
      this.queueStep(step);
      console.log(`Queued step for function: ${step.functionName}`);
    }
  }

  /**
   * Check if precomputed VKs are valid
   */
  async checkPrecomputedVks(path: string): Promise<boolean> {
    // For now, just return true as VK validation would require additional implementation
    console.log('VK validation not yet implemented');
    return true;
  }

  /**
   * Accumulate a single step (alias for queueStep for backward compatibility)
   */
  accumulateStep(step: IvcInputStep): void {
    this.queueStep(step);
  }

  /**
   * Run the complete IVC process from a file
   */
  async runComplete(path: string) {
    await this.accumulateFromFile(path);
    return await this.prove();
  }

  /**
   * Prove the accumulated circuit
   */
  async prove() {
    const result = await this.api.clientIvcProve({});
    return result.proof;
  }
}
