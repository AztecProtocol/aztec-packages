import { AztecAddress, ContractDeployer, Fr, PublicKey } from '@aztec/aztec.js';
import { ContractAbi } from '@aztec/foundation/abi';
import { AztecRPC } from '@aztec/types';

// and populate AztecRPCServerUrl;

// based on the 'deploy' command in aztec-cli
// TODO: connect the "constructor" method in the frontend to this function
export async function deployContract(
  contractAbi: ContractAbi,
  args: any, // key: value object where parameter name is the key
  publicKey: PublicKey,
  salt: Fr,
  client: AztecRPC,
): Promise<AztecAddress> {
  const constructorAbi = contractAbi.functions.find(({ name }) => name === 'constructor');
  if (!constructorAbi) {
    throw new Error('No constructor found in contract ABI');
  }
  console.log(args, publicKey, salt, client);
  const deployer = new ContractDeployer(contractAbi, client, publicKey);

  // formik stores the values in an object with the parameter name as the key
  // so we need to convert that to an array of values in the same order as the constructor parameters
  const positionalArgs = constructorAbi.parameters.map(param => args[param.name]);

  console.log(positionalArgs);
  if (constructorAbi.parameters.length !== positionalArgs.length) {
    throw new Error(
      `Invalid number of args passed (expected ${constructorAbi.parameters.length} but got ${positionalArgs.length})`,
    );
  }

  const tx = deployer.deploy(...positionalArgs).send({ contractAddressSalt: salt });
  //   debugLogger(`Deploy tx sent with hash ${await tx.getTxHash()}`);
  const deployed = await tx.wait();
  //   log(`\nContract deployed at ${deployed.contractAddress!.toString()}\n`);
  return Promise.resolve(deployed.contractAddress);
  // TODO: make the frontend remember this contract address, if we deploy this way
}
