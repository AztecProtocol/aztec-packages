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

interface InProcessAvmModule {
  InProcessAvm: new (wsdbPath: string, cdbPath: string) => InProcessAvmHandle;
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
 * An {@link AvmSimulator} that runs the AVM IN-PROCESS via the avm_inprocess NAPI addon, instead of a pool of
 * bb-avm-sim subprocesses. Sibling of {@link AvmSimulatorPool}: it owns the same CDB reverse channel (a
 * {@link CdbIpcServer} socket + per-simulate fork registration) and drives the generated `AvmService`; only
 * the transport differs — an in-process worker thread rather than a child process. Slice A keeps world state
 * and contract data out-of-process (reached over sockets); only the AVM itself comes in-process. Downstream
 * holds the {@link AvmSimulator} interface and is unaffected by the choice.
 */
export class NapiAvmSimulator implements AvmSimulator {
  private log: Logger;

  private constructor(
    private service: AsyncApi,
    private cdbServer: CdbIpcServer,
  ) {
    this.log = createLogger('simulator:napi-avm');
  }

  static async spawn(options: { wsdbIpcPath: string }): Promise<NapiAvmSimulator> {
    const { InProcessAvm } = loadAddon();
    const cdbServer = new CdbIpcServer();
    // The addon connects to the CDB socket synchronously at construction, so wait for the server to bind.
    await cdbServer.ready();
    const avm = new InProcessAvm(options.wsdbIpcPath, cdbServer.ipcPath);
    const service = new AsyncApi(new NapiBackend(avm));
    return new NapiAvmSimulator(service, cdbServer);
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
