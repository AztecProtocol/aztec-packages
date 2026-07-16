/**
 * UDS server for AVM CDB requests.
 *
 * Transport (socket, framing, per-connection response ordering) is handled by the shared
 * `UdsIpcServer` from `@aztec/ipc-runtime`; message dispatch comes from the generated CDB
 * server. This class only implements the generated handler interface and routes requests to
 * PublicContractsDB instances by fork ID.
 */
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { UdsIpcServer } from '@aztec/ipc-runtime';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { ContractDeploymentData, type ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import { Decoder, Encoder } from 'msgpackr';
import * as os from 'node:os';
import * as path from 'node:path';
import { threadId } from 'node:worker_threads';

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
} from './cdb/generated/api_types.js';
import { type Handler as CdbHandler, handleRequest } from './cdb/generated/server.js';
import type { PublicContractsDB } from './public_db_sources.js';

const encoder = new Encoder({ useRecords: false });
const decoder = new Decoder({ useRecords: false });

let instanceCounter = 0;

function toFieldBuffer(field: Fr | AztecAddress): Buffer {
  return field.toBuffer();
}

/** Serializes contract instances to the AVM CDB wire shape. */
export function serializeContractInstance(instance: ContractInstanceWithAddress): Record<string, unknown> {
  return {
    salt: toFieldBuffer(instance.salt),
    deployer: toFieldBuffer(instance.deployer),
    currentContractClassId: toFieldBuffer(instance.currentContractClassId),
    originalContractClassId: toFieldBuffer(instance.originalContractClassId),
    initializationHash: toFieldBuffer(instance.initializationHash),
    immutablesHash: toFieldBuffer(instance.immutablesHash),
    publicKeys: {
      npkMHash: toFieldBuffer(instance.publicKeys.npkMHash),
      ivpkM: {
        x: toFieldBuffer(instance.publicKeys.ivpkM.x),
        y: toFieldBuffer(instance.publicKeys.ivpkM.y),
      },
      ovpkMHash: toFieldBuffer(instance.publicKeys.ovpkMHash),
      tpkMHash: toFieldBuffer(instance.publicKeys.tpkMHash),
      mspkMHash: toFieldBuffer(instance.publicKeys.mspkMHash),
      fbpkMHash: toFieldBuffer(instance.publicKeys.fbpkMHash),
    },
  };
}

/** Serializes contract classes to the AVM CDB wire shape. */
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

/** Routes AVM CDB requests to registered PublicContractsDB forks. */
export class CdbIpcServer implements CdbHandler {
  public readonly ipcPath: string;
  /** The UDS server, or undefined for an in-process (host-call) CDB that needs no socket. */
  private server?: Promise<UdsIpcServer>;
  private log: Logger;
  /** Maps WSDB fork IDs to contracts DB/timestamp pairs for concurrent simulations. */
  private forks = new Map<number, { db: PublicContractsDB; timestamp: bigint }>();

  /**
   * @param listenSocket - When true (default, out-of-process AVM), listen on a UDS socket the C++ AVM
   *   connects to. When false (in-process AVM), skip the socket: requests arrive via {@link handle}, driven
   *   by the host-call reverse channel. Either way this object is the CDB dispatch handler.
   */
  constructor(listenSocket = true) {
    this.log = createLogger('cdb-ipc-server');
    this.ipcPath = path.join(os.tmpdir(), `cdb-ts-${process.pid}-${threadId}-${instanceCounter++}.sock`);

    if (listenSocket) {
      // Listen asynchronously; the C++ AVM retries connecting until the socket is up.
      this.server = UdsIpcServer.listen(this.ipcPath, (_clientId, request) => handleRequest(this, request));
      this.server.then(
        () => this.log.debug(`CDB IPC server listening on ${this.ipcPath}`),
        err => this.log.error(`CDB IPC server failed to listen on ${this.ipcPath}`, { err }),
      );
    }
  }

  /**
   * Dispatch one CDB request frame directly (no socket) and return the response frame. This is the
   * host-call entry point for an in-process AVM: the same generated dispatch the socket server runs.
   */
  handle(request: Uint8Array): Promise<Uint8Array> {
    return handleRequest(this, request);
  }

