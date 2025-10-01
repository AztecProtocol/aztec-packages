import { AuthWitness, type AztecAddress, type AztecNode, Contract } from '@aztec/aztec.js';
import { prepTx } from '@aztec/cli/utils';
import type { LogFn } from '@aztec/foundation/log';

import { format } from 'util';

import { printAuthorizations } from '../utils/authorizations.js';
import type { CLIFeeArgs } from '../utils/options/fees.js';
import { printProfileResult } from '../utils/profiling.js';
import type { CLIWallet } from '../utils/wallet.js';

export async function simulate(
  wallet: CLIWallet,
  node: AztecNode,
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
  const { paymentMethod, gasSettings } = await feeOpts.toUserFeeOptions(node, wallet, from);
  const simulationResult = await call.simulate({
    fee: { paymentMethod, gasSettings },
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
