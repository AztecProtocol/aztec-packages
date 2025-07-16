import { MsgpackSchemaCompiler } from './msgpack_schema_compiler.js';

/**
 * Compiler for generating NativeApi TypeScript code from msgpack schemas.
 * This extends MsgpackSchemaCompiler to generate a class that uses bb binary via stdin/stdout.
 */
export class NativeCompiler extends MsgpackSchemaCompiler {
  constructor() {
    super('async'); // Native API is always async
  }

  /**
   * Generate the NativeApi class
   */
  private generateNativeApiClass(): string {
    let classContent = `/**
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
      const error = new Error(\`bb process exited with code \${code} and signal \${signal}\`);
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

    // Handle stdout responses
    this.process.stdout?.on("data", (data) => {
      this.responseBuffer = Buffer.concat([this.responseBuffer, data]);
      this.processResponses();
    });

    // Handle errors
    this.process.on("error", (error) => {
      this.closed = true;
      for (const { reject } of this.pendingRequests) {
        reject(error);
      }
      this.pendingRequests = [];
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
      const responseData = this.responseBuffer.subarray(4, 4 + length);
      this.responseBuffer = this.responseBuffer.subarray(4 + length);

      // Decode the response
      try {
        const response = decode(responseData);
        
        // Resolve the oldest pending request (FIFO queue)
        const pending = this.pendingRequests.shift();
        if (pending) {
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

    // Create placeholders that will error if called before being replaced
    let resolveFunc: (value: any) => void = () => { throw new Error("Response not yet received"); };
    let rejectFunc: (error: any) => void = () => { throw new Error("Response not yet received"); };

    // Create the promise and immediately push to queue
    const promise = new Promise((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });
    
    // Push to queue with the actual resolve/reject functions
    this.pendingRequests.push({ resolve: resolveFunc, reject: rejectFunc });

    // Encode the command
    const encoder = new Encoder({ useRecords: false });
    const buffer = encoder.encode(command);

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
`;

    // Generate methods for each function
    for (const func of this.functionMetadata) {
      classContent += `
  async ${func.name}(command: ${func.commandType}): Promise<${func.responseType}> {
    const msgpackCommand = from${func.commandType}(command);
    const [variantName, result] = await this.sendCommand(["${func.commandType.replace(/^Circuit|^ClientIvc|^ProofAsFields|^VkAsFields/, '')}", msgpackCommand]);
    if (variantName !== '${func.responseType}') {
      throw new Error(\`Expected variant name '${func.responseType}' but got '\${variantName}'\`);
    }
    return to${func.responseType}(result);
  }
`;
    }

    classContent += '}';
    return classContent;
  }

  /**
   * Override compile to generate NativeApi specific code
   */
  compile(): string {
    const outputs: string[] = [
      `/* eslint-disable */
// GENERATED FILE DO NOT EDIT, RUN yarn generate
import { Buffer } from "buffer";
import { spawn, ChildProcess } from "child_process";
import { Encoder, decode } from "msgpackr";

// Helper type for fixed-size arrays
type Tuple<T, N extends number> = T[] & { length: N };

// Helper function for mapping tuples
function mapTuple<T, U, N extends number>(tuple: Tuple<T, N>, fn: (item: T) => U): Tuple<U, N> {
  return tuple.map(fn) as Tuple<U, N>;
}
`,
    ];
    
    // Generate Fr type if needed
    if (this.typeInfos['Fr']) {
      outputs.push(`
// Field element type
export type Fr = Buffer;
`);
    }
    
    // Generate all type declarations and converters
    for (const typeInfo of Object.values(this.typeInfos)) {
      if (typeInfo.declaration) {
        // Only output exported declarations (non-msgpack interfaces)
        if (typeInfo.declaration.startsWith('export interface')) {
          outputs.push(typeInfo.declaration);
        } else {
          // For internal interfaces, output without export
          outputs.push(typeInfo.declaration);
        }
      }
      if (typeInfo.toClassMethod) {
        // Remove export from converter functions
        outputs.push(typeInfo.toClassMethod.replace(/^export function/, 'function'));
      }
      if (typeInfo.fromClassMethod) {
        // Remove export from converter functions
        outputs.push(typeInfo.fromClassMethod.replace(/^export function/, 'function'));
      }
    }
    outputs.push('\n');
    
    // Add the NativeApi class
    outputs.push(this.generateNativeApiClass());
    
    return outputs.join('\n');
  }
}