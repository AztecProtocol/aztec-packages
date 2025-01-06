import { loadContractArtifact } from '@aztec/aztec.js';
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
  fromArray,
  toForeignCallResult,
} from './util/encoding.js';

const TXESessions = new Map<number, TXEService>();

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
    const pathStr = fromArray(inputs[0] as ForeignCallArray)
      .map(char => String.fromCharCode(char.toNumber()))
      .join('');
    const contractName = fromArray(inputs[1] as ForeignCallArray)
      .map(char => String.fromCharCode(char.toNumber()))
      .join('');
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
    const artifact = loadContractArtifact(JSON.parse(await readFile(artifactPath, 'utf-8')));
    inputs.splice(0, 2, artifact);
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
        // Modify inputs and fall through
        await this.#processDeployInputs(callData);
      }
      // eslint-disable-next-line no-fallthrough
      default: {
        const txeService = TXESessions.get(sessionId);
        const response = await (txeService as any)[functionName](...inputs);
        return response;
      }
    }
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
  return createSafeJsonRpcServer(new TXEDispatcher(logger), TXEDispatcherApiSchema);
}
