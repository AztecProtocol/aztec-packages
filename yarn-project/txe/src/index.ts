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
import { join } from 'path';
import { z } from 'zod';

import { TXEService } from './txe_service/txe_service.js';
import {
  type ForeignCallArgs,
  ForeignCallArgsSchema,
  type ForeignCallArray,
  type ForeignCallResult,
  ForeignCallResultSchema,
  type ForeignCallSingle,
  fromArray,
  fromSingle,
  toForeignCallResult,
  toSingle,
} from './util/encoding.js';
import type { ContractArtifactWithHash } from './util/txe_contract_data_provider.js';

const TXESessions = new Map<number, TXEService>();

/*
 * TXE typically has to load the same contract artifacts over and over again for multiple tests,
 * so we cache them here to avoid both loading them from disk repeatedly and computing their artifact hashes
 */
const TXEArtifactsCache = new Map<
  string,
  { artifact: ContractArtifactWithHash; instance: ContractInstanceWithAddress }
>();

type MethodNames<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

type TXEForeignCallInput = {
  session_id: number;
  function: MethodNames<TXEService>;
  root_path: string;
  package_name: string;
  inputs: ForeignCallArgs;
};

const TXEForeignCallInputSchema = z.object({
  // eslint-disable-next-line camelcase
  session_id: z.number().int().nonnegative(),
  function: z.string() as ZodFor<MethodNames<TXEService>>,
  // eslint-disable-next-line camelcase
  root_path: z.string(),
  // eslint-disable-next-line camelcase
  package_name: z.string(),
  inputs: ForeignCallArgsSchema,
}) satisfies ZodFor<TXEForeignCallInput>;

class TXEDispatcher {
  private protocolContracts!: ProtocolContract[];

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
    const [pathStr, contractName, initializer] = inputs.slice(0, 3).map(input =>
      fromArray(input as ForeignCallArray)
        .map(char => String.fromCharCode(char.toNumber()))
        .join(''),
    );

    const decodedArgs = fromArray(inputs[4] as ForeignCallArray);
    const secret = fromSingle(inputs[5] as ForeignCallSingle);
    const publicKeys = secret.equals(Fr.ZERO) ? PublicKeys.default() : (await deriveKeys(secret)).publicKeys;
    const publicKeysHash = await publicKeys.hash();

    let artifactPath = '';
    // We're deploying the contract under test
    // env.deploy_self("contractName")
    if (!pathStr) {
      artifactPath = join(rootPath, './target', `${packageName}-${contractName}.json`);
    } else {
      // We're deploying a contract that belongs in a workspace
      // env.deploy("../path/to/workspace/root@packageName", "contractName")
      if (pathStr.includes('@')) {
        const [workspace, pkg] = pathStr.split('@');
        const targetPath = join(rootPath, workspace, './target');
        this.logger.debug(`Looking for compiled artifact in workspace ${targetPath}`);
        artifactPath = join(targetPath, `${pkg}-${contractName}.json`);
      } else {
        // We're deploying a standalone contract
        // env.deploy("../path/to/contract/root", "contractName")
        const targetPath = join(rootPath, pathStr, './target');
        this.logger.debug(`Looking for compiled artifact in ${targetPath}`);
        [artifactPath] = (await readdir(targetPath)).filter(file => file.endsWith(`-${contractName}.json`));
      }
    }

    const fileHash = await this.fastHashFile(artifactPath);

    const cacheKey = `${pathStr}-${contractName}-${initializer}-${decodedArgs
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

    inputs.splice(0, 2, artifact, instance, toSingle(secret));
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

    if (!TXESessions.has(sessionId)) {
      this.logger.debug(`Creating new session ${sessionId}`);
      if (!this.protocolContracts) {
        this.protocolContracts = await Promise.all(
          protocolContractNames.map(name => new BundledProtocolContractsProvider().getProtocolContractArtifact(name)),
        );
      }
      TXESessions.set(sessionId, await TXEService.init(this.logger, this.protocolContracts));
    }

    switch (functionName) {
      case 'deploy': {
        await this.#processDeployInputs(callData);
        break;
      }
      case 'addAccount': {
        await this.#processAddAccountInputs(callData);
        break;
      }
    }

    const txeService = TXESessions.get(sessionId);
    const response = await (txeService as any)[functionName](...inputs);
    return response;
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
