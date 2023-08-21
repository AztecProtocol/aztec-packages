import { ContractDeployer } from '@aztec/aztec.js';

/**
 * NOT WORKING/TESTED YET - need sandbox, anvil, etc up and running
 * as well as proper use of aztec.js
 * Deploys a contract to the RPC server.
 * @param req
 * @param res
 */
export async function POST(req, res) {
  const { contractAbi, constructorArgs, aztecRpcServer } = req.body;
  const deployer = new ContractDeployer(contractAbi, aztecRpcServer);
  const tx = deployer.deploy(constructorArgs[0], constructorArgs[1]).send();
  await tx.isMined();
  console.log('Contract deployed!');

  const receipt = await tx.getReceipt();
  console.log(`Contract address: ${receipt.contractAddress}`);
  res.status(200).json({ contractAddress: receipt.contractAddress });
}
