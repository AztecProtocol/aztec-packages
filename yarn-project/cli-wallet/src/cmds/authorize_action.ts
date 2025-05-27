import { type AccountWalletWithSecretKey, type AztecAddress, Contract } from '@aztec/aztec.js';
import { prepTx } from '@aztec/cli/utils';
import type { LogFn } from '@aztec/foundation/log';

import { DEFAULT_TX_TIMEOUT_S } from '../utils/pxe_wrapper.js';

export async function authorizeAction(
  wallet: AccountWalletWithSecretKey,
  functionName: string,
  caller: AztecAddress,
  functionArgsIn: any[],
  contractArtifactPath: string,
  contractAddress: AztecAddress,
  log: LogFn,
) {
  const { functionArgs, contractArtifact, isPrivate } = await prepTx(
    contractArtifactPath,
    functionName,
    functionArgsIn,
    log,
  );

  if (isPrivate) {
    throw new Error(
      'Cannot authorize private function. To allow a third party to call a private function, please create an authorization witness via the create-authwit command',
    );
  }

  const contract = await Contract.at(contractAddress, contractArtifact, wallet);
  const action = contract.methods[functionName](...functionArgs);

  const setAuthwitnessInteraction = await wallet.setPublicAuthWit({ caller, action }, true);
  const witness = await setAuthwitnessInteraction.send().wait({ timeout: DEFAULT_TX_TIMEOUT_S });

  log(`Authorized action ${functionName} on contract ${contractAddress} for caller ${caller}`);

  return witness;
}
