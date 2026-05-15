/**
 * Generic IPC client over Unix Domain Sockets.
 * Handles: socket connect, length-prefixed framing, msgpack encode/decode.
 * Service-specific typed methods are in the generated wrapper.
 */
import * as net from 'node:net';
import { Decoder, Encoder } from 'msgpackr';

const encoder = new Encoder({ useRecords: false });
const decoder = new Decoder({ useRecords: false });

export class IpcClient {
  private conn: net.Socket;
  private buffer = Buffer.alloc(0);

  private constructor(conn: net.Socket) {
    this.conn = conn;
  }

  static async connect(socketPath: string): Promise<IpcClient> {
    const conn = net.createConnection(socketPath);
    await new Promise<void>((resolve, reject) => {
      conn.on('connect', resolve);
      conn.on('error', reject);
    });
    return new IpcClient(conn);
  }

  close() {
    this.conn.destroy();
  }

  /** Send a command and receive the response. */
  async call(commandName: string, fields: any): Promise<[string, any]> {
    const packed = encoder.pack([[commandName, fields]]);
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32LE(packed.length, 0);
    this.conn.write(lenBuf);
    this.conn.write(packed);

    return new Promise((resolve, reject) => {
      const onData = (data: Buffer) => {
        this.buffer = Buffer.concat([this.buffer, data]);
        if (this.buffer.length >= 4) {
          const len = this.buffer.readUInt32LE(0);
          if (this.buffer.length >= 4 + len) {
            this.conn.removeListener('data', onData);
            const payload = this.buffer.subarray(4, 4 + len);
            this.buffer = this.buffer.subarray(4 + len);
            resolve(decoder.unpack(payload) as [string, any]);
          }
        }
      };
      this.conn.on('data', onData);
      this.conn.on('error', reject);
    });
  }
}
