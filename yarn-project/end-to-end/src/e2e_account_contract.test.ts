import { AztecNodeService } from '@aztec/aztec-node';
import { AztecRPCServer, Contract, ContractDeployer, TxStatus } from '@aztec/aztec.js';
import { ContractAbi } from '@aztec/foundation/abi';
import { DebugLogger } from '@aztec/foundation/log';
import { ChildAbi, SchnorrAccountContractAbi } from '@aztec/noir-contracts/examples';

import { toBigInt } from '@aztec/foundation/serialize';
import { setup } from './utils.js';
import { privateKey2 } from './fixtures.js';
import { SchnorrAuthProvider } from './auth.js';

describe('e2e_account_contract', () => {
  let aztecNode: AztecNodeService;
  let aztecRpcServer: AztecRPCServer;
  let logger: DebugLogger;

  let schnorrAccountContract: Contract;
  let child: Contract;

  const schnorrAuthProvider = new SchnorrAuthProvider();

  const sendContractDeployment = (abi: ContractAbi) => {
    logger(`Deploying L2 contract ${abi.name}...`);
    const deployer = new ContractDeployer(abi, aztecRpcServer);
    const deployMethod = deployer.deploy();
    const tx = deployMethod.send();

    return { tx, partialContractAddress: deployMethod.partialContractAddress! };
  };

  const deployL2Contracts = async () => {
    logger('Deploying Schnorr based Account contract');
    const schnorrDeploymentTx = sendContractDeployment(SchnorrAccountContractAbi);
    await schnorrDeploymentTx.tx.isMined(0, 0.1);

    const schnorrReceipt = await schnorrDeploymentTx.tx.getReceipt();

    schnorrAccountContract = new Contract(schnorrReceipt.contractAddress!, SchnorrAccountContractAbi, aztecRpcServer);
    logger(`L2 contract ${SchnorrAccountContractAbi.name} deployed at ${schnorrAccountContract.address}`);

    await aztecRpcServer.addAccount(
      privateKey2,
      schnorrAccountContract.address,
      schnorrDeploymentTx.partialContractAddress!,
      SchnorrAccountContractAbi,
    );

    const childDeployTx = sendContractDeployment(ChildAbi);
    await childDeployTx.tx.isMined(0, 0.1);
    const childReceipt = await childDeployTx.tx.getReceipt();
    child = new Contract(childReceipt.contractAddress!, ChildAbi, aztecRpcServer);
  };

  beforeEach(async () => {
    ({ aztecNode, aztecRpcServer, logger } = await setup(schnorrAuthProvider));
  }, 100_000);

  afterEach(async () => {
    await aztecNode.stop();
    await aztecRpcServer.stop();
  });

  it('calls a private function', async () => {
    await deployL2Contracts();
    logger('Calling private function...');
    const tx1 = child.methods.value(42).send({ from: schnorrAccountContract.address });

    const txs = [tx1];

    await Promise.all(txs.map(tx => tx.isMined(0, 0.1)));
    const receipts = await Promise.all(txs.map(tx => tx.getReceipt()));

    expect(receipts[0].status).toBe(TxStatus.MINED);
  }, 60_000);

  it('calls a public function', async () => {
    await deployL2Contracts();
    logger('Calling public function...');
    const tx1 = child.methods.pubStoreValue(42).send({ from: schnorrAccountContract.address });

    const txs = [tx1];

    await Promise.all(txs.map(tx => tx.isMined(0, 0.1)));
    const receipts = await Promise.all(txs.map(tx => tx.getReceipt()));

    expect(receipts[0].status).toBe(TxStatus.MINED);
    // The contract accumulates the values so the expected value is 95
    expect(toBigInt((await aztecNode.getStorageAt(child.address, 1n))!)).toEqual(95n);
  }, 60_000);

  // it('fails to execute function with invalid schnorr signature', async () => {
  //   logger('Registering ecdsa signer against schnorr account contract');
  //   // Set the incorrect signer for schnorr
  //   await deployL2Contracts(CurveType.GRUMPKIN, SignerType.ECDSA, CurveType.SECP256K1, SignerType.ECDSA);
  //   await expect(child.methods.value(42).create({ from: schnorrAccountContract.address })).rejects.toMatch(
  //     /could not satisfy all constraints/,
  //   );
  // }, 60_000);

  // it('fails to execute function with invalid ecdsa signature', async () => {
  //   logger('Registering schnorr signer against ecdsa account contract');
  //   // Set the incorrect signer for ecdsa
  //   await deployL2Contracts(CurveType.GRUMPKIN, SignerType.SCHNORR, CurveType.SECP256K1, SignerType.SCHNORR);
  //   await expect(child.methods.value(42).create({ from: ecdsaAccountContract.address })).rejects.toMatch(
  //     /could not satisfy all constraints/,
  //   );
  // }, 60_000);
});
