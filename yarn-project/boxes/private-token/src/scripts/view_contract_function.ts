import { AztecAddress, CompleteAddress, Contract, ContractAbi, PXE } from '@aztec/aztec.js';
import { getWallet } from './util.js';

export async function viewContractFunction(
  address: AztecAddress,
  abi: ContractAbi,
  functionName: string,
  typedArgs: any[],
  pxe: PXE,
  wallet: CompleteAddress,
) {
  // we specify the account that is calling the view function by passing in the wallet to the Contract
  const selectedWallet = await getWallet(wallet, pxe);
  const contract = await Contract.at(address, abi, selectedWallet);

  return await contract.methods[functionName](...typedArgs).view({ from: wallet.address });
}
