import { AztecAddress, AztecRPC, CompleteAddress, Contract } from '@aztec/aztec.js';
import { ContractAbi } from '@aztec/foundation/abi';
import { convertArgs, getWallet } from './util.js';

export async function callContractFunction(
  address: AztecAddress,
  abi: ContractAbi,
  functionName: string,
  args: any,
  rpc: AztecRPC,
  wallet: CompleteAddress,
) {
  const selectedWallet = await getWallet(wallet, rpc);

  // TODO: switch to the generated typescript class?
  // selectedWallet is how we specify the "sender" of the transaction
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
