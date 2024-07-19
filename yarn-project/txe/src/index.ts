import { loadContractArtifact } from '@aztec/aztec.js';
import { Fr } from '@aztec/foundation/fields';
import { JsonRpcServer } from '@aztec/foundation/json-rpc/server';
import { type Logger } from '@aztec/foundation/log';

import { readFile, readdir } from 'fs/promises';
import { dirname, join } from 'path';

import { TXEService } from './txe_service/txe_service.js';
import { ForeignCallArray, type ForeignCallResult, fromArray, toForeignCallResult } from './util/encoding.js';

const TXESessions = new Map<number, TXEService>();

type MethodNames<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

type TXEForeignCallInput = {
  session_id: number;
  function: MethodNames<TXEService> | 'reset';
  program_artifact_path: string;
  inputs: any[];
};

class TXEDispatcher {
  constructor(private logger: Logger) {}

  // eslint-disable-next-line camelcase
  async resolve_foreign_call({
    session_id: sessionId,
    function: functionName,
    inputs,
    program_artifact_path,
  }: TXEForeignCallInput): Promise<ForeignCallResult> {
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
        let inputPath = program_artifact_path;
        // Is not the same contract we're testing
        if (pathStr != '') {
          // Workspace
          if (pathStr.includes('@')) {
            const [workspace, pkg] = pathStr.split('@');
            const targetPath = join(dirname(inputPath), '../', workspace, './target');
            this.logger.debug(`Looking for compiled artifact in workspace ${targetPath}`);
            inputPath = join(targetPath, `${pkg}.json`);
          } else {
            // Individual contract
            const targetPath = join(dirname(inputPath), '../', pathStr, './target');
            this.logger.debug(`Looking for compiled artifact in ${targetPath}`);
            [inputPath] = (await readdir(targetPath)).filter(file => file.endsWith('.json'));
          }
        }
        this.logger.debug(`Loading compiled artifact ${inputPath}`);
        const artifact = loadContractArtifact(JSON.parse(await readFile(inputPath, 'utf-8')));
        inputs[0] = artifact;
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
