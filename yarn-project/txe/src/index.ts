import { getSchnorrAccountContractArtifact } from '@aztec/accounts/schnorr/lazy';
import { type NoirCompiledContract, loadContractArtifact } from '@aztec/aztec.js/abi';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import {
  type ContractInstanceWithAddress,
  getContractInstanceFromInstantiationParams,
} from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import { PublicKeys, deriveKeys } from '@aztec/aztec.js/keys';
import type { Logger } from '@aztec/foundation/log';
import { openStoreAt, openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { ProtocolContractName } from '@aztec/protocol-contracts';
import { LazyProtocolContractsProvider } from '@aztec/protocol-contracts/providers/lazy';
import { ContractStore } from '@aztec/pxe/client/lazy';
import { computeArtifactHash, getContractClassFromArtifact } from '@aztec/stdlib/contract';
import type { ContractArtifactWithHash } from '@aztec/stdlib/contract';
import type { ApiSchemaFor } from '@aztec/stdlib/schemas';
import { zodFor } from '@aztec/stdlib/schemas';

import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { copyFile, mkdtemp, readFile, readdir } from 'fs/promises';
import { tmpdir } from 'os';
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

// Protocol contracts TXE actually requires registered in its contract store. The full set
// `protocolContractNames` includes six contracts; TXE token-suite tests only ever look up
// AuthRegistry (for authwit validation). Loading the others spends ~200 KiB of artifact
// reads + 4 LMDB writes per session warm-up. Add a contract here if a test ever fails
// with a "contract not found" lookup against a 0x000…00X address.
export const TXE_REQUIRED_PROTOCOL_CONTRACTS: ProtocolContractName[] = ['AuthRegistry'];

const sessions = new Map<number, TXESession>();

/*
 * TXE typically has to load the same contract artifacts over and over again for multiple tests,
 * so we cache them here to avoid loading from disk repeatedly.
 *
 * The in-flight map coalesces concurrent requests for the same cache key so that
 * computeArtifactHash (very expensive) is only run once even under parallelism.
 */
const TXEArtifactsCache = new Map<
  string,
  { artifact: ContractArtifactWithHash; instance: ContractInstanceWithAddress }
>();
const TXEArtifactsCacheInFlight = new Map<
  string,
  Promise<{ artifact: ContractArtifactWithHash; instance: ContractInstanceWithAddress }>
>();

/**
 * Maps a compiled-artifact file hash to its loaded + hashed {@link ContractArtifactWithHash}.
 *
 * `TXEArtifactsCache` keys include constructor args / publicKeys / salt / deployer, so deploying
 * the same contract from many tests (e.g. Token with different owner addresses) produces a fresh
 * key per deploy and misses the cache. The artifact + artifact hash, however, only depend on the
 * compiled bytecode (`fileHash`). Caching that result here lets the 60-token-test workload
 * compute `loadContractArtifact` + `computeArtifactHash` once per (worker, contract) instead of
 * once per (worker, deploy).
 */
const TXEArtifactByFileHashCache = new Map<string, ContractArtifactWithHash>();
const TXEArtifactByFileHashInFlight = new Map<string, Promise<ContractArtifactWithHash>>();

function getOrLoadArtifactByFileHash(fileHash: string, artifactPath: string): Promise<ContractArtifactWithHash> {
  const cached = TXEArtifactByFileHashCache.get(fileHash);
  if (cached) {
    return Promise.resolve(cached);
  }
  const inFlight = TXEArtifactByFileHashInFlight.get(fileHash);
  if (inFlight) {
    return inFlight;
  }
  const promise = (async () => {
    const artifactJSON = JSON.parse(await readFile(artifactPath, 'utf-8')) as NoirCompiledContract;
    const artifactWithoutHash = loadContractArtifact(artifactJSON);
    const result: ContractArtifactWithHash = {
      ...artifactWithoutHash,
      artifactHash: await computeArtifactHash(artifactWithoutHash),
    };
    TXEArtifactByFileHashCache.set(fileHash, result);
    TXEArtifactByFileHashInFlight.delete(fileHash);
    return result;
  })();
  TXEArtifactByFileHashInFlight.set(fileHash, promise);
  return promise;
}

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
   * Path to an LMDB directory that already holds the required protocol contracts (see
   * {@link TXE_REQUIRED_PROTOCOL_CONTRACTS}) and the SchnorrAccount artifact. When set,
   * `warmUp()` skips the artifact load + registration step and instead **clones** the source
   * directory into a fresh per-worker LMDB. The pool's main thread builds the source once;
   * workers clone the data.mdb file which is much cheaper than re-running the lazy
   * provider + LMDB writes in every worker.
   */
  contractStoreSourceDir?: string;
  /**
   * Class id (hex) of the SchnorrAccount artifact pre-registered in the shared LMDB. When
   * set, `#processAddAccountInputs` looks the artifact up from the (cloned) contract store
   * instead of re-running `getSchnorrAccountContractArtifact()` + `computeArtifactHash()`
   * per session.
   */
  schnorrClassId?: string;
}

