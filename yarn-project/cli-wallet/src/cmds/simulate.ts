import { AuthWitness, type AztecAddress, Contract, type Wallet } from '@aztec/aztec.js';
import { prepTx } from '@aztec/cli/utils';
import type { LogFn } from '@aztec/foundation/log';

import { format } from 'util';

import { printAuthorizations } from '../utils/authorizations.js';
import type { CLIFeeArgs } from '../utils/options/fees.js';
import { printProfileResult } from '../utils/profiling.js';

export async function simulate(
  wallet: Wallet,
  from: AztecAddress,
  functionName: string,
  functionArgsIn: any[],
  contractArtifactPath: string,
  contractAddress: AztecAddress,
  feeOpts: CLIFeeArgs,
  authWitnesses: AuthWitness[],
  verbose: boolean,
  log: LogFn,
) {
  const { functionArgs, contractArtifact } = await prepTx(contractArtifactPath, functionName, functionArgsIn, log);

  const contract = await Contract.at(contractAddress, contractArtifact, wallet);
  const call = contract.methods[functionName](...functionArgs);
  const userFeeOptions = await feeOpts.toUserFeeOptions(wallet, from);
  const simulationResult = await call.simulate({
    fee: userFeeOptions,
    from,
    authWitnesses,
    includeMetadata: true,
  });
  if (verbose) {
    await printAuthorizations(
      simulationResult.offchainEffects!,
      async (address: AztecAddress) => {
        const metadata = await wallet.getContractMetadata(address);
        if (!metadata.contractInstance) {
          return undefined;
        }
        const classMetadata = await wallet.getContractClassMetadata(
          metadata.contractInstance.currentContractClassId,
          true,
        );
        return classMetadata.artifact;
      },
      log,
    );
    printProfileResult(simulationResult.stats!, log);
  }
  log(format('\nSimulation result: ', simulationResult.result, '\n'));
}
