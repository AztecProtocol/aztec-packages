import { AztecAddress, CompleteAddress, DeployMethod, Fr } from '@aztec/aztec.js';
import { ContractAbi, FunctionAbi } from '@aztec/foundation/abi';
import { AztecRPC } from '@aztec/types';

// REMOVE THIS
/* eslint-disable @typescript-eslint/no-unused-vars */
export async function deployContract(
  activeWallet: CompleteAddress,
  contractAbi: ContractAbi,
  args: any, // key: value object where parameter name is the key.  make function generic to pass in
  salt: Fr,
  client: AztecRPC,
): Promise<AztecAddress> {
  const functionAbi: FunctionAbi | undefined = contractAbi.functions.find(f => f.name === 'constructor');
  if (functionAbi === undefined) {
    throw new Error('Cannot find constructor in the ABI.');
  }
  console.log('constructor abi', contractAbi);

  console.log('constructorArgs', args);

  console.log(functionAbi.parameters.map(x => BigInt(args[x.name])));
  const tx = new DeployMethod(
    activeWallet.publicKey,
    client,
    contractAbi,
    [BigInt(args['initial_supply']), args.owner],
    // functionAbi.parameters.map(x => BigInt(constructorArgs[x.name]))
  ).send({ contractAddressSalt: salt });
  console.log('sent, awaiting tx');
  await tx.wait();
  const receipt = await tx.getReceipt();
  console.log(`Contract Deployed: ${receipt.contractAddress}`);
  if (receipt.contractAddress) {
    return receipt.contractAddress;
  } else {
    throw new Error('Contract not deployed');
  }
  await new Promise(resolve => setTimeout(resolve, 2000));
  return AztecAddress.random();
}