export class TXEDispatcher {
  private contractStore!: ContractStore;
  private readonly contractStoreSourceDir: string | undefined;
  private readonly schnorrClassId: Fr | undefined;

  constructor(
    private logger: Logger,
    opts: TXEDispatcherOptions = {},
  ) {
    this.contractStoreSourceDir = opts.contractStoreSourceDir;
    this.schnorrClassId = opts.schnorrClassId ? Fr.fromString(opts.schnorrClassId) : undefined;
  }

  /**
   * Initializes the contract store. When `contractStoreSourceDir` is set (the pool path),
   * the pre-populated LMDB is copied to a fresh per-worker tmpdir so the worker has a
   * writable store that already contains the required protocol contracts + SchnorrAccount.
   *
   * Otherwise (standalone TXE / unit tests) we create an empty tmp store and register the
   * required contracts from scratch.
   *
   * Safe to invoke more than once; subsequent calls are no-ops.
   */
  async warmUp(): Promise<void> {
    if (this.contractStore) {
      return;
    }
    const t0 = Date.now();
    if (this.contractStoreSourceDir) {
      // LMDB env on disk is `data.mdb` (data + b-tree) + `lock.mdb` (process lock table).
      // Only data.mdb carries state; lock.mdb is rebuilt the first time an env is opened on
      // the new path. Copying just the data file gives this worker a writable LMDB
      // pre-populated with every entry the pool's main thread wrote into the source.
      const cloneDir = await mkdtemp(join(tmpdir(), 'txe-contracts-'));
      await copyFile(join(this.contractStoreSourceDir, 'data.mdb'), join(cloneDir, 'data.mdb'));
      const tClone = Date.now();
      const kvStore = await openStoreAt(cloneDir, undefined, 2);
      this.contractStore = new ContractStore(kvStore);
      this.logger.info('Cloned shared protocol-contracts store', {
        cloneMs: tClone - t0,
        openMs: Date.now() - tClone,
        totalMs: Date.now() - t0,
      });
      return;
    }
    const kvStore = await openTmpStore('txe-contracts', true, undefined, 1);
    const tKv = Date.now();
    this.contractStore = new ContractStore(kvStore);
    const provider = new LazyProtocolContractsProvider();
    const [protocolContracts, schnorrArtifact] = await Promise.all([
      Promise.all(TXE_REQUIRED_PROTOCOL_CONTRACTS.map(name => provider.getProtocolContractArtifact(name))),
      getSchnorrAccountContractArtifact(),
    ]);
    const schnorrClass = await getContractClassFromArtifact(schnorrArtifact);
    const tResolved = Date.now();
    await Promise.all([
      ...protocolContracts.flatMap(({ instance, artifact, contractClass }) => [
        this.contractStore.addContractArtifact(artifact, contractClass),
        this.contractStore.addContractInstance(instance),
      ]),
      this.contractStore.addContractArtifact(schnorrArtifact, schnorrClass),
    ]);
    const tDone = Date.now();
    this.logger.info('Registered protocol contracts in fresh contract store', {
      kvOpenMs: tKv - t0,
      providerMs: tResolved - tKv,
      writeMs: tDone - tResolved,
      totalMs: tDone - t0,
    });
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

    let instance;
    let artifact: ContractArtifactWithHash;

    if (TXEArtifactsCache.has(cacheKey)) {
      this.logger.debug(`Using cached artifact for ${cacheKey}`);
      ({ artifact, instance } = TXEArtifactsCache.get(cacheKey)!);
    } else {
      if (!TXEArtifactsCacheInFlight.has(cacheKey)) {
        this.logger.debug(`Loading compiled artifact ${artifactPath}`);
        const compute = async () => {
          // Artifact load + hash depends only on the compiled bytecode (`fileHash`), so any
          // subsequent deploy of the same contract within this worker — regardless of
          // constructor args / deployer / salt — reuses the same `ContractArtifactWithHash`.
          const computedArtifact = await getOrLoadArtifactByFileHash(fileHash, artifactPath);
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
          const result = { artifact: computedArtifact, instance: computedInstance };
          TXEArtifactsCache.set(cacheKey, result);
          TXEArtifactsCacheInFlight.delete(cacheKey);
          return result;
        };
        TXEArtifactsCacheInFlight.set(cacheKey, compute());
      }
      ({ artifact, instance } = await TXEArtifactsCacheInFlight.get(cacheKey)!);
    }

    inputs.splice(0, 1, artifact, instance, toSingle(secret));
  }

