import { type NoirCompiledContract, loadContractArtifact } from '@aztec/aztec.js/abi';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import {
  type ContractInstanceWithAddress,
  getContractInstanceFromInstantiationParams,
} from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import { PublicKeys, deriveKeys } from '@aztec/aztec.js/keys';
import type { Logger } from '@aztec/foundation/log';
import { cloneEphemeralStoreFrom } from '@aztec/kv-store/lmdb-v2';
import { ContractStore } from '@aztec/pxe/client/lazy';
import { computeArtifactHash } from '@aztec/stdlib/contract';
import type { ContractArtifactWithHash } from '@aztec/stdlib/contract';
import type { ApiSchemaFor } from '@aztec/stdlib/schemas';
import { zodFor } from '@aztec/stdlib/schemas';

import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { readFile, readdir } from 'fs/promises';
import { join, parse } from 'path';
import { z } from 'zod';

// Side-effect import: registers the msgpackr Fr extension for the bundled `Fr` class. Must
// be loaded before any `sendMessage` call. See msgpackr_fr_extension.ts for the why.
import './msgpackr_fr_extension.js';
import { type TXEOracleFunctionName, TXESession } from './txe_session.js';
import {
  type ForeignCallArgs,
  ForeignCallArgsSchema,
  type ForeignCallArray,
  type ForeignCallResult,
  ForeignCallResultSchema,
  type ForeignCallSingle,
  addressFromSingle,
  fromArray,
  fromSingle,
  toSingle,
} from './utils/encoding.js';

// Protocol contracts TXE preloads in its shared contract store. AuthRegistry and PublicChecks are
// standard contracts now, and TXESession.init deploys them into each per-session store.
export const TXE_REQUIRED_PROTOCOL_CONTRACTS = [] as const;

const sessions = new Map<number, TXESession>();

/**
 * Cache + in-flight map pair. Lookup hits the cache, then awaits an in-flight `compute()` if one
 * exists, otherwise starts one and stores it. Guarantees `compute()` runs at most once per `key`
 * across concurrent callers, which matters because `computeArtifactHash` is expensive.
 */
class AsyncCache<K, V> {
  private readonly cache = new Map<K, V>();
  private readonly inFlight = new Map<K, Promise<V>>();

  getOrCompute(key: K, compute: () => Promise<V>): Promise<V> {
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }
    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = (async () => {
        try {
          const value = await compute();
          this.cache.set(key, value);
          return value;
        } finally {
          this.inFlight.delete(key);
        }
      })();
      this.inFlight.set(key, pending);
    }
    return pending;
  }
}

// Full deploys (artifact + computed instance), keyed by the full deploy context (contract +
// constructor args + publicKeys + salt + deployer). Hits on repeated identical deploys.
const TXEDeploymentsCache = new AsyncCache<
  string,
  { artifact: ContractArtifactWithHash; instance: ContractInstanceWithAddress }
>();

// Loaded + hashed contract artifact, keyed by compiled-bytecode hash. Hits across deploys of the
// same contract when constructor args / salt / deployer differ.
const TXEArtifactsCache = new AsyncCache<string, ContractArtifactWithHash>();

export type TXEForeignCallInput = {
  session_id: number;
  function: TXEOracleFunctionName;
  root_path: string;
  package_name: string;
  inputs: ForeignCallArgs;
};

export const TXEForeignCallInputSchema = zodFor<TXEForeignCallInput>()(
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
   * Class id (hex) of the SchnorrAccount artifact pre-registered in the shared LMDB. When set,
   * `#processAddAccountInputs` looks the artifact up from the cloned store instead of
   * recomputing it via `getSchnorrAccountContractArtifact()` + `computeArtifactHash()`.
   */
  schnorrClassId: string;
}

