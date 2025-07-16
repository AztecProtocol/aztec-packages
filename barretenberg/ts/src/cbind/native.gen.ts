/* eslint-disable */
// GENERATED FILE DO NOT EDIT, RUN yarn generate
import { Buffer } from "buffer";
import { spawn, ChildProcess } from "child_process";
import { Encoder } from "msgpackr";

// Re-export all types and conversion functions from cbind
export * from "./cbind.async.gen.js";

/**
 * Native API wrapper for bb binary using msgpack over stdin/stdout.
 * All methods return promises and handle length-encoded msgpack buffers.
 */
export class NativeApi {
  private process: ChildProcess | null = null;
  private requestId: Uint8Array;
  private closed = false;
  private pendingRequests = new Map<string, { resolve: (value: any) => void; reject: (error: any) => void }>();
  private responseBuffer = Buffer.alloc(0);

  constructor(private bbPath: string = "bb") {
    // Generate a random 16-byte request ID
    this.requestId = new Uint8Array(16);
    crypto.getRandomValues(this.requestId);
  }

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
      for (const { reject } of this.pendingRequests.values()) {
        reject(error);
      }
      this.pendingRequests.clear();
    });

    // Handle stderr
    this.process.stderr?.on("data", (data) => {
      console.error("bb stderr:", data.toString());
    });

    // Handle stdout responses
    this.process.stdout?.on("data", (data) => {
      this.responseBuffer = Buffer.concat([this.responseBuffer, data]);
      this.processResponses();
    });

    // Handle errors
    this.process.on("error", (error) => {
      this.closed = true;
      for (const { reject } of this.pendingRequests.values()) {
        reject(error);
      }
      this.pendingRequests.clear();
    });
  }

  /**
   * Process length-encoded responses from the buffer
   */
  private processResponses(): void {
    while (this.responseBuffer.length >= 4) {
      // Read 4-byte length prefix (little-endian)
      const length = this.responseBuffer.readUInt32LE(0);
      
      if (this.responseBuffer.length < 4 + length) {
        // Not enough data yet
        break;
      }

      // Extract the msgpack response
      const responseData = this.responseBuffer.slice(4, 4 + length);
      this.responseBuffer = this.responseBuffer.slice(4 + length);

      // Decode the response
      try {
        const encoder = new Encoder({ useRecords: false });
        const response = encoder.unpack(responseData);
        
        // For now, we resolve the oldest pending request
        // In a more sophisticated implementation, we'd match request IDs
        const [requestKey, pending] = this.pendingRequests.entries().next().value;
        if (pending) {
          this.pendingRequests.delete(requestKey);
          pending.resolve(response);
        }
      } catch (error) {
        console.error("Error decoding response:", error);
      }
    }
  }

  /**
   * Send a command to the bb process
   */
  private async sendCommand(command: any[]): Promise<any> {
    if (this.closed || !this.process?.stdin) {
      throw new Error("NativeApi is not initialized or has been closed");
    }

    // Create a unique key for this request
    const requestKey = Math.random().toString(36);

    // Create the promise for this request
    const promise = new Promise((resolve, reject) => {
      this.pendingRequests.set(requestKey, { resolve, reject });
    });

    // Encode the command with request ID
    const encoder = new Encoder({ useRecords: false });
    const buffer = encoder.encode([this.requestId, command]);

    // Write length-encoded buffer
    const lengthBuffer = Buffer.allocUnsafe(4);
    lengthBuffer.writeUInt32LE(buffer.length, 0);
    
    this.process.stdin.write(lengthBuffer);
    this.process.stdin.write(buffer);

    return promise;
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

  // Generate API methods dynamically
  // These will be filled in by the generator based on the schema
  // For now, let's add a few example methods that match the cbind API

  async circuitProve(command: any): Promise<any> {
    const msgpackCommand = (globalThis as any).fromCircuitProve(command);
    const [variantName, result] = await this.sendCommand(["CircuitProve", msgpackCommand]);
    if (variantName !== "CircuitProveResponse") {
      throw new Error(`Expected variant name 'CircuitProveResponse' but got '${variantName}'`);
    }
    return (globalThis as any).toCircuitProveResponse(result);
  }

  async circuitVerify(command: any): Promise<any> {
    const msgpackCommand = (globalThis as any).fromCircuitVerify(command);
    const [variantName, result] = await this.sendCommand(["CircuitVerify", msgpackCommand]);
    if (variantName !== "CircuitVerifyResponse") {
      throw new Error(`Expected variant name 'CircuitVerifyResponse' but got '${variantName}'`);
    }
    return (globalThis as any).toCircuitVerifyResponse(result);
  }

  // Add more methods as needed...
}