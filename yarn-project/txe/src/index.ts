import { SchnorrAccountContractArtifact } from '@aztec/accounts/schnorr';
import {
  AztecAddress,
  type ContractArtifact,
  type ContractInstanceWithAddress,
  Fr,
  PublicKeys,
  deriveKeys,
  getContractInstanceFromDeployParams,
  loadContractArtifact,
} from '@aztec/aztec.js';
import { createSafeJsonRpcServer } from '@aztec/foundation/json-rpc/server';
import { type Logger } from '@aztec/foundation/log';
import { type ApiSchemaFor, type ZodFor } from '@aztec/foundation/schemas';

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

const TXESessions = new Map<number, TXEService>();

const TXEArtifactsCache = new Map<string, { artifact: ContractArtifact; instance: ContractInstanceWithAddress }>();

type MethodNames<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

type TXEForeignCallInput = {
  session_id: number;
  function: MethodNames<TXEService> | 'reset';
  root_path: string;
  package_name: string;
  inputs: ForeignCallArgs;
};

const TXEForeignCallInputSchema = z.object({
  // eslint-disable-next-line camelcase
  session_id: z.number(),
  function: z.string() as ZodFor<MethodNames<TXEService> | 'reset'>,
  // eslint-disable-next-line camelcase
  root_path: z.string(),
  // eslint-disable-next-line camelcase
  package_name: z.string(),
  inputs: ForeignCallArgsSchema,
}) satisfies ZodFor<TXEForeignCallInput>;

class TXEDispatcher {
  constructor(private logger: Logger) {}

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

    const cacheKey = `${pathStr}-${contractName}-${initializer}-${decodedArgs
      .map(arg => arg.toString())
      .join('-')}-${publicKeysHash.toString()}`;

    let artifact;
    let instance;

    if (TXEArtifactsCache.has(cacheKey)) {
      this.logger.debug(`Using cached artifact for ${cacheKey}`);
      ({ artifact, instance } = TXEArtifactsCache.get(cacheKey)!);
    } else {
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
      this.logger.debug(`Loading compiled artifact ${artifactPath}`);
      artifact = loadContractArtifact(JSON.parse(await readFile(artifactPath, 'utf-8')));
      this.logger.debug(
        `Deploy ${
          artifact.name
        } with initializer ${initializer}(${decodedArgs}) and public keys hash ${publicKeysHash.toString()}`,
      );
      instance = await getContractInstanceFromDeployParams(artifact, {
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

    let artifact;
    let instance;

    if (TXEArtifactsCache.has(cacheKey)) {
      this.logger.debug(`Using cached artifact for ${cacheKey}`);
      ({ artifact, instance } = TXEArtifactsCache.get(cacheKey)!);
    } else {
      const keys = await deriveKeys(secret);
      const args = [keys.publicKeys.masterIncomingViewingPublicKey.x, keys.publicKeys.masterIncomingViewingPublicKey.y];
      artifact = SchnorrAccountContractArtifact;
      instance = await getContractInstanceFromDeployParams(artifact, {
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

    if (!TXESessions.has(sessionId) && functionName != 'reset') {
      this.logger.debug(`Creating new session ${sessionId}`);
      TXESessions.set(sessionId, await TXEService.init(this.logger));
    }

    switch (functionName) {
      case 'reset': {
        TXESessions.delete(sessionId) &&
          this.logger.debug(`Called reset on session ${sessionId}, yeeting it out of existence`);
        return toForeignCallResult([]);
      }
      case 'deploy': {
        await this.#processDeployInputs(callData);
        break;
      }
      // Is this where the oracle call to `addAccount` ends up? The destination of
      // the oracle call can't be TxeService.addAccount, because the params aren't the
      // same -- the oracle call only has a `secret` as a param, which matches the
      // param of processAddAccountInputs.
      // If so, how is TxeService.addAccount reached?
      case 'addAccount': {
        await this.#processAddAccountInputs(callData);
        break;
      }
    }

    const txeService = TXESessions.get(sessionId);
    // Why are some functionNames captured by the `switch` statement above, before
    // being called here? Comments needed, please.
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
