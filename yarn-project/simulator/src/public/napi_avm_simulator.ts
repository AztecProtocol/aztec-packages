import { AsyncApi } from '@aztec/bb-avm-sim';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { IpcClientAsync } from '@aztec/ipc-runtime';

import { createRequire } from 'node:module';

import type { AvmContractsDBContext, AvmSimulator } from './avm_simulator.js';
import { CdbIpcServer } from './cdb_ipc_server.js';

/** Handle exposed by the avm_inprocess NAPI addon. */
interface InProcessAvmHandle {
  call(request: Buffer): Promise<Buffer>;
  destroy(): void;
}

/** Generic host-call reverse channel: the AVM asks the host for `target`'s data. Matches the wasm shape. */
type OnHostCall = (target: number, req: Buffer) => Promise<Buffer>;

interface InProcessAvmModule {
  // Second arg: a CDB socket path (Slice A) or an onHostCall router (Slice B, in-process CDB).
  InProcessAvm: new (wsdbPath: string, cdbPathOrOnHostCall: string | OnHostCall) => InProcessAvmHandle;
}

/** Host-call target id for the contracts-DB service; must match CDB_TARGET in host_call_contract_db.cpp. */
const CDB_TARGET = 0;

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
    // The generic host-call router: dispatch the AVM's reverse requests to the right host service.
    const onHostCall: OnHostCall = async (target, req) => {
      if (target !== CDB_TARGET) {
        throw new Error(`in-process AVM: unknown host_call target ${target}`);
      }
      return Buffer.from(await cdbServer.handle(req));
    };
    const avm = new InProcessAvm(options.wsdbIpcPath, onHostCall);
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
