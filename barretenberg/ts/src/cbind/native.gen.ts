/* eslint-disable */
// GENERATED FILE DO NOT EDIT, RUN yarn generate
import { Buffer } from 'buffer';
import * as apiTypes from './apiTypes.gen.js';
export type { CircuitBenchmark, CircuitBenchmarkResponse, CircuitCheck, CircuitCheckResponse, CircuitComputeVk, CircuitComputeVkResponse, CircuitInfo, CircuitInfoResponse, CircuitInput, CircuitInputNoVK, CircuitProve, CircuitProveAndVerify, CircuitProveAndVerifyResponse, CircuitProveResponse, CircuitVerify, CircuitVerifyResponse, CircuitWriteSolidityVerifier, CircuitWriteSolidityVerifierResponse, ClientIvcAccumulate, ClientIvcAccumulateResponse, ClientIvcCheckPrecomputedVk, ClientIvcCheckPrecomputedVkResponse, ClientIvcComputeIvcVk, ClientIvcComputeIvcVkResponse, ClientIvcComputeStandaloneVk, ClientIvcComputeStandaloneVkResponse, ClientIvcLoad, ClientIvcLoadResponse, ClientIvcProve, ClientIvcProveResponse, ClientIvcStart, ClientIvcStartResponse, ECCVMProof, Fr, GoblinProof, Proof, ProofAsFields, ProofAsFieldsResponse, ProofSystemSettings, VkAsFields, VkAsFieldsResponse } from './apiTypes.gen.js';

import { spawn, ChildProcess } from 'child_process';
import { encode } from 'msgpackr';

/**
 * Native API wrapper for bb binary using msgpack over stdin/stdout.
 * All methods return promises and handle length-encoded msgpack buffers.
 */
export class NativeApi {
  private process: ChildProcess | null = null;
  private closed = false;
  private pendingRequests: Array<{ resolve: (value: any) => void; reject: (error: any) => void }> = [];
  private responseBuffer = Buffer.alloc(0);

  constructor(private bbPath: string = "bb") {}

