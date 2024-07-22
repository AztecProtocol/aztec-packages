import { loadContractArtifact } from '@aztec/aztec.js';
import { Fr } from '@aztec/foundation/fields';
import { JsonRpcServer } from '@aztec/foundation/json-rpc/server';
import { type Logger } from '@aztec/foundation/log';

import { readFile, readdir } from 'fs/promises';
import { join } from 'path';

import { TXEService } from './txe_service/txe_service.js';
import { type ForeignCallArray, type ForeignCallResult, fromArray, toForeignCallResult } from './util/encoding.js';

const TXESessions = new Map<number, TXEService>();

type MethodNames<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

type TXEForeignCallInput = {
  session_id: number;
  function: MethodNames<TXEService> | 'reset';
  root_path: string;
  package_name: string;
  inputs: any[];
};

class TXEDispatcher {
  constructor(private logger: Logger) {}

  /* eslint-disable camelcase */
  async resolve_foreign_call({
    session_id: sessionId,
    function: functionName,
    inputs,
    root_path,
    package_name,
  }: /* eslint-enable camelcase */
  TXEForeignCallInput): Promise<ForeignCallResult> {
    this.logger.debug(`Calling ${functionName} on session ${sessionId}`);

    if (!TXESessions.has(sessionId) && functionName != 'reset') {
      this.logger.info(`Creating new session ${sessionId}`);
      TXESessions.set(sessionId, await TXEService.init(this.logger));
    }

    if (functionName === 'reset') {
      TXESessions.delete(sessionId) &&
        this.logger.info(`Called reset on session ${sessionId}, yeeting it out of existence`);
      return toForeignCallResult([]);
    } else {
      if (functionName === 'deploy') {
        const pathStr = fromArray(inputs[0] as ForeignCallArray)
          .map(char => String.fromCharCode(char.toNumber()))
          .join('');
        const contractName = fromArray(inputs[1] as ForeignCallArray)
          .map(char => String.fromCharCode(char.toNumber()))
          .join('');
        let artifactPath = '';
        // Is not the same contract we're testing
        if (!pathStr) {
          // eslint-disable-next-line camelcase
          artifactPath = join(root_path, './target', `${package_name}-${contractName}.json`);
        } else {
          // Workspace
          if (pathStr.includes('@')) {
            const [workspace, pkg] = pathStr.split('@');
            const targetPath = join(root_path, workspace, './target');
            this.logger.debug(`Looking for compiled artifact in workspace ${targetPath}`);
            artifactPath = join(targetPath, `${pkg}-${contractName}.json`);
          } else {
            // Individual contract
            const targetPath = join(root_path, pathStr, './target');
            this.logger.debug(`Looking for compiled artifact in ${targetPath}`);
            [artifactPath] = (await readdir(targetPath)).filter(file => file.endsWith(`-${contractName}.json`));
          }
        }
        this.logger.debug(`Loading compiled artifact ${artifactPath}`);
        const artifact = loadContractArtifact(JSON.parse(await readFile(artifactPath, 'utf-8')));
        inputs.splice(0, 2, artifact);
      }
      const txeService = TXESessions.get(sessionId);
      const response = await (txeService as any)[functionName](...inputs);
      return response;
    }
  }
}

/**
 * Creates an RPC server that forwards calls to the TXE.
 * @param logger - Logger to output to
 * @returns A TXE RPC server.
 */
export function createTXERpcServer(logger: Logger) {
  return new JsonRpcServer(new TXEDispatcher(logger), { Fr }, {}, ['init']);
}
