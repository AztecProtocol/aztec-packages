import { AztecNodeService } from '@aztec/aztec-node';
import { AztecRPCServer, Contract, ContractDeployer, CurveType, SignerType, TxStatus } from '@aztec/aztec.js';
import { ContractAbi } from '@aztec/foundation/abi';
import { DebugLogger } from '@aztec/foundation/log';
import { ChildAbi, EcdsaAccountContractAbi, SchnorrAccountContractAbi } from '@aztec/noir-contracts/examples';

import { toBigInt } from '@aztec/foundation/serialize';
import { setup } from './utils.js';
import { privateKey } from './fixtures.js';

describe('e2e_account_contract', () => {
  let aztecNode: AztecNodeService;
  let aztecRpcServer: AztecRPCServer;
  let logger: DebugLogger;

  let schnorrAccountContract: Contract;
  let ecdsaAccountContract: Contract;
  let child: Contract;

  beforeEach(async () => {
    ({ aztecNode, aztecRpcServer, logger } = await setup());

    logger('Deploying Schnorr based Account contract');
    const schnorrDeploymentResult = await deployContract(SchnorrAccountContractAbi);
    schnorrAccountContract = schnorrDeploymentResult.contract;
    await aztecRpcServer.registerSmartAccount(
      privateKey,
      schnorrAccountContract.address,
      schnorrDeploymentResult.partialContractAddress!,
      CurveType.GRUMPKIN,
      SignerType.SCHNORR,
      SchnorrAccountContractAbi,
    );

    logger('Deploying ECDSA based Account contract');
    const ecdsaDeploymentResult = await deployContract(EcdsaAccountContractAbi);
    ecdsaAccountContract = ecdsaDeploymentResult.contract;
    await aztecRpcServer.registerSmartAccount(
      privateKey,
      ecdsaAccountContract.address,
      ecdsaDeploymentResult.partialContractAddress!,
      CurveType.SECP256K1,
      SignerType.ECDSA,
      EcdsaAccountContractAbi,
    );

    const childDeployResult = await deployContract(ChildAbi);
    child = childDeployResult.contract;
  }, 100_000);

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
    logger('Calling private function...');
    const tx1 = child.methods.value(42).send({ from: schnorrAccountContract.address });
    const tx2 = child.methods.value(53).send({ from: ecdsaAccountContract.address });

    const txs = [tx1, tx2];

    await Promise.all(txs.map(tx => tx.isMined(0, 0.1)));
    const receipts = await Promise.all(txs.map(tx => tx.getReceipt()));

    expect(receipts[0].status).toBe(TxStatus.MINED);
    expect(receipts[1].status).toBe(TxStatus.MINED);
  }, 60_000);

  it('calls a public function', async () => {
    logger('Calling public function...');
    const tx1 = child.methods.pubStoreValue(42).send({ from: schnorrAccountContract.address });
    const tx2 = child.methods.pubStoreValue(53).send({ from: ecdsaAccountContract.address });

    const txs = [tx1, tx2];

    await Promise.all(txs.map(tx => tx.isMined(0, 0.1)));
    const receipts = await Promise.all(txs.map(tx => tx.getReceipt()));

    expect(receipts[0].status).toBe(TxStatus.MINED);
    expect(receipts[1].status).toBe(TxStatus.MINED);
    // The contract accumulates the values so the expected value is 95
    expect(toBigInt((await aztecNode.getStorageAt(child.address, 1n))!)).toEqual(95n);
  }, 60_000);

  // it('rejects ecdsa signature from a different key', async () => {
  //   const oldFunc = ecdsaSigner.constructSignature;
  //   ecdsaSigner.constructSignature = () => EcdsaSignature.random();
  //   await expect(child.methods.value(42).create({ from: ecdsaAccountContract.address })).rejects.toMatch(
  //     /could not satisfy all constraints/,
  //   );
  //   ecdsaSigner.constructSignature = oldFunc;
  // }, 30_000);

  // // TODO: Enable this once we understand why schnorr signatures appear to never fail
  // it.skip('rejects schnorr signature from a different key', async () => {
  //   const oldFunc = schnorrSigner.constructSignature;
  //   schnorrSigner.constructSignature = () => SchnorrSignature.random();
  //   await expect(child.methods.value(42).create({ from: schnorrAccountContract.address })).rejects.toMatch(
  //     /could not satisfy all constraints/,
  //   );
  //   schnorrSigner.constructSignature = oldFunc;
  // }, 30_000);
});
