import { ContractAbi } from "@aztec/foundation/abi";
// and populate AztecRPCServerUrl;

// based on the 'deploy' command in aztec-cli
// see aztec-cli deploy command for source code
export async function deployContract(contractAbi: ContractAbi, options: any): Promise<string> {
  const contractAbi = await getContractAbi(abiPath, log);
  const constructorAbi = contractAbi.functions.find(({ name }) => name === 'constructor');

  const client = createClient(options.rpcUrl);
  const publicKey = options.publicKey ? Point.fromString(options.publicKey) : undefined;
  const salt = options.salt ? Fr.fromBuffer(Buffer.from(stripLeadingHex(options.salt), 'hex')) : undefined;
  const deployer = new ContractDeployer(contractAbi, client, publicKey);

  const constructor = getAbiFunction(contractAbi, 'constructor');
  if (!constructor) throw new Error(`Constructor not found in contract ABI`);
  if (constructor.parameters.length !== options.args.length) {
    throw new Error(
      `Invalid number of args passed (expected ${constructor.parameters.length} but got ${options.args.length})`,
    );
  }

//   debugLogger(`Input arguments: ${options.args.map((x: any) => `"${x}"`).join(', ')}`);
  const args = encodeArgs(options.args, constructorAbi!.parameters);
//   debugLogger(`Encoded arguments: ${args.join(', ')}`);

  const tx = deployer.deploy(...args).send({ contractAddressSalt: salt });
//   debugLogger(`Deploy tx sent with hash ${await tx.getTxHash()}`);
  const deployed = await tx.wait();
//   log(`\nContract deployed at ${deployed.contractAddress!.toString()}\n`);
  return Promise.resolve(deployed.contractAddress!.toString());
}
