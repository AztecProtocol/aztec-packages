import { AuthWitness, type AztecAddress, Contract, type Wallet } from '@aztec/aztec.js';
import { prepTx } from '@aztec/cli/utils';
import type { LogFn } from '@aztec/foundation/log';
import { serializePrivateExecutionSteps } from '@aztec/stdlib/kernel';

import { promises as fs } from 'fs';
import path from 'path';

import type { CLIFeeArgs } from '../utils/options/fees.js';
import { printProfileResult } from '../utils/profiling.js';

export async function profile(
  wallet: Wallet,
  from: AztecAddress,
  functionName: string,
  functionArgsIn: any[],
  contractArtifactPath: string,
  contractAddress: AztecAddress,
  debugOutputPath: string | undefined,
  feeOpts: CLIFeeArgs,
  authWitnesses: AuthWitness[],
  log: LogFn,
) {
  const { functionArgs, contractArtifact } = await prepTx(contractArtifactPath, functionName, functionArgsIn, log);

  const contract = await Contract.at(contractAddress, contractArtifact, wallet);
  const call = contract.methods[functionName](...functionArgs);

  const result = await call.profile({
    fee: await feeOpts.toUserFeeOptions(wallet, from),
    from,
    profileMode: 'full',
    authWitnesses,
    skipProofGeneration: false,
  });
  printProfileResult(result.stats, log, true, result.executionSteps);
  if (debugOutputPath) {
    const ivcInputsPath = path.join(debugOutputPath, 'ivc-inputs.msgpack');
    log(`Debug output written to ${ivcInputsPath}.`);
    await fs.writeFile(ivcInputsPath, serializePrivateExecutionSteps(result.executionSteps));
  }
}
