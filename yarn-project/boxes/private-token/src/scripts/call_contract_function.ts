import { AztecAddress, AztecRPC, CompleteAddress, Contract, getSandboxAccountsWallet } from '@aztec/aztec.js';
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
  const realWallet = await getSandboxAccountsWallet(rpc);
  // TODO: switch to the generated typescript class?
  const contract = await Contract.at(address, abi, realWallet);

  const functionAbi = abi.functions.find(f => f.name === functionName);
  // false to skip the foundation encoder - need to look into why passing the address as an Fr fails on re-encoding
  const typedArgs = convertArgs(functionAbi!, args, false);
  // TODO: put in actual function instead of hardcoded test method
  const returnVal = await contract.methods[functionName](...typedArgs)
    // const returnVal = await contract.methods
    // .transfer(...typedArgs)
    .send({ origin: wallet.address })
    .wait();

  if (returnVal.error) {
    throw new Error(returnVal.error);
  }

  return `Transaction (${returnVal.txHash}) ${returnVal.status} on block ${
    returnVal.blockNumber
  } (hash ${returnVal.blockHash?.toString('hex')})!`;
}
