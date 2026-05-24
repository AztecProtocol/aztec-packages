import { type NoirCompiledContract, loadContractArtifact } from '@aztec/aztec.js/abi';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import {
  type ContractInstanceWithAddress,
  getContractInstanceFromInstantiationParams,
} from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import { PublicKeys, deriveKeys } from '@aztec/aztec.js/keys';
import { createLogger } from '@aztec/foundation/log';
import type { ContractStore } from '@aztec/pxe/client/lazy';
import type { ContractArtifactWithHash } from '@aztec/stdlib/contract';
import { computeArtifactHash } from '@aztec/stdlib/contract';

import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { readFile, readdir } from 'fs/promises';
import { join, parse } from 'path';

export interface ResolvedArtifact {
  artifact: ContractArtifactWithHash;
  instance: ContractInstanceWithAddress;
}

/**
 * Cache + in-flight map pair. Lookup hits the cache, then awaits an in-flight `compute()` if one
 * exists, otherwise starts one and stores it. Guarantees `compute()` runs at most once per `key`
 * across concurrent callers, which matters because `computeArtifactHash` is expensive.
 */
class AsyncCache<K, V> {
  #cache = new Map<K, V>();
  #inFlight = new Map<K, Promise<V>>();

  getOrCompute(key: K, compute: () => Promise<V>): Promise<V> {
    const cached = this.#cache.get(key);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }
    let pending = this.#inFlight.get(key);
    if (!pending) {
      pending = (async () => {
        try {
          const value = await compute();
          this.#cache.set(key, value);
          return value;
        } finally {
          this.#inFlight.delete(key);
        }
      })();
      this.#inFlight.set(key, pending);
    }
    return pending;
  }
}

/**
 * Resolves and caches contract artifacts and their associated instances.
 *
 * Artifact hash computation is expensive, so this service deduplicates both completed and in-flight computations.
 * Two cache levels are kept: full deploys (artifact + computed instance) keyed by the full deploy context, and loaded +
 * hashed artifacts keyed by the compiled-bytecode hash so deploys of the same contract with different args / salt /
 * deployer reuse the same `ContractArtifactWithHash`.
 */
export class TXEArtifactResolver {
  #deployments = new AsyncCache<string, ResolvedArtifact>();
  #artifacts = new AsyncCache<string, ContractArtifactWithHash>();
  #logger = createLogger('txe:artifact_resolver');

  constructor(
    private readonly contractStore: ContractStore,
    private readonly schnorrClassId: Fr,
  ) {}

