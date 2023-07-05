import { AztecNodeService } from '@aztec/aztec-node';
import {
  AccountContract,
  AccountWallet,
  AztecAddress,
  AztecRPCServer,
  Contract,
  ContractDeployer,
  Fr,
  TxStatus,
  generatePublicKey,
  getContractDeploymentInfo,
} from '@aztec/aztec.js';
import { ContractAbi } from '@aztec/foundation/abi';
import { DebugLogger } from '@aztec/foundation/log';
import { ChildAbi, SchnorrAccountContractAbi } from '@aztec/noir-contracts/examples';

import { Schnorr } from '@aztec/circuits.js/barretenberg';
import { PublicKey } from '@aztec/key-store';
import { SchnorrAuthProvider } from './auth.js';
import { privateKey2 } from './fixtures.js';
import { setup } from './utils.js';
import { CircuitsWasm } from '@aztec/circuits.js';
import { toBigInt } from '@aztec/foundation/serialize';

describe('e2e_account_contract', () => {
  let aztecNode: AztecNodeService;
  let aztecRpcServer: AztecRPCServer;
  let logger: DebugLogger;

  let schnorrAccountContractAddress: AztecAddress;
  let child: Contract;

  const sendContractDeployment = async (publicKey: PublicKey, abi: ContractAbi) => {
    logger(`Deploying L2 contract ${abi.name}...`);
    const deployer = new ContractDeployer(abi, aztecRpcServer, publicKey);
    const deployMethod = deployer.deploy();
    await deployMethod.create();
    const tx = deployMethod.send();
    await tx.isMined(0, 0.1);

    return { tx, partialContractAddress: deployMethod.partialContractAddress! };
  };

  const deployL2Contracts = async () => {
    logger('Deploying Schnorr based Account contract');
    const publicKey = await generatePublicKey(privateKey2);
    const contractDeploymentInfo = await getContractDeploymentInfo(SchnorrAccountContractAbi, [], Fr.ZERO, publicKey);
    await aztecRpcServer.addAccount(
      privateKey2,
      contractDeploymentInfo.address,
      contractDeploymentInfo.partialAddress,
      SchnorrAccountContractAbi,
    );
    const schnorrDeploymentTx = await sendContractDeployment(publicKey, SchnorrAccountContractAbi);
    await schnorrDeploymentTx.tx.isMined(0, 0.1);

    schnorrAccountContractAddress = contractDeploymentInfo.address;
    logger(`L2 contract ${SchnorrAccountContractAbi.name} deployed at ${schnorrAccountContractAddress}`);

    const wallet = new AccountWallet(
      aztecRpcServer,
      new AccountContract(
        schnorrAccountContractAddress,
        publicKey,
        new SchnorrAuthProvider(await Schnorr.new(), privateKey2),
        contractDeploymentInfo.partialAddress,
        SchnorrAccountContractAbi,
        await CircuitsWasm.get(),
      ),
    );

    const childDeployTx = await sendContractDeployment(publicKey, ChildAbi);
    await childDeployTx.tx.isMined(0, 0.1);
    const childReceipt = await childDeployTx.tx.getReceipt();
    child = new Contract(childReceipt.contractAddress!, ChildAbi, wallet);
  };

  beforeEach(async () => {
    ({ aztecNode, aztecRpcServer, logger } = await setup(0));
  }, 100_000);

  afterEach(async () => {
    await aztecNode.stop();
    await aztecRpcServer.stop();
  });

  it('calls a private function', async () => {
    await deployL2Contracts();
    logger('Calling private function...');
    const tx1 = child.methods.value(42).send({ from: schnorrAccountContractAddress });

    const txs = [tx1];

    await Promise.all(txs.map(tx => tx.isMined(0, 0.1)));
    const receipts = await Promise.all(txs.map(tx => tx.getReceipt()));

    expect(receipts[0].status).toBe(TxStatus.MINED);
  }, 60_000);

  it('calls a public function', async () => {
    await deployL2Contracts();
    logger('Calling public function...');
    const tx1 = child.methods.pubStoreValue(42).send({ from: schnorrAccountContractAddress });
    const tx2 = child.methods.pubStoreValue(15).send({ from: schnorrAccountContractAddress });

    const txs = [tx1, tx2];

    await Promise.all(txs.map(tx => tx.isMined(0, 0.1)));
    const receipts = await Promise.all(txs.map(tx => tx.getReceipt()));

    expect(receipts[0].status).toBe(TxStatus.MINED);
    expect(receipts[1].status).toBe(TxStatus.MINED);
    // The contract accumulates the values so the expected value is 95
    expect(toBigInt((await aztecNode.getStorageAt(child.address, 1n))!)).toEqual(57n);
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
