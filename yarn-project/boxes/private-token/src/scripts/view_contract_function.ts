import { AztecAddress, AztecRPC, CompleteAddress, Contract } from '@aztec/aztec.js';
import { ContractAbi } from '@aztec/foundation/abi';
import { getWallet } from './util.js';

export async function viewContractFunction(
  address: AztecAddress,
  abi: ContractAbi,
  functionName: string,
  typedArgs: any[],
  rpc: AztecRPC,
  wallet: CompleteAddress,
) {
  // this is the aztec rpc server/client that is used to initialize the Contract object.  kinda hacky
  const selectedWallet = await getWallet(wallet, rpc);
  const contract = await Contract.at(address, abi, selectedWallet);

  // false to skip the foundation encoder - need to look into why passing the address as an Fr fails on re-encoding

  const viewResult = await contract.methods[functionName](...typedArgs).view({ from: wallet.address });
  return viewResult;
}
