/* eslint-disable jsdoc/require-jsdoc */
import { updateProject } from '@aztec/builder';
import { type LogFn } from '@aztec/foundation/log';

export async function update(
  projectPath: string,
  contracts: string[],
  aztecVersion: string,
  log: LogFn,
): Promise<void> {
  updateProject(projectPath, contracts, aztecVersion, log);
}
