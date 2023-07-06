import { AztecNodeService } from '@aztec/aztec-node';
import {
  AccountWallet,
  AztecRPCServer,
  Contract,
  ContractDeployer,
  Fr,
  TouchIdAccountContract,
  TxStatus,
  Wallet,
  getContractDeploymentInfo,
} from '@aztec/aztec.js';
import { ContractAbi } from '@aztec/foundation/abi';
import { DebugLogger } from '@aztec/foundation/log';
import { ChildAbi, TouchIdAccountContractAbi } from '@aztec/noir-contracts/examples';

import { CircuitsWasm, Point } from '@aztec/circuits.js';
import { PublicKey } from '@aztec/key-store';
import { privateKey2 } from './fixtures.js';
import { setup } from './utils.js';

describe('e2e_touch_id_account_contract', () => {
  let aztecNode: AztecNodeService;
  let aztecRpcServer: AztecRPCServer;
  let logger: DebugLogger;
  let child: Contract;

  const joesPublicKey = Buffer.from(
    '04505ab9f4e332f2b35f15d42854430aa25ca867ee4d8da641a1b644f493a6b400fe52c61fac7820c4ab6ee60ec7c3396dc14bd3b3c57662d24c0c1a27089f1405',
    'hex',
  );

  const sendContractDeployment = async (publicKey: PublicKey, abi: ContractAbi, contractAddressSalt: Fr) => {
    logger(`Deploying L2 contract ${abi.name}...`);
    const deployer = new ContractDeployer(abi, aztecRpcServer, publicKey);
    const deployMethod = deployer.deploy();
    await deployMethod.create({ contractAddressSalt });
    const tx = deployMethod.send();
    expect(await tx.isMined(0, 0.1)).toBeTruthy();

    return { tx, partialContractAddress: deployMethod.partialContractAddress! };
  };

  const deployAccountContract = async (abi: ContractAbi, publicKey: PublicKey, privateKey: Buffer) => {
    const contractAddressSalt = Fr.random();
    const contractDeploymentInfo = await getContractDeploymentInfo(abi, [], contractAddressSalt, publicKey);
    await aztecRpcServer.addAccount(
      privateKey,
      contractDeploymentInfo.address,
      contractDeploymentInfo.partialAddress,
      abi,
    );
    const accountDeploymentTx = await sendContractDeployment(publicKey, abi, contractAddressSalt);
    expect(await accountDeploymentTx.tx.isMined(0, 0.1)).toBeTruthy();

    const accountImpl = new TouchIdAccountContract(
      contractDeploymentInfo.address,
      publicKey,
      contractDeploymentInfo.partialAddress,
      abi,
      await CircuitsWasm.get(),
    );

    await accountImpl.init();

    const wallet = new AccountWallet(aztecRpcServer, accountImpl);

    return {
      contractAddress: contractDeploymentInfo.address,
      wallet,
    };
  };

  const deployChildContract = async (publicKey: Point, wallet: Wallet) => {
    const contractAddressSalt = Fr.random();
    const childDeployTx = await sendContractDeployment(publicKey, ChildAbi, contractAddressSalt);
    await childDeployTx.tx.isMined(0, 0.1);
    const childReceipt = await childDeployTx.tx.getReceipt();
    expect(childReceipt.status).toEqual(TxStatus.MINED);
    return new Contract(childReceipt.contractAddress!, ChildAbi, wallet);
  };

  const deployAll = async () => {
    logger('Deploying account contract...');
    const { contractAddress: accountAddress, wallet } = await deployAccountContract(
      TouchIdAccountContractAbi,
      Point.fromBuffer(joesPublicKey),
      privateKey2,
    );

    logger('Deploying child contract...');
    child = await deployChildContract(Point.fromBuffer(joesPublicKey), wallet);
    logger(`Account contract at ${accountAddress.toString()}, child contract at ${child.address.toString()}`);

    return {
      child,
      accountAddress,
    };
  };

  beforeEach(async () => {
    ({ aztecNode, aztecRpcServer, logger } = await setup(0));
  }, 100_000);

  afterEach(async () => {
    await aztecNode.stop();
    await aztecRpcServer.stop();
  });

  it('calls a private function', async () => {
    const { child, accountAddress } = await deployAll();

    logger('Calling private function...');
    const tx = child.methods.value(42).send({ from: accountAddress });
    await tx.isMined(0, 0.1);
    const receipt = await tx.getReceipt();
    expect(receipt.status).toBe(TxStatus.MINED);
  }, 300_000);
});
