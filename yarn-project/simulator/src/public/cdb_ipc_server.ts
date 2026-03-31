/**
 * TypeScript UDS server implementing the CDB IPC protocol.
 *
 * Uses GENERATED types and dispatch from the codegen tool.
 * The C++ AVM connects to this server via the same socket protocol
 * (4-byte LE length prefix + msgpack).
 */
import { type CdbHandler, cdbDispatch } from '@aztec/bb.js/aztec-cdb';
import type {
  CdbAddContracts,
  CdbAddContractsResponse,
  CdbCommitCheckpoint,
  CdbCommitCheckpointResponse,
  CdbCreateCheckpoint,
  CdbCreateCheckpointResponse,
  CdbGetBytecodeCommitment,
  CdbGetBytecodeCommitmentResponse,
  CdbGetContractClass,
  CdbGetContractClassResponse,
  CdbGetContractInstance,
  CdbGetContractInstanceResponse,
  CdbGetDebugFunctionName,
  CdbGetDebugFunctionNameResponse,
  CdbRevertCheckpoint,
  CdbRevertCheckpointResponse,
} from '@aztec/bb.js/aztec-cdb';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { ContractDeploymentData } from '@aztec/stdlib/contract';

import { Decoder, Encoder } from 'msgpackr';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

import type { PublicContractsDB } from './public_db_sources.js';

const encoder = new Encoder({ useRecords: false });
const decoder = new Decoder({ useRecords: false });

/** Convert a Fr/AztecAddress to a 32-byte Buffer for the wire format. */
function toFieldBuffer(field: Fr | AztecAddress): Buffer {
  return field.toBuffer();
}

/** Serialize a ContractInstanceWithAddress to the CDB wire format. */
function serializeContractInstance(instance: {
  salt: Fr;
  deployer: AztecAddress;
  currentContractClassId: Fr;
  originalContractClassId: Fr;
  initializationHash: Fr;
  publicKeys: {
    masterNullifierPublicKey: { x: Fr; y: Fr };
    masterIncomingViewingPublicKey: { x: Fr; y: Fr };
    masterOutgoingViewingPublicKey: { x: Fr; y: Fr };
    masterTaggingPublicKey: { x: Fr; y: Fr };
  };
}): Record<string, unknown> {
  return {
    salt: toFieldBuffer(instance.salt),
    deployer: toFieldBuffer(instance.deployer),
    currentContractClassId: toFieldBuffer(instance.currentContractClassId),
    originalContractClassId: toFieldBuffer(instance.originalContractClassId),
    initializationHash: toFieldBuffer(instance.initializationHash),
    publicKeys: {
      masterNullifierPublicKey: {
        x: toFieldBuffer(instance.publicKeys.masterNullifierPublicKey.x),
        y: toFieldBuffer(instance.publicKeys.masterNullifierPublicKey.y),
      },
      masterIncomingViewingPublicKey: {
        x: toFieldBuffer(instance.publicKeys.masterIncomingViewingPublicKey.x),
        y: toFieldBuffer(instance.publicKeys.masterIncomingViewingPublicKey.y),
      },
      masterOutgoingViewingPublicKey: {
        x: toFieldBuffer(instance.publicKeys.masterOutgoingViewingPublicKey.x),
        y: toFieldBuffer(instance.publicKeys.masterOutgoingViewingPublicKey.y),
      },
      masterTaggingPublicKey: {
        x: toFieldBuffer(instance.publicKeys.masterTaggingPublicKey.x),
        y: toFieldBuffer(instance.publicKeys.masterTaggingPublicKey.y),
      },
    },
  };
}

/** Serialize a ContractClassPublic to the CDB wire format. */
function serializeContractClass(contractClass: {
  id: Fr;
  artifactHash: Fr;
  privateFunctionsRoot: Fr;
  packedBytecode: Buffer;
}): Record<string, unknown> {
  return {
    id: toFieldBuffer(contractClass.id),
    artifactHash: toFieldBuffer(contractClass.artifactHash),
    privateFunctionsRoot: toFieldBuffer(contractClass.privateFunctionsRoot),
    packedBytecode: contractClass.packedBytecode,
  };
}

