import { type AccountWalletWithSecretKey, AuthWitness, type AztecAddress, Contract } from '@aztec/aztec.js';
import { prepTx } from '@aztec/cli/utils';
import type { LogFn } from '@aztec/foundation/log';

import { format } from 'util';

import { printAuthorizations } from '../utils/authorizations.js';
import type { IFeeOpts } from '../utils/options/fees.js';
import { printProfileResult } from '../utils/profiling.js';

export async function simulate(
  wallet: AccountWalletWithSecretKey,
  functionName: string,
  functionArgsIn: any[],
  contractArtifactPath: string,
  contractAddress: AztecAddress,
  feeOpts: IFeeOpts,
  authWitnesses: AuthWitness[],
  verbose: boolean,
  log: LogFn,
) {
  const { functionArgs, contractArtifact } = await prepTx(contractArtifactPath, functionName, functionArgsIn, log);

  const contract = await Contract.at(contractAddress, contractArtifact, wallet);
  const call = contract.methods[functionName](...functionArgs);
  const simulationResult = await call.simulate({
    ...(await feeOpts.toSendOpts(wallet)),
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
