/**
 * TypeScript UDS server implementing the CDB IPC protocol.
 *
 * Replaces the C++ aztec-cdb binary. The C++ AVM connects to this server
 * via the same socket protocol (4-byte LE length prefix + msgpack).
 * Requests are routed to a PublicContractsDB instance.
 */
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

/** Convert a Fr/AztecAddress to a 32-byte Buffer. */
function toFieldBuffer(field: Fr | AztecAddress): Buffer {
  return field.toBuffer();
}

/**
 * Serialize a ContractInstanceWithAddress to the format expected by the C++ CDB client.
 * Matches the avm2::ContractInstance msgpack schema.
 */
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

/**
 * Serialize a ContractClassPublic to the format expected by the C++ CDB client.
 * Matches the avm2::ContractClass msgpack schema.
 */
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
 * Multiple C++ AVM processes connect as clients. Requests are routed to the
 * correct PublicContractsDB instance using the forkId field in each command.
 */
export class CdbIpcServer {
  public readonly socketPath: string;
  private server: net.Server;
  private log: Logger;
  /** Maps WSDB fork ID → (contracts DB, timestamp) for routing concurrent simulations. */
  private forks = new Map<number, { db: PublicContractsDB; timestamp: bigint }>();
  private connections = new Set<net.Socket>();

  constructor() {
    this.log = createLogger('cdb-ipc-server');
    this.socketPath = path.join(os.tmpdir(), `cdb-ts-${process.pid}-${Date.now()}.sock`);

    // Clean up stale socket file
    if (fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }

    this.server = net.createServer(socket => this.handleConnection(socket));
    this.server.listen(this.socketPath, () => {
      this.log.debug(`CDB IPC server listening on ${this.socketPath}`);
    });
  }

  /** Register a PublicContractsDB for a given WSDB fork ID. */
  registerFork(forkId: number, contractsDB: PublicContractsDB, timestamp: bigint): void {
    this.forks.set(forkId, { db: contractsDB, timestamp });
  }

  /** Unregister a fork's contracts DB (call after simulation completes). */
  unregisterFork(forkId: number): void {
    this.forks.delete(forkId);
  }

  /** Close the server and all active connections. */
  close(): Promise<void> {
    // Destroy all active client connections so the server can close cleanly.
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

  private handleConnection(socket: net.Socket) {
    this.log.debug('C++ AVM connected to CDB server');
    this.connections.add(socket);
    socket.on('close', () => this.connections.delete(socket));

    // State machine for reading length-prefixed messages
    let readingLength = true;
    const lengthBuffer = Buffer.alloc(4);
    let lengthBytesRead = 0;
    let messageLength = 0;
    let messageBuffer: Buffer | null = null;
    let messageBytesRead = 0;

    // Per-connection response chain ensures responses are sent in the same order
    // as requests were received, even if dispatch completes out of order.
    // This makes the server robust to pipelined requests from the C++ client.
    let responseChain: Promise<void> = Promise.resolve();

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

            // Start dispatch immediately (allows concurrent processing),
            // but chain the response sending to preserve request order.
            const dispatchResult = this.dispatchMessage(msg);
            const prev = responseChain;
            responseChain = (async () => {
              await prev;
              try {
                const [name, payload] = await dispatchResult;
                this.sendResponse(socket, name, payload);
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

  private dispatchMessage(data: Buffer): Promise<[string, Record<string, unknown>]> {
    const parsed = decoder.decode(data);
    const [commandName, payload] = parsed[0];
    return this.dispatch(commandName, payload ?? {});
  }

  private sendResponse(socket: net.Socket, responseName: string, payload: Record<string, unknown>): void {
    const response = encoder.encode([responseName, payload]);
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32LE(response.length, 0);
    socket.write(lengthBuf);
    socket.write(response);
  }

  /** Look up the contracts DB for a given fork ID, throwing if not registered. */
  private getFork(forkId: number): { db: PublicContractsDB; timestamp: bigint } {
    const fork = this.forks.get(forkId);
    if (!fork) {
      throw new Error(`CDB server: no contracts DB registered for forkId ${forkId}`);
    }
    return fork;
  }

  private async dispatch(
    commandName: string,
    payload: Record<string, any>,
  ): Promise<[string, Record<string, unknown>]> {
    // All simulation commands carry a forkId for routing.
    const forkId: number = payload.forkId ?? 0;

    switch (commandName) {
      case 'CdbGetContractInstance': {
        const { db, timestamp } = this.getFork(forkId);
        const address = AztecAddress.fromBuffer(payload.address);
        const instance = await db.getContractInstance(address, timestamp);
        return ['CdbGetContractInstanceResponse', { instance: instance ? serializeContractInstance(instance) : null }];
      }

      case 'CdbGetContractClass': {
        const { db } = this.getFork(forkId);
        const classId = Fr.fromBuffer(payload.classId);
        const contractClass = await db.getContractClass(classId);
        return [
          'CdbGetContractClassResponse',
          { contractClass: contractClass ? serializeContractClass(contractClass) : null },
        ];
      }

      case 'CdbGetBytecodeCommitment': {
        const { db } = this.getFork(forkId);
        const classId = Fr.fromBuffer(payload.classId);
        const commitment = await db.getBytecodeCommitment(classId);
        return ['CdbGetBytecodeCommitmentResponse', { commitment: commitment ? toFieldBuffer(commitment) : null }];
      }

      case 'CdbGetDebugFunctionName': {
        const { db } = this.getFork(forkId);
        const address = AztecAddress.fromBuffer(payload.address);
        const selectorField = Fr.fromBuffer(payload.selector);
        const selector = FunctionSelector.fromFieldOrUndefined(selectorField);
        const name = selector ? await db.getDebugFunctionName(address, selector) : undefined;
        return ['CdbGetDebugFunctionNameResponse', { name: name ?? null }];
      }

      case 'CdbAddContracts': {
        const { db } = this.getFork(forkId);
        const contractDeploymentData = ContractDeploymentData.fromPlainObject(payload.contractDeploymentData);
        // PublicContractsDB API was split: addContracts() takes typed
        // ContractInstanceWithAddress[]; addContractsFromLogs() takes the
        // ContractDeploymentData wrapper and parses the logs internally.
        db.addContractsFromLogs(contractDeploymentData);
        return ['CdbAddContractsResponse', {}];
      }

      case 'CdbCreateCheckpoint': {
        const { db } = this.getFork(forkId);
        db.createCheckpoint();
        return ['CdbCreateCheckpointResponse', {}];
      }

      case 'CdbCommitCheckpoint': {
        const { db } = this.getFork(forkId);
        db.commitCheckpoint();
        return ['CdbCommitCheckpointResponse', {}];
      }

      case 'CdbRevertCheckpoint': {
        const { db } = this.getFork(forkId);
        db.revertCheckpoint();
        return ['CdbRevertCheckpointResponse', {}];
      }

      case 'CdbShutdown': {
        return ['CdbShutdownResponse', {}];
      }

      default:
        throw new Error(`Unknown CDB command: ${commandName}`);
    }
  }
}