/**
 * TS UDS server implementing the CDB IPC protocol.
 * Uses generated dispatch from the codegen tool.
 */
export class CdbIpcServer {
  public readonly socketPath: string;
  private server: net.Server;
  private log: Logger;
  private forks = new Map<number, { db: PublicContractsDB; timestamp: bigint }>();
  private connections = new Set<net.Socket>();

  constructor() {
    this.log = createLogger('cdb-ipc-server');
    this.socketPath = path.join(os.tmpdir(), `cdb-ts-${process.pid}-${Date.now()}.sock`);

    if (fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }

    this.server = net.createServer(socket => this.handleConnection(socket));
    this.server.listen(this.socketPath, () => {
      this.log.debug(`CDB IPC server listening on ${this.socketPath}`);
    });
  }

  registerFork(forkId: number, contractsDB: PublicContractsDB, timestamp: bigint): void {
    this.forks.set(forkId, { db: contractsDB, timestamp });
  }

  unregisterFork(forkId: number): void {
    this.forks.delete(forkId);
  }

  close(): Promise<void> {
    for (const socket of this.connections) {
      socket.destroy();
    }
    this.connections.clear();

    return new Promise<void>(resolve => {
      this.server.close(() => {
        try {
          if (fs.existsSync(this.socketPath)) {
            fs.unlinkSync(this.socketPath);
          }
        } catch {
          // Ignore cleanup errors
        }
        resolve();
      });
    });
  }

  private getFork(forkId: number): { db: PublicContractsDB; timestamp: bigint } {
    const fork = this.forks.get(forkId);
    if (!fork) {
      throw new Error(`CDB server: no contracts DB registered for forkId ${forkId}`);
    }
    return fork;
  }

  /**
   * Build the GENERATED Handler implementation.
   * Each method converts between yarn-project domain types and the IPC wire format.
   */
  private buildHandler(): CdbHandler {
    return {
      cdbGetContractInstance: async (cmd: CdbGetContractInstance): Promise<CdbGetContractInstanceResponse> => {
        const { db, timestamp } = this.getFork(cmd.forkId);
        const address = AztecAddress.fromBuffer(Buffer.from(cmd.address));
        const instance = await db.getContractInstance(address, timestamp);
        return { instance: instance ? serializeContractInstance(instance) : null } as any;
      },

      cdbGetContractClass: async (cmd: CdbGetContractClass): Promise<CdbGetContractClassResponse> => {
        const { db } = this.getFork(cmd.forkId);
        const classId = Fr.fromBuffer(Buffer.from(cmd.classId));
        const contractClass = await db.getContractClass(classId);
        return { contractClass: contractClass ? serializeContractClass(contractClass) : null } as any;
      },

      cdbGetBytecodeCommitment: async (cmd: CdbGetBytecodeCommitment): Promise<CdbGetBytecodeCommitmentResponse> => {
        const { db } = this.getFork(cmd.forkId);
        const classId = Fr.fromBuffer(Buffer.from(cmd.classId));
        const commitment = await db.getBytecodeCommitment(classId);
        return { commitment: commitment ? toFieldBuffer(commitment) : null } as any;
      },

      cdbGetDebugFunctionName: async (cmd: CdbGetDebugFunctionName): Promise<CdbGetDebugFunctionNameResponse> => {
        const { db } = this.getFork(cmd.forkId);
        const address = AztecAddress.fromBuffer(Buffer.from(cmd.address));
        const selectorField = Fr.fromBuffer(Buffer.from(cmd.selector));
        const selector = FunctionSelector.fromFieldOrUndefined(selectorField);
        const name = selector ? await db.getDebugFunctionName(address, selector) : undefined;
        return { name: name ?? null } as any;
      },

      cdbAddContracts: async (cmd: CdbAddContracts): Promise<CdbAddContractsResponse> => {
        const { db } = this.getFork(cmd.forkId);
        const data = ContractDeploymentData.fromPlainObject(cmd.contractDeploymentData);
        db.addContracts(data);
        return {} as any;
      },

      cdbCreateCheckpoint: async (cmd: CdbCreateCheckpoint): Promise<CdbCreateCheckpointResponse> => {
        const { db } = this.getFork(cmd.forkId);
        db.createCheckpoint();
        return {} as any;
      },

      cdbCommitCheckpoint: async (cmd: CdbCommitCheckpoint): Promise<CdbCommitCheckpointResponse> => {
        const { db } = this.getFork(cmd.forkId);
        db.commitCheckpoint();
        return {} as any;
      },

      cdbRevertCheckpoint: async (cmd: CdbRevertCheckpoint): Promise<CdbRevertCheckpointResponse> => {
        const { db } = this.getFork(cmd.forkId);
        db.revertCheckpoint();
        return {} as any;
      },

      // These additional commands may exist in the schema but aren't used by this server.
      // Provide no-op implementations.
      cdbAddContractClass: async () => ({}) as any,
      cdbAddContractInstance: async () => ({}) as any,
      cdbRegisterFunctionSignatures: async () => ({}) as any,
      cdbGetContractClassIds: async () => ({ classIds: [] }) as any,
    };
  }