  /** Register a PublicContractsDB for a given WSDB fork ID. */
  registerFork(forkId: number, contractsDB: PublicContractsDB, timestamp: bigint): void {
    this.forks.set(forkId, { db: contractsDB, timestamp });
  }

  /** Unregister a fork's contracts DB (call after simulation completes). */
  unregisterFork(forkId: number): void {
    this.forks.delete(forkId);
  }

  /**
   * Resolves once the server socket is bound and accepting connections. An
   * in-process AVM connects synchronously at construction, so it must await this
   * first — otherwise the connect races the (event-loop-driven) listen.
   */
  async ready(): Promise<void> {
    await this.server;
  }

  /** Close the server and all active connections (no-op for a socketless in-process CDB). */
  async close(): Promise<void> {
    const server = await this.server?.catch(() => undefined);
    await server?.close();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  /** Look up the contracts DB for a given fork ID, throwing if not registered. */
  private getFork(forkId: number): { db: PublicContractsDB; timestamp: bigint } {
    const fork = this.forks.get(forkId);
    if (!fork) {
      const registered = Array.from(this.forks.keys()).sort((a, b) => a - b);
      throw new Error(
        `CDB server: no contracts DB registered for forkId ${forkId} (registered=[${registered.join(',')}])`,
      );
    }
    return fork;
  }

  async getContractInstance(command: CdbGetContractInstance): Promise<CdbGetContractInstanceResponse> {
    const { db, timestamp } = this.getFork(command.forkId);
    const address = AztecAddress.fromBuffer(Buffer.from(command.address));
    const instance = await db.getContractInstance(address, timestamp);
    return { instance: instance ? encoder.encode(serializeContractInstance(instance)) : null };
  }

  async getContractClass(command: CdbGetContractClass): Promise<CdbGetContractClassResponse> {
    const { db } = this.getFork(command.forkId);
    const classId = Fr.fromBuffer(Buffer.from(command.classId));
    const contractClass = await db.getContractClass(classId);
    return { contractClass: contractClass ? encoder.encode(serializeContractClass(contractClass)) : null };
  }

  async getBytecodeCommitment(command: CdbGetBytecodeCommitment): Promise<CdbGetBytecodeCommitmentResponse> {
    const { db } = this.getFork(command.forkId);
    const classId = Fr.fromBuffer(Buffer.from(command.classId));
    const commitment = await db.getBytecodeCommitment(classId);
    return { commitment: commitment ? toFieldBuffer(commitment) : null };
  }

  async getDebugFunctionName(command: CdbGetDebugFunctionName): Promise<CdbGetDebugFunctionNameResponse> {
    const { db } = this.getFork(command.forkId);
    const address = AztecAddress.fromBuffer(Buffer.from(command.address));
    const selectorField = Fr.fromBuffer(Buffer.from(command.selector));
    const selector = FunctionSelector.fromFieldOrUndefined(selectorField);
    const name = selector ? await db.getDebugFunctionName(address, selector) : undefined;
    return { name: name ?? null };
  }

  addContracts(command: CdbAddContracts): Promise<CdbAddContractsResponse> {
    const { db } = this.getFork(command.forkId);
    const contractDeploymentData = ContractDeploymentData.fromPlainObject(
      decoder.decode(command.contractDeploymentData),
    );
    db.addContractsFromLogs(contractDeploymentData);
    return Promise.resolve({});
  }

  createCheckpoint(command: CdbCreateCheckpoint): Promise<CdbCreateCheckpointResponse> {
    const { db } = this.getFork(command.forkId);
    db.createCheckpoint();
    return Promise.resolve({});
  }

  commitCheckpoint(command: CdbCommitCheckpoint): Promise<CdbCommitCheckpointResponse> {
    const { db } = this.getFork(command.forkId);
    db.commitCheckpoint();
    return Promise.resolve({});
  }

  revertCheckpoint(command: CdbRevertCheckpoint): Promise<CdbRevertCheckpointResponse> {
    const { db } = this.getFork(command.forkId);
    db.revertCheckpoint();
    return Promise.resolve({});
  }
}