  async #processAddAccountInputs({ inputs }: TXEForeignCallInput) {
    const secret = fromSingle(inputs[0] as ForeignCallSingle);

    const cacheKey = `SchnorrAccountContract-${secret}`;

    let artifact: ContractArtifactWithHash;
    let instance;

    if (TXEArtifactsCache.has(cacheKey)) {
      this.logger.debug(`Using cached artifact for ${cacheKey}`);
      ({ artifact, instance } = TXEArtifactsCache.get(cacheKey)!);
    } else {
      if (!TXEArtifactsCacheInFlight.has(cacheKey)) {
        const compute = async () => {
          // Prefer the pool-cached artifact in the (cloned) contract store: the main thread
          // registered SchnorrAccount once with its computed class, so we get back both the
          // full artifact and its precomputed `artifactHash` without re-running
          // `loadContractArtifact` or `computeArtifactHash` on this worker.
          let computedArtifact: ContractArtifactWithHash;
          if (this.schnorrClassId) {
            const [artifactFromStore, classWithPreimage] = await Promise.all([
              this.contractStore.getContractArtifact(this.schnorrClassId),
              this.contractStore.getContractClassWithPreimage(this.schnorrClassId),
            ]);
            if (!artifactFromStore || !classWithPreimage) {
              throw new Error(
                `SchnorrAccount not found in shared contract store at class id ${this.schnorrClassId.toString()}`,
              );
            }
            computedArtifact = { ...artifactFromStore, artifactHash: classWithPreimage.artifactHash };
          } else {
            // Standalone path (no pool, no shared store): load + hash via the lazy entrypoint.
            const schnorrArtifact = await getSchnorrAccountContractArtifact();
            computedArtifact = { ...schnorrArtifact, artifactHash: await computeArtifactHash(schnorrArtifact) };
          }
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
          const result = { artifact: computedArtifact, instance: computedInstance };
          TXEArtifactsCache.set(cacheKey, result);
          TXEArtifactsCacheInFlight.delete(cacheKey);
          return result;
        };
        TXEArtifactsCacheInFlight.set(cacheKey, compute());
      }
      ({ artifact, instance } = await TXEArtifactsCacheInFlight.get(cacheKey)!);
    }

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

export const TXEDispatcherApiSchema: ApiSchemaFor<TXEDispatcher> = {
  // eslint-disable-next-line camelcase
  resolve_foreign_call: z.function({ input: z.tuple([TXEForeignCallInputSchema]), output: ForeignCallResultSchema }),
  // warmUp is part of the public class because workers call it directly to eagerly load the
  // contract store; the schema entry is required for `ApiSchemaFor` but is not exposed in any
  // way that nargo would invoke.
  warmUp: z.function({ input: z.tuple([]), output: z.void() }),
  // disposeSession is called via worker IPC, never via RPC.
  disposeSession: z.function({ input: z.tuple([z.number().nonnegative()]), output: z.void() }),
};
// `createTXERpcServer` deliberately lives in `./rpc_server.ts` and is exposed under the
// `@aztec/txe/server` subpath. Re-exporting it from this barrel would pull `createSafeJsonRpcServer`
// → koa, raw-body, iconv-lite, mime-db (~1 MiB) into the worker bundle, since `worker.ts` imports
// `TXEDispatcher` from here.
