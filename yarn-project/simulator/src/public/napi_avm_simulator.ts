import { AsyncApi } from '@aztec/bb-avm-sim';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { IpcClientAsync } from '@aztec/ipc-runtime';
import type { InProcessWsdbOptions } from '@aztec/world-state/native';

import { createRequire } from 'node:module';

import type { AvmContractsDBContext, AvmSimulator } from './avm_simulator.js';
import { CdbIpcServer } from './cdb_ipc_server.js';

/** Handle exposed by the avm_inprocess NAPI addon's InProcessAvm class. */
interface InProcessAvmHandle {
  call(request: Buffer): Promise<Buffer>;
  destroy(): void;
}

/**
 * Handle exposed by the avm_inprocess NAPI addon's InProcessWsdb class — owns a WorldState in-process. The
 * same object drives the TS world-state service (wrapped in {@link NapiWsdbBackend}) AND is handed to a
 * co-hosted {@link NapiAvmSimulator} so both share one WorldState.
 */
export interface InProcessWsdbHandle {
  call(request: Buffer): Promise<Buffer>;
  destroy(): void;
}

/** Generic host-call reverse channel: the AVM asks the host for `target`'s data. Matches the wasm shape. */
type OnHostCall = (target: number, req: Buffer) => Promise<Buffer>;

interface InProcessAvmModule {
  // First arg: a wsdb socket path (Slice A/B) or a co-hosted InProcessWsdb (Slice C, shared WorldState).
  // Second arg: a CDB socket path (Slice A) or an onHostCall router (Slice B/C, in-process CDB).
  InProcessAvm: new (
    wsdbPathOrHandle: string | InProcessWsdbHandle,
    cdbPathOrOnHostCall: string | OnHostCall,
  ) => InProcessAvmHandle;
  InProcessWsdb: new (dataDir: string, options: InProcessWsdbOptions) => InProcessWsdbHandle;
}

/** Host-call target id for the contracts-DB service; must match CDB_TARGET in host_call_contract_db.cpp. */
const CDB_TARGET = 0;

/** The CDB reverse-channel router: dispatch the AVM's host_call requests to the socketless CDB server. */
function makeCdbHostCallRouter(cdbServer: CdbIpcServer): OnHostCall {
  return async (target, req) => {
    if (target !== CDB_TARGET) {
      throw new Error(`in-process AVM: unknown host_call target ${target}`);
    }
    return Buffer.from(await cdbServer.handle(req));
  };
}

/**
 * Load the avm_inprocess `.node` addon. Located via `AVM_INPROCESS_NODE` for the
 * spike; a real integration would resolve it like other native binaries (the
 * codegen'd package would build+ship it, given the avm_sim_ffi library path).
 */
function loadAddon(): InProcessAvmModule {
  const modulePath = process.env.AVM_INPROCESS_NODE;
  if (!modulePath) {
    throw new Error('AVM_INPROCESS_NODE must point at avm_inprocess.node to run the AVM in-process');
  }
  return createRequire(import.meta.url)(modulePath) as InProcessAvmModule;
}

/**
 * {@link IpcClientAsync} backend that routes the generated {@link AsyncApi}'s byte frames to the in-process
 * AVM (NAPI) instead of a spawned process's socket. This is what makes the in-process path run *behind the
 * codegen'd AvmService API* rather than as a bespoke entry — the AVM's `call` runs on a worker thread, so the
 * JS event loop stays free to service the CDB socket while a simulation is in flight.
 */
class NapiBackend implements IpcClientAsync {
  constructor(private avm: InProcessAvmHandle) {}

  async call(input: Uint8Array): Promise<Uint8Array> {
    const response = await this.avm.call(Buffer.from(input));
    return new Uint8Array(response);
  }

  destroy(): Promise<void> {
    this.avm.destroy();
    return Promise.resolve();
  }
}

/**
 * Create an in-process world state (a co-hostable {@link InProcessWsdbHandle}) via the avm_inprocess addon.
 * Pass the returned handle to `NativeWorldStateService.fromWsdbBackend` (wrapped in {@link NapiWsdbBackend}) for
 * the TS world-state service, and to {@link NapiAvmSimulator.spawnCoHosted} for the AVM — both then share the
 * one WorldState. Config (tree heights/prefill/map sizes/genesis) is built by `buildInProcessWsdbOptions`.
 */
