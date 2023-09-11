import {
  AccountWallet,
  AztecAddress,
  AztecRPC,
  CompleteAddress,
  Contract,
  getSandboxAccountsWallets,
} from '@aztec/aztec.js';
import { ContractAbi } from '@aztec/foundation/abi';
import { convertArgs } from './arg_conversion.js';

export async function callContractFunction(
  address: AztecAddress,
  abi: ContractAbi,
  functionName: string,
  args: any,
  rpc: AztecRPC,
  wallet: CompleteAddress,
) {
  const realWallets: AccountWallet[] = await getSandboxAccountsWallets(rpc);
  const selectedWallet: AccountWallet = realWallets.find(
    w => w.getAddress().toShortString() === wallet.address.toShortString(),
  )!;
  console.log('picked ', selectedWallet.getAddress());

  // TODO: switch to the generated typescript class?
  // realWallet is how we specify the sender of the transaction
  const contract = await Contract.at(address, abi, selectedWallet);

  const functionAbi = abi.functions.find(f => f.name === functionName);
  // false to skip the foundation encoder - need to look into why passing the address as an Fr fails on re-encoding
  const typedArgs = convertArgs(functionAbi!, args, false);
  const returnVal = await contract.methods[functionName](...typedArgs)
    .send()
    .wait();

  if (returnVal.error) {
    throw new Error(returnVal.error);
  }

  return `Transaction (${returnVal.txHash}) ${returnVal.status} on block ${
    returnVal.blockNumber
  } (hash ${returnVal.blockHash?.toString('hex')})!`;
}