  /** Resolves the Schnorr account contract artifact and instance for the given secret, caching the result. */
  resolveAccountArtifact(secret: Fr): Promise<ResolvedArtifact> {
    return this.#deployments.getOrCompute(`SchnorrAccountContract-${secret}`, () =>
      this.#computeAccountArtifact(secret),
    );
  }

  /** Resolves a contract artifact from disk by path, computes its instance, and caches the result. */
  async resolveDeployArtifact({
    rootPath,
    packageName,
    contractPath,
    initializer,
    args,
    secret,
    salt,
    deployer,
  }: {
    rootPath: string;
    packageName: string;
    contractPath: string;
    initializer: string;
    args: Fr[];
    secret: Fr;
    salt: Fr;
    deployer: AztecAddress;
  }): Promise<ResolvedArtifact> {
    const publicKeys = secret.equals(Fr.ZERO) ? PublicKeys.default() : (await deriveKeys(secret)).publicKeys;
    const publicKeysHash = await publicKeys.hash();

    const artifactPath = await this.#resolveArtifactPath(rootPath, packageName, contractPath);
    const fileHash = await this.#fastHashFile(artifactPath);

    const { dir: contractDirectory, base: contractFilename } = parse(contractPath);
    const cacheKey = `${contractDirectory ?? ''}-${contractFilename}-${initializer}-${args
      .map(arg => arg.toString())
      .join('-')}-${publicKeysHash}-${salt}-${deployer}-${fileHash}`;

    return this.#deployments.getOrCompute(cacheKey, () =>
      this.#computeDeployArtifact(artifactPath, fileHash, initializer, args, salt, publicKeys, publicKeysHash, deployer),
    );
  }

  async #resolveArtifactPath(rootPath: string, packageName: string, contractPath: string): Promise<string> {
    const { dir: contractDirectory, base: contractFilename } = parse(contractPath);
    if (contractDirectory) {
      if (contractDirectory.includes('@')) {
        // env.deploy("../path/to/workspace/root@packageName/contractName")
        const [workspace, pkg] = contractDirectory.split('@');
        const targetPath = join(rootPath, workspace, '/target');
        this.#logger.debug(`Looking for compiled artifact in workspace ${targetPath}`);
        return join(targetPath, `${pkg}-${contractFilename}.json`);
      } else {
        // env.deploy("../path/to/contract/root/contractName")
        const targetPath = join(rootPath, contractDirectory, '/target');
        this.#logger.debug(`Looking for compiled artifact in ${targetPath}`);
        const [artifactPath] = (await readdir(targetPath)).filter(file => file.endsWith(`-${contractFilename}.json`));
        return artifactPath;
      }
    } else {
      // env.deploy("contractName")
      return join(rootPath, './target', `${packageName}-${contractFilename}.json`);
    }
  }

  async #computeAccountArtifact(secret: Fr): Promise<ResolvedArtifact> {
    const [artifactFromStore, classWithPreimage] = await Promise.all([
      this.contractStore.getContractArtifact(this.schnorrClassId),
      this.contractStore.getContractClassWithPreimage(this.schnorrClassId),
    ]);
    if (!artifactFromStore || !classWithPreimage) {
      throw new Error(`SchnorrAccount not found in shared contract store at class id ${this.schnorrClassId.toString()}`);
    }
    const artifact: ContractArtifactWithHash = { ...artifactFromStore, artifactHash: classWithPreimage.artifactHash };
    const keys = await deriveKeys(secret);
    const args = [keys.publicKeys.masterIncomingViewingPublicKey.x, keys.publicKeys.masterIncomingViewingPublicKey.y];
    const instance = await getContractInstanceFromInstantiationParams(artifact, {
      constructorArgs: args,
      skipArgsDecoding: true,
      salt: Fr.ONE,
      publicKeys: keys.publicKeys,
      constructorArtifact: 'constructor',
      deployer: AztecAddress.ZERO,
    });
    return { artifact, instance };
  }

  async #computeDeployArtifact(
    artifactPath: string,
    fileHash: string,
    initializer: string,
    args: Fr[],
    salt: Fr,
    publicKeys: PublicKeys,
    publicKeysHash: Fr,
    deployer: AztecAddress,
  ): Promise<ResolvedArtifact> {
    // Inner cache: artifact load + hash depends only on the compiled bytecode (`fileHash`), so subsequent deploys of
    // the same contract — regardless of constructor args / deployer / salt — reuse the same `ContractArtifactWithHash`.
    const artifact = await this.#artifacts.getOrCompute(fileHash, async () => {
      this.#logger.debug(`Loading compiled artifact ${artifactPath}`);
      const artifactJSON = JSON.parse(await readFile(artifactPath, 'utf-8')) as NoirCompiledContract;
      const artifactWithoutHash = loadContractArtifact(artifactJSON);
      return { ...artifactWithoutHash, artifactHash: await computeArtifactHash(artifactWithoutHash) };
    });
    this.#logger.debug(
      `Deploy ${artifact.name} with initializer ${initializer}(${args}) and public keys hash ${publicKeysHash}`,
    );
    const instance = await getContractInstanceFromInstantiationParams(artifact, {
      constructorArgs: args,
      skipArgsDecoding: true,
      salt,
      publicKeys,
      constructorArtifact: initializer || undefined,
      deployer,
    });
    return { artifact, instance };
  }

  #fastHashFile(path: string): Promise<string> {
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
}