export function createInProcessWsdb(dataDir: string, options: InProcessWsdbOptions): InProcessWsdbHandle {
  const { InProcessWsdb } = loadAddon();
  return new InProcessWsdb(dataDir, options);
}

/**
 * {@link IpcClientAsync} backend routing the generated wsdb {@link AsyncApi}'s byte frames to an in-process
 * {@link InProcessWsdbHandle} (NAPI) instead of a spawned aztec-wsdb process's socket.
 */
export class NapiWsdbBackend implements IpcClientAsync {
  constructor(private wsdb: InProcessWsdbHandle) {}

  async call(input: Uint8Array): Promise<Uint8Array> {
    const response = await this.wsdb.call(Buffer.from(input));
    return new Uint8Array(response);
  }

  destroy(): Promise<void> {
    this.wsdb.destroy();
    return Promise.resolve();
  }
}

/**
 * An {@link AvmSimulator} that runs the AVM IN-PROCESS via the avm_inprocess NAPI addon, instead of a pool of
 * bb-avm-sim subprocesses. Sibling of {@link AvmSimulatorPool}: it owns the same CDB reverse channel (the
 * {@link CdbIpcServer} dispatch + per-simulate fork registration) and drives the generated `AvmService`.
 * Slice B: the AVM reaches contract data via a `host_call` straight into this process (no CDB socket) — the
 * CDB server runs socketless and its dispatch is invoked through the host-call router. World state is still
 * out-of-process (reached over its socket). Downstream holds the {@link AvmSimulator} interface, unaffected.
 */
export class NapiAvmSimulator implements AvmSimulator {
  private log: Logger;

  private constructor(
    private service: AsyncApi,
    private cdbServer: CdbIpcServer,
  ) {
    this.log = createLogger('simulator:napi-avm');
  }

  // Async factory for API symmetry with AvmSimulatorPool.spawn, though the socketless in-process setup
  // needs no await (nothing to wait for — the AVM reaches the CDB via host_call, not a socket to bind).
  static spawn(options: { wsdbIpcPath: string }): Promise<NapiAvmSimulator> {
    const { InProcessAvm } = loadAddon();
    // Socketless CDB: the in-process AVM reaches it via host_call, not a socket.
    const cdbServer = new CdbIpcServer(/*listenSocket=*/ false);
    const avm = new InProcessAvm(options.wsdbIpcPath, makeCdbHostCallRouter(cdbServer));
    const service = new AsyncApi(new NapiBackend(avm));
    return Promise.resolve(new NapiAvmSimulator(service, cdbServer));
  }

  /**
   * Slice C: co-host the AVM against an already-created in-process {@link InProcessWsdbHandle}, so the AVM and
   * the TS world-state service share ONE WorldState with no child processes at all. World-state reads go
   * C++<->C++ into the shared handle; contract data still comes via the host_call CDB. The caller owns the
   * wsdb handle and must dispose this simulator BEFORE destroying it (the AVM borrows the handle).
   */
  static spawnCoHosted(options: { inProcessWsdb: InProcessWsdbHandle }): Promise<NapiAvmSimulator> {
    const { InProcessAvm } = loadAddon();
    const cdbServer = new CdbIpcServer(/*listenSocket=*/ false);
    const avm = new InProcessAvm(options.inProcessWsdb, makeCdbHostCallRouter(cdbServer));
    const service = new AsyncApi(new NapiBackend(avm));
    return Promise.resolve(new NapiAvmSimulator(service, cdbServer));
  }

  async simulate(inputBuffer: Uint8Array, context: AvmContractsDBContext, _signal?: AbortSignal): Promise<Uint8Array> {
    // Register the fork's contracts DB so the AVM's CDB callbacks route to it, for the duration of the call.
    this.cdbServer.registerFork(context.forkId, context.contractsDB, context.timestamp);
    try {
      return (await this.service.simulate({ inputs: inputBuffer })).result;
    } finally {
      this.cdbServer.unregisterFork(context.forkId);
    }
  }

  simulateWithHints(inputBuffer: Uint8Array): Promise<Uint8Array> {
    return this.service.simulateWithHints({ inputs: inputBuffer }).then(r => r.result);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.service.destroy();
    await this.cdbServer.close();
  }
}
