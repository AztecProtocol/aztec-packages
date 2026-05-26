import { SchnorrAccountContractArtifact } from '@aztec/accounts/schnorr';
import { type NoirCompiledContract, loadContractArtifact } from '@aztec/aztec.js/abi';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import {
  type ContractInstanceWithAddress,
  getContractInstanceFromInstantiationParams,
} from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import { PublicKeys, deriveKeys } from '@aztec/aztec.js/keys';
import { createSafeJsonRpcServer } from '@aztec/foundation/json-rpc/server';
import type { Logger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { protocolContractNames } from '@aztec/protocol-contracts';
import { BundledProtocolContractsProvider } from '@aztec/protocol-contracts/providers/bundle';
import { ContractStore } from '@aztec/pxe/server';
import { computeArtifactHash } from '@aztec/stdlib/contract';
import type { ContractArtifactWithHash } from '@aztec/stdlib/contract';
import type { ApiSchemaFor } from '@aztec/stdlib/schemas';
import { zodFor } from '@aztec/stdlib/schemas';

import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { readFile, readdir } from 'fs/promises';
import { join, parse } from 'path';
import { z } from 'zod';

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
} from './util/encoding.js';

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

type TXEForeignCallInput = {
  session_id: number;
  function: TXEOracleFunctionName;
  root_path: string;
  package_name: string;
  inputs: ForeignCallArgs;
};

const TXEForeignCallInputSchema = zodFor<TXEForeignCallInput>()(
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

class TXEDispatcher {
  private contractStore!: ContractStore;

  constructor(private logger: Logger) {}

  private fastHashFile(path: string) {
    return new Promise(resolve => {
      const fd = createReadStream(path);
      const hash = createHash('sha1');
      hash.setEncoding('hex');

      fd.on('end', function () {
        hash.end();
        resolve(hash.read());
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
          const artifactJSON = JSON.parse(await readFile(artifactPath, 'utf-8')) as NoirCompiledContract;
          const artifactWithoutHash = loadContractArtifact(artifactJSON);
          const computedArtifact: ContractArtifactWithHash = {
            ...artifactWithoutHash,
            // Artifact hash is *very* expensive to compute, so we do it here once
            // and the TXE contract data provider can cache it
            artifactHash: await computeArtifactHash(artifactWithoutHash),
          };
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
          const keys = await deriveKeys(secret);
          const args = [keys.publicKeys.ivpkM.x, keys.publicKeys.ivpkM.y];
          const computedArtifact: ContractArtifactWithHash = {
            ...SchnorrAccountContractArtifact,
            // Artifact hash is *very* expensive to compute, so we do it here once
            // and the TXE contract data provider can cache it
            artifactHash: await computeArtifactHash(SchnorrAccountContractArtifact),
          };
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
      if (!this.contractStore) {
        const kvStore = await openTmpStore('txe-contracts');
        this.contractStore = new ContractStore(kvStore);
        const provider = new BundledProtocolContractsProvider();
        for (const name of protocolContractNames) {
          const { instance, artifact } = await provider.getProtocolContractArtifact(name);
          await this.contractStore.addContractArtifact(artifact);
          await this.contractStore.addContractInstance(instance);
        }
        this.logger.debug('Registered protocol contracts in shared contract store');
      }
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
}

const TXEDispatcherApiSchema: ApiSchemaFor<TXEDispatcher> = {
  // eslint-disable-next-line camelcase
  resolve_foreign_call: z.function({ input: z.tuple([TXEForeignCallInputSchema]), output: ForeignCallResultSchema }),
};

/**
 * Creates an RPC server that forwards calls to the TXE.
 * @param logger - Logger to output to
 * @returns A TXE RPC server.
 */
export function createTXERpcServer(logger: Logger) {
  return createSafeJsonRpcServer(new TXEDispatcher(logger), TXEDispatcherApiSchema, {
    http200OnError: true,
  });
}