export class TXEDispatcher {
  private contractStore!: ContractStore;
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
    this.logger.debug('Cloned shared contract store', { totalMs: Date.now() - t0 });
  }

  private fastHashFile(path: string): Promise<string> {
    return new Promise(resolve => {
      const fd = createReadStream(path);
      const hash = createHash('sha1');
      hash.setEncoding('hex');

      fd.on('end', function () {
        hash.end();
        resolve(hash.read() as string);
      });

      fd.pipe(hash);
    });
  }

  async #processDeployInputs({ inputs, root_path: rootPath, package_name: packageName }: TXEForeignCallInput) {
    const [contractPath, initializer] = inputs.slice(0, 2).map(input =>
      fromArray(input as ForeignCallArray)
        .map(char => String.fromCharCode(char.toNumber()))
        .join(''),
    );

    const decodedArgs = fromArray(inputs[3] as ForeignCallArray);
    const secret = fromSingle(inputs[4] as ForeignCallSingle);
    const salt = fromSingle(inputs[5] as ForeignCallSingle);
    const deployer = addressFromSingle(inputs[6] as ForeignCallSingle);
    const publicKeys = secret.equals(Fr.ZERO) ? PublicKeys.default() : (await deriveKeys(secret)).publicKeys;
    const publicKeysHash = await publicKeys.hash();

    let artifactPath = '';
    const { dir: contractDirectory, base: contractFilename } = parse(contractPath);
    if (contractDirectory) {
      if (contractDirectory.includes('@')) {
        // We're deploying a contract that belongs in a workspace
        // env.deploy("../path/to/workspace/root@packageName/contractName")
        const [workspace, pkg] = contractDirectory.split('@');
        const targetPath = join(rootPath, workspace, '/target');
        this.logger.debug(`Looking for compiled artifact in workspace ${targetPath}`);
        artifactPath = join(targetPath, `${pkg}-${contractFilename}.json`);
      } else {
        // We're deploying a standalone external contract
        // env.deploy("../path/to/contract/root/contractName")
        const targetPath = join(rootPath, contractDirectory, '/target');
        this.logger.debug(`Looking for compiled artifact in ${targetPath}`);
        [artifactPath] = (await readdir(targetPath)).filter(file => file.endsWith(`-${contractFilename}.json`));
      }
    } else {
      // We're deploying a local contract
      // env.deploy("contractName")
      artifactPath = join(rootPath, './target', `${packageName}-${contractFilename}.json`);
    }

    const fileHash = await this.fastHashFile(artifactPath);

    const cacheKey = `${contractDirectory ?? ''}-${contractFilename}-${initializer}-${decodedArgs
      .map(arg => arg.toString())
      .join('-')}-${publicKeysHash}-${salt}-${deployer}-${fileHash}`;

    const { artifact, instance } = await TXEDeploymentsCache.getOrCompute(cacheKey, async () => {
      this.logger.debug(`Loading compiled artifact ${artifactPath}`);
      // Inner cache: artifact load + hash depends only on the compiled bytecode (`fileHash`), so
      // subsequent deploys of the same contract — regardless of constructor args / deployer /
      // salt — reuse the same `ContractArtifactWithHash`.
      const computedArtifact = await TXEArtifactsCache.getOrCompute(fileHash, async () => {
        const artifactJSON = JSON.parse(await readFile(artifactPath, 'utf-8')) as NoirCompiledContract;
        const artifactWithoutHash = loadContractArtifact(artifactJSON);
        return { ...artifactWithoutHash, artifactHash: await computeArtifactHash(artifactWithoutHash) };
      });
      this.logger.debug(
        `Deploy ${computedArtifact.name} with initializer ${initializer}(${decodedArgs}) and public keys hash ${publicKeysHash.toString()}`,
      );
      const computedInstance = await getContractInstanceFromInstantiationParams(computedArtifact, {
        constructorArgs: decodedArgs,
        skipArgsDecoding: true,
        salt,
        publicKeys,
        constructorArtifact: initializer ? initializer : undefined,
        deployer,
      });
      return { artifact: computedArtifact, instance: computedInstance };
    });

    inputs.splice(0, 1, artifact, instance, toSingle(secret));
  }

  async #processAddAccountInputs({ inputs }: TXEForeignCallInput) {
    const secret = fromSingle(inputs[0] as ForeignCallSingle);

    const cacheKey = `SchnorrAccountContract-${secret}`;

    const { artifact, instance } = await TXEDeploymentsCache.getOrCompute(cacheKey, async () => {
      const [artifactFromStore, classWithPreimage] = await Promise.all([
        this.contractStore.getContractArtifact(this.schnorrClassId),
        this.contractStore.getContractClassWithPreimage(this.schnorrClassId),
      ]);
      if (!artifactFromStore || !classWithPreimage) {
        throw new Error(
          `SchnorrAccount not found in shared contract store at class id ${this.schnorrClassId.toString()}`,
        );
      }
      const computedArtifact = { ...artifactFromStore, artifactHash: classWithPreimage.artifactHash };
      const keys = await deriveKeys(secret);
      const args = [keys.publicKeys.ivpkM.x, keys.publicKeys.ivpkM.y];
      const computedInstance = await getContractInstanceFromInstantiationParams(computedArtifact, {
        constructorArgs: args,
        skipArgsDecoding: true,
        salt: Fr.ONE,
        publicKeys: keys.publicKeys,
        constructorArtifact: 'constructor',
        deployer: AztecAddress.ZERO,
      });
      return { artifact: computedArtifact, instance: computedInstance };
    });

    inputs.splice(0, 0, artifact, instance);
  }

  // eslint-disable-next-line camelcase
  async resolve_foreign_call(callData: TXEForeignCallInput): Promise<ForeignCallResult> {
    const { session_id: sessionId, function: functionName, inputs } = callData;
    this.logger.debug(`Calling ${functionName} on session ${sessionId}`);

    if (!sessions.has(sessionId)) {
      this.logger.debug(`Creating new session ${sessionId}`);
      await this.warmUp();
      sessions.set(sessionId, await TXESession.init(this.contractStore));
    }

    switch (functionName) {
      case 'aztec_txe_deploy': {
        await this.#processDeployInputs(callData);
        break;
      }
      case 'aztec_txe_addAccount': {
        await this.#processAddAccountInputs(callData);
        break;
      }
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
