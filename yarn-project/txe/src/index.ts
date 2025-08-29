import { SchnorrAccountContractArtifact } from '@aztec/accounts/schnorr';
import {
  AztecAddress,
  type ContractInstanceWithAddress,
  Fr,
  type NoirCompiledContract,
  PublicKeys,
  deriveKeys,
  getContractInstanceFromInstantiationParams,
  loadContractArtifact,
} from '@aztec/aztec.js';
import { createSafeJsonRpcServer } from '@aztec/foundation/json-rpc/server';
import type { Logger } from '@aztec/foundation/log';
import { type ProtocolContract, protocolContractNames } from '@aztec/protocol-contracts';
import { BundledProtocolContractsProvider } from '@aztec/protocol-contracts/providers/bundle';
import { computeArtifactHash } from '@aztec/stdlib/contract';
import type { ApiSchemaFor, ZodFor } from '@aztec/stdlib/schemas';

import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { readFile, readdir } from 'fs/promises';
import { join, parse } from 'path';
import { Worker } from 'worker_threads';
import { z } from 'zod';

import type { TXEOracleFunctionName } from './txe_session.js';
import {
  type ForeignCallArgs,
  ForeignCallArgsSchema,
  type ForeignCallArray,
  type ForeignCallResult,
  ForeignCallResultSchema,
  type ForeignCallSingle,
  fromArray,
  fromSingle,
  toSingle,
} from './util/encoding.js';
import { serializeForeignCallArgs, serializeProtocolContracts } from './util/serialization.js';
import type { ContractArtifactWithHash } from './util/txe_contract_data_provider.js';

interface SessionWorker {
  worker: Worker;
  processing: boolean;
}

const sessionWorkers = new Map<number, SessionWorker>();

/*
 * TXE typically has to load the same contract artifacts over and over again for multiple tests,
 * so we cache them here to avoid both loading them from disk repeatedly and computing their artifact hashes
 */
const TXEArtifactsCache = new Map<
  string,
  { artifact: ContractArtifactWithHash; instance: ContractInstanceWithAddress }
>();

type TXEForeignCallInput = {
  session_id: number;
  function: TXEOracleFunctionName;
  root_path: string;
  package_name: string;
  inputs: ForeignCallArgs;
};

const TXEForeignCallInputSchema = z.object({
  // eslint-disable-next-line camelcase
  session_id: z.number().int().nonnegative(),
  function: z.string() as ZodFor<TXEOracleFunctionName>,
  // eslint-disable-next-line camelcase
  root_path: z.string(),
  // eslint-disable-next-line camelcase
  package_name: z.string(),
  inputs: ForeignCallArgsSchema,
}) satisfies ZodFor<TXEForeignCallInput>;

class TXEDispatcher {
  private protocolContracts!: ProtocolContract[];

  constructor(private logger: Logger) {}