  private handleConnection(socket: net.Socket) {
    this.log.debug('C++ AVM connected to CDB server');
    this.connections.add(socket);
    socket.on('close', () => this.connections.delete(socket));

    let readingLength = true;
    const lengthBuffer = Buffer.alloc(4);
    let lengthBytesRead = 0;
    let messageLength = 0;
    let messageBuffer: Buffer | null = null;
    let messageBytesRead = 0;
    let responseChain: Promise<void> = Promise.resolve();

    const handler = this.buildHandler();

    socket.on('data', (chunk: Buffer) => {
      let offset = 0;

      while (offset < chunk.length) {
        if (readingLength) {
          const bytesNeeded = 4 - lengthBytesRead;
          const bytesToCopy = Math.min(bytesNeeded, chunk.length - offset);
          chunk.copy(lengthBuffer, lengthBytesRead, offset, offset + bytesToCopy);
          lengthBytesRead += bytesToCopy;
          offset += bytesToCopy;

          if (lengthBytesRead === 4) {
            messageLength = lengthBuffer.readUInt32LE(0);
            messageBuffer = Buffer.alloc(messageLength);
            messageBytesRead = 0;
            readingLength = false;
          }
        } else {
          const bytesNeeded = messageLength - messageBytesRead;
          const bytesToCopy = Math.min(bytesNeeded, chunk.length - offset);
          chunk.copy(messageBuffer!, messageBytesRead, offset, offset + bytesToCopy);
          messageBytesRead += bytesToCopy;
          offset += bytesToCopy;

          if (messageBytesRead === messageLength) {
            const msg = messageBuffer!;
            readingLength = true;
            lengthBytesRead = 0;
            messageBuffer = null;

            // Decode msgpack: [[commandName, payload]]
            const parsed = decoder.decode(msg);
            const [commandName, payload] = parsed[0];

            // Handle shutdown inline (not part of generated Handler)
            if (commandName === 'CdbShutdown') {
              this.sendResponse(socket, 'CdbShutdownResponse', {});
              continue;
            }

            // Use GENERATED dispatch function
            const dispatchResult = cdbDispatch(handler, commandName, payload ?? {});
            const prev = responseChain;
            responseChain = (async () => {
              await prev;
              try {
                const [name, respPayload] = await dispatchResult;
                this.sendResponse(socket, name, respPayload);
              } catch (err: any) {
                this.log.error(`CDB command error: ${err.message}`, { err });
                this.sendResponse(socket, 'CdbErrorResponse', { message: err.message ?? 'Unknown error' });
              }
            })();
            void responseChain.catch(() => {});
          }
        }
      }
    });

    socket.on('error', (err: Error) => {
      this.log.warn('CDB IPC socket error', { err });
    });
  }

  private sendResponse(socket: net.Socket, responseName: string, payload: Record<string, unknown>): void {
    const response = encoder.encode([responseName, payload]);
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32LE(response.length, 0);
    socket.write(lengthBuf);
    socket.write(response);
  }
}
