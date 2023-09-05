import { AztecAddress, AztecRPC, CompleteAddress, Contract, Fr, getSandboxAccountsWallet } from '@aztec/aztec.js';
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
  // todo: pass this in?
  const realWallet = await getSandboxAccountsWallet(rpc);
  console.log('wallet', realWallet);
  const contract = await Contract.at(address, abi, realWallet);

  const functionAbi = abi.functions.find(f => f.name === functionName);
  console.log('functionAbi', functionAbi);
  args = convertArgs(functionAbi!, args);

  console.log('args', args);
  console.log('address buffer', wallet.address.toBuffer());

  const balance = await contract.methods[functionName](wallet.address).view({ from: wallet.address });
  // const balance = await contract.methods.getBalance(wallet.address).view({ from: wallet.address });
  return balance;
  await new Promise(resolve => setTimeout(resolve, 2000));
  return [Fr.random()];
}
