import { type AccountWalletWithSecretKey, type AztecAddress, Contract } from '@aztec/aztec.js';
import { prepTx } from '@aztec/cli/utils';
import { type LogFn } from '@aztec/foundation/log';

export async function createAuthwit(
  wallet: AccountWalletWithSecretKey,
  functionName: string,
  caller: AztecAddress,
  functionArgsIn: any[],
  contractArtifactPath: string,
  contractAddress: AztecAddress,
  log: LogFn,
) {
  const { functionArgs, contractArtifact } = await prepTx(contractArtifactPath, functionName, functionArgsIn, log);

  const contract = await Contract.at(contractAddress, contractArtifact, wallet);
  const action = contract.methods[functionName](...functionArgs);

  const witness = await wallet.createAuthWit({ caller, action });

  log(`Created authorization witness for action ${functionName} on contract ${contractAddress} for caller ${caller}`);

  return witness;
}
