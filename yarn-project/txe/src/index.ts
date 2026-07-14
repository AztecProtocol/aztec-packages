import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/foundation/log';
import { cloneEphemeralStoreFrom } from '@aztec/kv-store/lmdb-v2';
import type { ProtocolContractName } from '@aztec/protocol-contracts';
import { ContractStore } from '@aztec/pxe/client/lazy';
import type { ApiSchemaFor } from '@aztec/stdlib/schemas';
import { zodFor } from '@aztec/stdlib/schemas';

import { join } from 'path';
import { z } from 'zod';

// Side-effect import: registers the msgpackr Fr extension for the bundled `Fr` class. Must
// be loaded before any `sendMessage` call. See msgpackr_fr_extension.ts for the why.
import './msgpackr_fr_extension.js';
import { type TXEOracleFunctionName, TXESession } from './txe_session.js';
import {
  type ForeignCallArgs,
  ForeignCallArgsSchema,
  type ForeignCallResult,
  ForeignCallResultSchema,
} from './utils/encoding.js';
import { TXEArtifactResolver } from './utils/txe_artifact_resolver.js';

export const TXE_REQUIRED_PROTOCOL_CONTRACTS: ProtocolContractName[] = [
  'ContractClassRegistry',
  'ContractInstanceRegistry',
  'FeeJuice',
];

const sessions = new Map<number, TXESession>();

export type TXEForeignCallInput = {
  session_id: number;
  function: TXEOracleFunctionName;
  root_path: string;
  package_name: string;
  inputs: ForeignCallArgs;
};

export const TXEForeignCallInputSchema: z.ZodType<TXEForeignCallInput> = zodFor<TXEForeignCallInput>()(
  z.object({
    // Nargo generates session_id as a u64, which may exceed Number.MAX_SAFE_INTEGER.
    // Zod 4's `.int()` enforces the safe-integer bound, so we drop it here and only require
    // the value to be a non-negative number (it is used solely as a Map key).
    // eslint-disable-next-line camelcase
    session_id: z.number().nonnegative(),
    function: z.string() as z.ZodType<TXEOracleFunctionName>,
    // eslint-disable-next-line camelcase
    root_path: z.string(),
    // eslint-disable-next-line camelcase
    package_name: z.string(),
    inputs: ForeignCallArgsSchema,
  }),
);

export interface TXEDispatcherOptions {
  /**
   * Path to an LMDB directory holding the required protocol contracts (see
   * {@link TXE_REQUIRED_PROTOCOL_CONTRACTS}) and the SchnorrAccount artifact. When set, the
   * dispatcher clones this directory into a fresh tmpdir on first use instead of registering
   * the contracts itself.
   */
  contractStoreSourceDir: string;
  /**
   * Class id (hex) of the SchnorrAccount artifact pre-registered in the shared LMDB. The
   * {@link TXEArtifactResolver} looks the artifact up from the cloned store via this class id
   * instead of recomputing it via `getSchnorrAccountContractArtifact()` + `computeArtifactHash()`.
   */
  schnorrClassId: string;
}

export class TXEDispatcher {
  private contractStore!: ContractStore;
  private artifactResolver!: TXEArtifactResolver;
  private readonly contractStoreSourceDir: string;
  private readonly schnorrClassId: Fr;

  constructor(
    private logger: Logger,
    opts: TXEDispatcherOptions,
  ) {
    this.contractStoreSourceDir = opts.contractStoreSourceDir;
    this.schnorrClassId = Fr.fromString(opts.schnorrClassId);
  }

  /**
   * Clones the pre-populated LMDB at `contractStoreSourceDir` into a fresh per-instance tmpdir
   * on first use, so this dispatcher has a writable store already containing the required
   * protocol contracts + SchnorrAccount. Idempotent — subsequent calls are no-ops.
   */
  private async warmUp(): Promise<void> {
    if (this.contractStore) {
      return;
    }
    const t0 = Date.now();
    const kvStore = await cloneEphemeralStoreFrom(
      join(this.contractStoreSourceDir, 'data.mdb'),
      'txe-contracts',
      undefined,
      2,
    );
    this.contractStore = new ContractStore(kvStore);
    this.artifactResolver = new TXEArtifactResolver(this.contractStore, this.schnorrClassId);
    this.logger.debug('Cloned shared protocol-contracts store', { totalMs: Date.now() - t0 });
  }

  // eslint-disable-next-line camelcase
  async resolve_foreign_call(callData: TXEForeignCallInput): Promise<ForeignCallResult> {
    const {
      session_id: sessionId,
      function: functionName,
      inputs,
      root_path: rootPath,
      package_name: packageName,
    } = callData;
    this.logger.debug(`Calling ${functionName} on session ${sessionId}`);

    if (!sessions.has(sessionId)) {
      this.logger.debug(`Creating new session ${sessionId}`);
      await this.warmUp();
      sessions.set(sessionId, await TXESession.init(this.contractStore, this.artifactResolver, rootPath, packageName));
    }

    return await sessions.get(sessionId)!.processFunction(functionName, inputs);
  }

  /**
   * Releases a session and its resources (per-session LMDB + `NativeWorldStateService`).
   * Called by the dispatcher pool when nargo closes its TCP connection for a test (see
   * `rpc_server.ts`'s socket tracker). No-op if the session was never created — that happens
   * when nargo opens a connection but errors before sending a request.
   */
  async disposeSession(sessionId: number): Promise<void> {
    const session = sessions.get(sessionId);
    if (!session) {
      return;
    }
    sessions.delete(sessionId);
    await session.dispose();
  }
}

/** Diagnostic-only: number of sessions currently held by this worker. */
export function activeSessionCount(): number {
  return sessions.size;
}

export const TXEDispatcherApiSchema: ApiSchemaFor<TXEDispatcher> = {
  // eslint-disable-next-line camelcase
  resolve_foreign_call: z.function({ input: z.tuple([TXEForeignCallInputSchema]), output: ForeignCallResultSchema }),
  // disposeSession is invoked over IPC from the worker, not via RPC; required by ApiSchemaFor.
  disposeSession: z.function({ input: z.tuple([z.number().nonnegative()]), output: z.void() }),
};
