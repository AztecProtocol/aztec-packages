import { AccountWallet, getSandboxAccountsWallets } from '@aztec/aztec.js';
import { FunctionAbi, encodeArguments } from '@aztec/foundation/abi';
import { AztecRPC, CompleteAddress } from '@aztec/types';
// hack: addresses are stored as string in the form to avoid bigint compatibility issues with formik
// convert those back to bigints before sending
export function convertArgs(functionAbi: FunctionAbi, args: any, encode: boolean = true) {
  const untypedArgs = functionAbi.parameters.map(param => {
    // param => args[param.name],
    switch (param.type.kind) {
      case 'field':
        return BigInt(args[param.name]);
      default:
        console.log('not converting argument', param.name, param.type.kind, args[param.name]);
        return args[param.name];
    }
  });
  if (!encode) {
    return untypedArgs;
  }
  const typedArgs = encodeArguments(functionAbi, untypedArgs);
  return typedArgs;
}

/**
 * terminology is confusing, but the `account` points to a smart contract's public key information
 * while the "wallet" has the account's private key and is used to sign transactions
 * we need the "wallet" to actually submit transactions using the "account" identity
 * @param account
 * @param rpc
 * @returns
 */
export async function getWallet(account: CompleteAddress, rpc: AztecRPC): Promise<AccountWallet> {
  const accountWallets: AccountWallet[] = await getSandboxAccountsWallets(rpc);
  const selectedWallet: AccountWallet = accountWallets.find(w => w.getAddress().equals(account.address))!;
  if (!selectedWallet) {
    throw new Error(`Wallet for account ${account.address.toShortString()} not found in the RPC server.`);
  }
  return selectedWallet;
}
