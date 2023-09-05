import { AztecAddress, AztecRPC, CompleteAddress, Contract, getSandboxAccountsWallet } from '@aztec/aztec.js';
import { ContractAbi } from '@aztec/foundation/abi';
import { convertArgs } from './arg_conversion.js';

// REMOVE THIS
/* eslint-disable @typescript-eslint/no-unused-vars */
export async function viewContractFunction(
  address: AztecAddress,
  abi: ContractAbi,
  functionName: string,
  args: any,
  rpc: AztecRPC,
  wallet: CompleteAddress,
) {
  // TODO: pass this in?
  const realWallet = await getSandboxAccountsWallet(rpc);
  // console.log('wallet', realWallet);
  const contract = await Contract.at(address, abi, realWallet);

  const functionAbi = abi.functions.find(f => f.name === functionName);
  // false to skip the foundation encoder - need to look into why passing the address as an Fr fails on re-encoding
  const typedArgs = convertArgs(functionAbi!, args, false);

  // console.log('address buffer', wallet.address.toBuffer());
  console.log('viewing from wallet', wallet.address.toString());

  const balance = await contract.methods[functionName](...typedArgs).view({ from: wallet.address });
  // hardcoded versions that work:
  // const balance = await contract.methods[functionName](wallet.address).view({ from: wallet.address });
  // const balance = await contract.methods.getBalance(wallet.address).view({ from: wallet.address });
  return balance;
}
