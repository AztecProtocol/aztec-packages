import { AztecAddress, CompleteAddress, DeployMethod, Fr } from '@aztec/aztec.js';
import { ContractAbi, FunctionAbi } from '@aztec/foundation/abi';
import { AztecRPC } from '@aztec/types';
import { convertArgs } from './arg_conversion.js';

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

  // hack: addresses are stored as string in the form to avoid bigint compatibility issues with formik
  // convert those back to bigints before sending
  console.log('args', args);
  const typedArgs: bigint[] = convertArgs(functionAbi, args);
  console.log(activeWallet.publicKey.toShortString());
  console.log('typedArgs', typedArgs);

  const tx = new DeployMethod(activeWallet.publicKey, client, contractAbi, typedArgs).send({
    contractAddressSalt: salt,
  });
  await tx.wait();
  const receipt = await tx.getReceipt();
  if (receipt.contractAddress) {
    return receipt.contractAddress;
  } else {
    throw new Error(`Contract not deployed (${receipt.toJSON()})`);
  }
}