  private waitForWorkerReady(worker: Worker): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      worker.once('message', (msg: any) => {
        if (msg.type === 'ready') {
          resolve();
        } else if (msg.type === 'error') {
          reject(new Error(msg.error));
        }
      });
    });
  }

  private async createSessionWorker(): Promise<SessionWorker> {
    // Ensure protocol contracts are loaded
    if (!this.protocolContracts) {
      this.protocolContracts = await Promise.all(
        protocolContractNames.map(name => new BundledProtocolContractsProvider().getProtocolContractArtifact(name)),
      );
    }

    // Serialize protocol contracts for worker
    const serializedProtocolContracts = serializeProtocolContracts(this.protocolContracts);

    const worker = new Worker('./dest/session_worker.js', {
      workerData: { serializedProtocolContracts },
    });

    // Wait for the worker to signal it's ready
    await this.waitForWorkerReady(worker);

    return {
      worker,
      processing: false,
    };
  }

  private async getOrCreateWorker(sessionId: number): Promise<SessionWorker> {
    if (!sessionWorkers.has(sessionId)) {
      this.logger.debug(`Creating new worker for session ${sessionId}`);
      const worker = await this.createSessionWorker();
      sessionWorkers.set(sessionId, worker);
    }
    return sessionWorkers.get(sessionId)!;
  }

  private sendToWorker(
    sessionWorker: SessionWorker,
    sessionId: number,
    functionName: TXEOracleFunctionName,
    inputs: ForeignCallArgs,
  ): Promise<ForeignCallResult> {
    if (sessionWorker.processing) {
      throw new Error(
        `Session ${sessionId} is already processing a request. This should not happen as RPC requests are sequential.`,
      );
    }

    sessionWorker.processing = true;

    return new Promise((resolve, reject) => {
      const onMessage = (msg: any) => {
        sessionWorker.worker.off('message', onMessage);
        sessionWorker.processing = false;

        if (msg.type === 'result') {
          resolve(msg.result);
        } else if (msg.type === 'error') {
          reject(new Error(msg.error));
        }
      };

      sessionWorker.worker.on('message', onMessage);

      // Serialize the inputs before sending to worker
      const serializedInputs = serializeForeignCallArgs(inputs);

      sessionWorker.worker.postMessage({
        type: 'process',
        functionName,
        inputs: serializedInputs,
      });
    });
  }

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
      .join('-')}-${publicKeysHash}-${fileHash}`;

    let instance;
    let artifact: ContractArtifactWithHash;

    if (TXEArtifactsCache.has(cacheKey)) {
      this.logger.debug(`Using cached artifact for ${cacheKey}`);
      ({ artifact, instance } = TXEArtifactsCache.get(cacheKey)!);
    } else {
      this.logger.debug(`Loading compiled artifact ${artifactPath}`);
      const artifactJSON = JSON.parse(await readFile(artifactPath, 'utf-8')) as NoirCompiledContract;
      const artifactWithoutHash = loadContractArtifact(artifactJSON);
      artifact = {
        ...artifactWithoutHash,
        // Artifact hash is *very* expensive to compute, so we do it here once
        // and the TXE contract data provider can cache it
        artifactHash: await computeArtifactHash(artifactWithoutHash),
      };
      this.logger.debug(
        `Deploy ${
          artifact.name
        } with initializer ${initializer}(${decodedArgs}) and public keys hash ${publicKeysHash.toString()}`,
      );
      instance = await getContractInstanceFromInstantiationParams(artifact, {
        constructorArgs: decodedArgs,
        skipArgsDecoding: true,
        salt: Fr.ONE,
        publicKeys,
        constructorArtifact: initializer ? initializer : undefined,
        deployer: AztecAddress.ZERO,
      });
      TXEArtifactsCache.set(cacheKey, { artifact, instance });
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
      const keys = await deriveKeys(secret);
      const args = [keys.publicKeys.masterIncomingViewingPublicKey.x, keys.publicKeys.masterIncomingViewingPublicKey.y];
      artifact = {
        ...SchnorrAccountContractArtifact,
        // Artifact hash is *very* expensive to compute, so we do it here once
        // and the TXE contract data provider can cache it
        artifactHash: await computeArtifactHash(SchnorrAccountContractArtifact),
      };
      instance = await getContractInstanceFromInstantiationParams(artifact, {
        constructorArgs: args,
        skipArgsDecoding: true,
        salt: Fr.ONE,
        publicKeys: keys.publicKeys,
        constructorArtifact: 'constructor',
        deployer: AztecAddress.ZERO,
      });
      TXEArtifactsCache.set(cacheKey, { artifact, instance });
    }

    inputs.splice(0, 0, artifact, instance);
  }

  // eslint-disable-next-line camelcase
  async resolve_foreign_call(callData: TXEForeignCallInput): Promise<ForeignCallResult> {
    const { session_id: sessionId, function: functionName, inputs } = callData;
    this.logger.debug(`Calling ${functionName} on session ${sessionId}`);

    // Process special functions that need preprocessing before sending to worker
    switch (functionName) {
      case 'txeDeploy': {
        await this.#processDeployInputs(callData);
        break;
      }
      case 'txeAddAccount': {
        await this.#processAddAccountInputs(callData);
        break;
      }
    }

    // Get or create a worker for this session
    const sessionWorker = await this.getOrCreateWorker(sessionId);

    // Send the request to the worker and wait for the response
    return await this.sendToWorker(sessionWorker, sessionId, functionName, inputs);
  }
}

const TXEDispatcherApiSchema: ApiSchemaFor<TXEDispatcher> = {
  // eslint-disable-next-line camelcase
  resolve_foreign_call: z.function().args(TXEForeignCallInputSchema).returns(ForeignCallResultSchema),
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
