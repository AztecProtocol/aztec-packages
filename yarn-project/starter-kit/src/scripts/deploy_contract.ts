import { AztecAddress, ContractDeployer, Fr, PublicKey } from '@aztec/aztec.js';
import { ContractAbi } from '@aztec/foundation/abi';
import { AztecRPC } from '@aztec/types';

// and populate AztecRPCServerUrl;

// based on the 'deploy' command in aztec-cli
// TODO: connect the "constructor" method in the frontend to this function
export async function deployContract(
  contractAbi: ContractAbi,
  args: any[],
  publicKey: PublicKey,
  salt: Fr,
  client: AztecRPC,
): Promise<AztecAddress> {
  const constructorAbi = contractAbi.functions.find(({ name }) => name === 'constructor');
  if (!constructorAbi) {
    throw new Error('No constructor found in contract ABI');
  }
  const deployer = new ContractDeployer(contractAbi, client, publicKey);

  if (constructorAbi.parameters.length !== args.length) {
    throw new Error(
      `Invalid number of args passed (expected ${constructorAbi.parameters.length} but got ${args.length})`,
    );
  }

  const tx = deployer.deploy(...args).send({ contractAddressSalt: salt });
  //   debugLogger(`Deploy tx sent with hash ${await tx.getTxHash()}`);
  const deployed = await tx.wait();
  //   log(`\nContract deployed at ${deployed.contractAddress!.toString()}\n`);
  return Promise.resolve(deployed.contractAddress);
}
