import { ApiCompilerBase } from './api_compiler_base.js';

/**
 * Compiler for generating native API implementation that communicates with bb binary
 */
export class NativeApiCompiler extends ApiCompilerBase {
  constructor() {
    super('async'); // Native API is always async
  }

  protected generateWasmImports(): string[] {
    return [
      `import { spawn, ChildProcess } from 'child_process';`,
      `import { encode } from 'msgpackr';`,
    ];
  }

  protected generateApiClass(): string {
    // Generate the send/receive infrastructure
    const infrastructure = `/**
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
`;

    // Generate API methods
    const methods = this.functionMetadata.map(meta => {
      const commandType = meta.commandType;
      const responseType = meta.responseType;
      const methodName = commandType.charAt(0).toLowerCase() + commandType.slice(1);
      
      return `  async ${methodName}(command: apiTypes.${commandType}): Promise<apiTypes.${responseType}> {
    const msgpackCommand = apiTypes.from${commandType}(command);
    const [variantName, result] = await this.sendCommand(["${commandType}", msgpackCommand]);
    if (variantName !== '${responseType}') {
      throw new Error(\`Expected variant name '${responseType}' but got '\${variantName}'\`);
    }
    return apiTypes.to${responseType}(result);
  }`;
    });

    return infrastructure + '\n' + methods.join('\n\n') + '\n}';
  }
}