  /**
   * Initialize the bb process with msgpack run command
   */
  async init(): Promise<void> {
    if (this.process) {
      throw new Error("NativeApi already initialized");
    }

    this.process = spawn(this.bbPath, ["msgpack", "run"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Handle process exit
    this.process.on("exit", (code, signal) => {
      this.closed = true;
      const error = new Error(`bb process exited with code ${code} and signal ${signal}`);
      // Reject all pending requests
      for (const { reject } of this.pendingRequests) {
        reject(error);
      }
      this.pendingRequests = [];
    });

    // Handle stderr
    this.process.stderr?.on("data", (data) => {
      console.error("bb stderr:", data.toString());
    });

    // Handle stdout - accumulate response data
    this.process.stdout?.on("data", (data: Buffer) => {
      this.responseBuffer = Buffer.concat([this.responseBuffer, data]);
      this.processResponses();
    });

    // Handle process errors
    this.process.on("error", (error) => {
      this.closed = true;
      for (const { reject } of this.pendingRequests) {
        reject(error);
      }
      this.pendingRequests = [];
    });
  }

  /**
   * Process accumulated response data
   */
  private processResponses(): void {
    while (this.responseBuffer.length >= 4) {
      // Read the length prefix (4 bytes, little-endian)
      const length = this.responseBuffer.readUInt32LE(0);
      
      // Check if we have the complete message
      if (this.responseBuffer.length < 4 + length) {
        break; // Wait for more data
      }

      // Extract the msgpack data
      const responseData = this.responseBuffer.subarray(4, 4 + length);
      this.responseBuffer = this.responseBuffer.subarray(4 + length);

      // Decode the response
      const [variantName, response] = responseData as any; // Will be decoded by caller

      // Resolve the oldest pending request
      const pending = this.pendingRequests.shift();
      if (pending) {
        pending.resolve([variantName, response]);
      }
    }
  }

  /**
   * Send a command to the bb process
   */
  private async sendCommand(command: [string, any]): Promise<[string, any]> {
    if (!this.process || this.closed) {
      throw new Error("NativeApi not initialized or closed");
    }

    // Encode the command
    const encoded = encode(command);
    
    // Create length-prefixed buffer
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32LE(encoded.length, 0);
    
    // Send to bb process
    const fullBuffer = Buffer.concat([lengthBuffer, encoded]);
    
    // Create promise for response
    const responsePromise = new Promise<[string, any]>((resolve, reject) => {
      this.pendingRequests.push({ resolve, reject });
    });

    // Write to stdin
    this.process.stdin?.write(fullBuffer);

    return responsePromise;
  }

  /**
   * Close the bb process
   */
  async close(): Promise<void> {
    if (this.process && !this.closed) {
      this.closed = true;
      this.process.kill();
      this.process = null;
    }
  }

  async circuitProve(command: apiTypes.CircuitProve): Promise<apiTypes.CircuitProveResponse> {
    const msgpackCommand = apiTypes.fromCircuitProve(command);
    const [variantName, result] = await this.sendCommand(["CircuitProve", msgpackCommand]);
    if (variantName !== 'CircuitProveResponse') {
      throw new Error(`Expected variant name 'CircuitProveResponse' but got '${variantName}'`);
    }
    return apiTypes.toCircuitProveResponse(result);
  }

  async circuitComputeVk(command: apiTypes.CircuitComputeVk): Promise<apiTypes.CircuitComputeVkResponse> {
    const msgpackCommand = apiTypes.fromCircuitComputeVk(command);
    const [variantName, result] = await this.sendCommand(["CircuitComputeVk", msgpackCommand]);
    if (variantName !== 'CircuitComputeVkResponse') {
      throw new Error(`Expected variant name 'CircuitComputeVkResponse' but got '${variantName}'`);
    }
    return apiTypes.toCircuitComputeVkResponse(result);
  }

  async circuitInfo(command: apiTypes.CircuitInfo): Promise<apiTypes.CircuitInfoResponse> {
    const msgpackCommand = apiTypes.fromCircuitInfo(command);
    const [variantName, result] = await this.sendCommand(["CircuitInfo", msgpackCommand]);
    if (variantName !== 'CircuitInfoResponse') {
      throw new Error(`Expected variant name 'CircuitInfoResponse' but got '${variantName}'`);
    }
    return apiTypes.toCircuitInfoResponse(result);
  }

  async circuitCheck(command: apiTypes.CircuitCheck): Promise<apiTypes.CircuitCheckResponse> {
    const msgpackCommand = apiTypes.fromCircuitCheck(command);
    const [variantName, result] = await this.sendCommand(["CircuitCheck", msgpackCommand]);
    if (variantName !== 'CircuitCheckResponse') {
      throw new Error(`Expected variant name 'CircuitCheckResponse' but got '${variantName}'`);
    }
    return apiTypes.toCircuitCheckResponse(result);
  }

  async circuitVerify(command: apiTypes.CircuitVerify): Promise<apiTypes.CircuitVerifyResponse> {
    const msgpackCommand = apiTypes.fromCircuitVerify(command);
    const [variantName, result] = await this.sendCommand(["CircuitVerify", msgpackCommand]);
    if (variantName !== 'CircuitVerifyResponse') {
      throw new Error(`Expected variant name 'CircuitVerifyResponse' but got '${variantName}'`);
    }
    return apiTypes.toCircuitVerifyResponse(result);
  }

  async clientIvcComputeStandaloneVk(command: apiTypes.ClientIvcComputeStandaloneVk): Promise<apiTypes.ClientIvcComputeStandaloneVkResponse> {
    const msgpackCommand = apiTypes.fromClientIvcComputeStandaloneVk(command);
    const [variantName, result] = await this.sendCommand(["ClientIvcComputeStandaloneVk", msgpackCommand]);
    if (variantName !== 'ClientIvcComputeStandaloneVkResponse') {
      throw new Error(`Expected variant name 'ClientIvcComputeStandaloneVkResponse' but got '${variantName}'`);
    }
    return apiTypes.toClientIvcComputeStandaloneVkResponse(result);
  }

  async clientIvcComputeIvcVk(command: apiTypes.ClientIvcComputeIvcVk): Promise<apiTypes.ClientIvcComputeIvcVkResponse> {
    const msgpackCommand = apiTypes.fromClientIvcComputeIvcVk(command);
    const [variantName, result] = await this.sendCommand(["ClientIvcComputeIvcVk", msgpackCommand]);
    if (variantName !== 'ClientIvcComputeIvcVkResponse') {
      throw new Error(`Expected variant name 'ClientIvcComputeIvcVkResponse' but got '${variantName}'`);
    }
    return apiTypes.toClientIvcComputeIvcVkResponse(result);
  }

  async clientIvcStart(command: apiTypes.ClientIvcStart): Promise<apiTypes.ClientIvcStartResponse> {
    const msgpackCommand = apiTypes.fromClientIvcStart(command);
    const [variantName, result] = await this.sendCommand(["ClientIvcStart", msgpackCommand]);
    if (variantName !== 'ClientIvcStartResponse') {
      throw new Error(`Expected variant name 'ClientIvcStartResponse' but got '${variantName}'`);
    }
    return apiTypes.toClientIvcStartResponse(result);
  }

  async clientIvcLoad(command: apiTypes.ClientIvcLoad): Promise<apiTypes.ClientIvcLoadResponse> {
    const msgpackCommand = apiTypes.fromClientIvcLoad(command);
    const [variantName, result] = await this.sendCommand(["ClientIvcLoad", msgpackCommand]);
    if (variantName !== 'ClientIvcLoadResponse') {
      throw new Error(`Expected variant name 'ClientIvcLoadResponse' but got '${variantName}'`);
    }
    return apiTypes.toClientIvcLoadResponse(result);
  }

  async clientIvcAccumulate(command: apiTypes.ClientIvcAccumulate): Promise<apiTypes.ClientIvcAccumulateResponse> {
    const msgpackCommand = apiTypes.fromClientIvcAccumulate(command);
    const [variantName, result] = await this.sendCommand(["ClientIvcAccumulate", msgpackCommand]);
    if (variantName !== 'ClientIvcAccumulateResponse') {
      throw new Error(`Expected variant name 'ClientIvcAccumulateResponse' but got '${variantName}'`);
    }
    return apiTypes.toClientIvcAccumulateResponse(result);
  }

  async clientIvcProve(command: apiTypes.ClientIvcProve): Promise<apiTypes.ClientIvcProveResponse> {
    const msgpackCommand = apiTypes.fromClientIvcProve(command);
    const [variantName, result] = await this.sendCommand(["ClientIvcProve", msgpackCommand]);
    if (variantName !== 'ClientIvcProveResponse') {
      throw new Error(`Expected variant name 'ClientIvcProveResponse' but got '${variantName}'`);
    }
    return apiTypes.toClientIvcProveResponse(result);
  }

  async proofAsFields(command: apiTypes.ProofAsFields): Promise<apiTypes.ProofAsFieldsResponse> {
    const msgpackCommand = apiTypes.fromProofAsFields(command);
    const [variantName, result] = await this.sendCommand(["ProofAsFields", msgpackCommand]);
    if (variantName !== 'ProofAsFieldsResponse') {
      throw new Error(`Expected variant name 'ProofAsFieldsResponse' but got '${variantName}'`);
    }
    return apiTypes.toProofAsFieldsResponse(result);
  }

  async vkAsFields(command: apiTypes.VkAsFields): Promise<apiTypes.VkAsFieldsResponse> {
    const msgpackCommand = apiTypes.fromVkAsFields(command);
    const [variantName, result] = await this.sendCommand(["VkAsFields", msgpackCommand]);
    if (variantName !== 'VkAsFieldsResponse') {
      throw new Error(`Expected variant name 'VkAsFieldsResponse' but got '${variantName}'`);
    }
    return apiTypes.toVkAsFieldsResponse(result);
  }

  async circuitWriteSolidityVerifier(command: apiTypes.CircuitWriteSolidityVerifier): Promise<apiTypes.CircuitWriteSolidityVerifierResponse> {
    const msgpackCommand = apiTypes.fromCircuitWriteSolidityVerifier(command);
    const [variantName, result] = await this.sendCommand(["CircuitWriteSolidityVerifier", msgpackCommand]);
    if (variantName !== 'CircuitWriteSolidityVerifierResponse') {
      throw new Error(`Expected variant name 'CircuitWriteSolidityVerifierResponse' but got '${variantName}'`);
    }
    return apiTypes.toCircuitWriteSolidityVerifierResponse(result);
  }

  async circuitProveAndVerify(command: apiTypes.CircuitProveAndVerify): Promise<apiTypes.CircuitProveAndVerifyResponse> {
    const msgpackCommand = apiTypes.fromCircuitProveAndVerify(command);
    const [variantName, result] = await this.sendCommand(["CircuitProveAndVerify", msgpackCommand]);
    if (variantName !== 'CircuitProveAndVerifyResponse') {
      throw new Error(`Expected variant name 'CircuitProveAndVerifyResponse' but got '${variantName}'`);
    }
    return apiTypes.toCircuitProveAndVerifyResponse(result);
  }

  async circuitBenchmark(command: apiTypes.CircuitBenchmark): Promise<apiTypes.CircuitBenchmarkResponse> {
    const msgpackCommand = apiTypes.fromCircuitBenchmark(command);
    const [variantName, result] = await this.sendCommand(["CircuitBenchmark", msgpackCommand]);
    if (variantName !== 'CircuitBenchmarkResponse') {
      throw new Error(`Expected variant name 'CircuitBenchmarkResponse' but got '${variantName}'`);
    }
    return apiTypes.toCircuitBenchmarkResponse(result);
  }

  async clientIvcCheckPrecomputedVk(command: apiTypes.ClientIvcCheckPrecomputedVk): Promise<apiTypes.ClientIvcCheckPrecomputedVkResponse> {
    const msgpackCommand = apiTypes.fromClientIvcCheckPrecomputedVk(command);
    const [variantName, result] = await this.sendCommand(["ClientIvcCheckPrecomputedVk", msgpackCommand]);
    if (variantName !== 'ClientIvcCheckPrecomputedVkResponse') {
      throw new Error(`Expected variant name 'ClientIvcCheckPrecomputedVkResponse' but got '${variantName}'`);
    }
    return apiTypes.toClientIvcCheckPrecomputedVkResponse(result);
  }
}
