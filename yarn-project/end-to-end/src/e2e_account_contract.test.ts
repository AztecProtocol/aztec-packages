import { AztecNodeService } from '@aztec/aztec-node';
import { AztecRPCServer, Contract, ContractDeployer, TxStatus } from '@aztec/aztec.js';
import { ContractAbi } from '@aztec/foundation/abi';
import { DebugLogger } from '@aztec/foundation/log';
import { ChildAbi, SchnorrAccountContractAbi } from '@aztec/noir-contracts/examples';

import { toBigInt } from '@aztec/foundation/serialize';
import { setup } from './utils.js';
import { privateKey } from './fixtures.js';
import { Grumpkin, Schnorr } from '@aztec/circuits.js/barretenberg';

describe('e2e_account_contract', () => {
  let aztecNode: AztecNodeService;
  let aztecRpcServer: AztecRPCServer;
  let logger: DebugLogger;

  let account: Contract;
  let child: Contract;

  beforeEach(async () => {
    ({ aztecNode, aztecRpcServer, logger } = await setup());

    const deploymentResult = await deployContract(SchnorrAccountContractAbi);
    account = deploymentResult.contract;
    const curve = await Grumpkin.new();
    const signer = await Schnorr.new();
    await aztecRpcServer.registerSmartAccount(
      curve,
      signer,
      privateKey,
      account.address,
      deploymentResult.partialContractAddress!,
    );

    const childDeployResult = await deployContract(ChildAbi);
    child = childDeployResult.contract;
  }, 60_000);

  afterEach(async () => {
    await aztecNode.stop();
    await aztecRpcServer.stop();
  });

  const deployContract = async (abi: ContractAbi) => {
    logger(`Deploying L2 contract ${abi.name}...`);
    const deployer = new ContractDeployer(abi, aztecRpcServer);
    const deployMethod = deployer.deploy();
    const tx = deployMethod.send();

    await tx.isMined(0, 0.1);

    const receipt = await tx.getReceipt();
    const contract = new Contract(receipt.contractAddress!, abi, aztecRpcServer);
    logger(`L2 contract ${abi.name} deployed at ${contract.address}`);
    return { contract, partialContractAddress: deployMethod.partialContractAddress };
  };

  it('calls a private function', async () => {
    const tx = child.methods.value(42).send({ from: account.address });

    await tx.isMined(0, 0.1);
    const receipt = await tx.getReceipt();

    expect(receipt.status).toBe(TxStatus.MINED);
  }, 30_000);

  it('calls a public function', async () => {
    const tx = child.methods.pubStoreValue(42).send({ from: account.address });

    await tx.isMined(0, 0.1);
    const receipt = await tx.getReceipt();

    expect(receipt.status).toBe(TxStatus.MINED);
    expect(toBigInt((await aztecNode.getStorageAt(child.address, 1n))!)).toEqual(42n);
  }, 30_000);

  // it('rejects ecdsa signature from a different key', async () => {
  //   keyStore.ecdsaSign = () => Promise.resolve(EcdsaSignature.random());
  //   await expect(child.methods.value(42).create({ from: account })).rejects.toMatch(
  //     /could not satisfy all constraints/,
  //   );
  // }, 30_000);
});
