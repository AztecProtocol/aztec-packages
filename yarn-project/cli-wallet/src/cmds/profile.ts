import { AuthWitness, type AztecAddress, type AztecNode, Contract } from '@aztec/aztec.js';
import { prepTx } from '@aztec/cli/utils';
import type { LogFn } from '@aztec/foundation/log';
import { serializePrivateExecutionSteps } from '@aztec/stdlib/kernel';

import { promises as fs } from 'fs';
import path from 'path';

import type { CLIFeeArgs } from '../utils/options/fees.js';
import { printProfileResult } from '../utils/profiling.js';
import type { CLIWallet } from '../utils/wallet.js';

export async function profile(
  wallet: CLIWallet,
  node: AztecNode,
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

  const { paymentMethod, gasSettings } = await feeOpts.toUserFeeOptions(node, wallet, from);
  const result = await call.profile({
    fee: { gasSettings, paymentMethod },
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
