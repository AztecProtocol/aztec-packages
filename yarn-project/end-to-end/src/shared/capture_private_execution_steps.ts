/**
 * This module exposes the ability to capture the private exection steps that go into our "Client IVC" prover.
 * These are used for debugging and benchmarking barretenberg (the prover component).
 */
import type {
  ContractFunctionInteraction,
  DeployMethod,
  DeployOptions,
  ProfileMethodOptions,
} from '@aztec/aztec.js/contracts';
import { createLogger } from '@aztec/foundation/log';
import { serializePrivateExecutionSteps } from '@aztec/stdlib/kernel';

import { promises as fs } from 'fs';
import path from 'path';

const logger = createLogger('e2e:capture-private-execution-steps');

export async function capturePrivateExecutionStepsIfEnvSet(
  label: string,
  interaction: ContractFunctionInteraction | DeployMethod,
  opts?: Omit<ProfileMethodOptions & DeployOptions, 'profileMode'>,
  expectedSteps?: number,
) {
  // Not included in env_var.ts as internal to e2e tests.
  const ivcFolder = process.env.CAPTURE_IVC_FOLDER;
  if (!ivcFolder) {
    return;
  }
  const profileMode = ['execution-steps', 'full'].includes(process.env.PROFILE_MODE ?? '')
    ? (process.env.PROFILE_MODE as 'full' | 'execution-steps')
    : 'execution-steps';
  logger.info(`Capturing client ivc execution profile for ${label} in mode ${profileMode}`);
  const result = await interaction.profile({ ...opts, profileMode });
  if (expectedSteps !== undefined && result.executionSteps.length !== expectedSteps) {
    throw new Error(`Expected ${expectedSteps} execution steps, got ${result.executionSteps.length}`);
  }
  const resultsDirectory = path.join(ivcFolder, label);
  logger.info(`Writing private execution steps to ${resultsDirectory}`);
  await fs.mkdir(resultsDirectory, { recursive: true });
  // Write the client IVC files read by the prover.
  const ivcInputsPath = path.join(resultsDirectory, 'ivc-inputs.msgpack');
  await fs.writeFile(ivcInputsPath, serializePrivateExecutionSteps(result.executionSteps));
  if (profileMode === 'full') {
    // If we have gate counts, write the steps in human-readable format.
    await fs.writeFile(
      path.join(resultsDirectory, 'profile.json'),
      JSON.stringify(
        {
          timings: result.timings,
          steps: result.executionSteps.map(step => ({
            fnName: step.functionName,
            gateCount: step.gateCount,
            timings: step.timings,
          })),
        },
        null,
        2,
      ),
    );
    // In full mode, we also write the raw witnesses in a more human-readable format.
    await fs.writeFile(
      path.join(resultsDirectory, 'witnesses.json'),
      JSON.stringify(result.executionSteps.map(step => Object.fromEntries(step.witness))),
    );
  }
  logger.info(`Wrote private execution steps to ${resultsDirectory}`);
}
