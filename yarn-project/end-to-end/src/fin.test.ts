import { AztecNodeService } from '@aztec/aztec-node';
import {
  AztecAddress,
  AztecRPCServer,
  Contract,
  ContractDeployer,
  CurveType,
  Fr,
  Point,
  SentTx,
  SignerType,
} from '@aztec/aztec.js';
import {
  ConsumerFinanceContractAbi,
  GullibleAccountContractAbi,
  ZkTokenContractAbi,
} from '@aztec/noir-contracts/examples';
import { DebugLogger } from '@aztec/foundation/log';

import { pointToPublicKey, setup } from './utils.js';

describe('basic payroll in valencia', () => {
  let aztecNode: AztecNodeService;
  let aztecRpcServer: AztecRPCServer;
  let accounts: AztecAddress[];
  let logger: DebugLogger;
  let owner: Point;
  let ownerAddress: AztecAddress;

  let contract: Contract;

  beforeEach(async () => {
    ({ aztecNode, aztecRpcServer, accounts, logger } = await setup(2));
    owner = await aztecRpcServer.getAccountPublicKey(accounts[0]);
    ownerAddress = accounts[0];
  }, 100_000);

  afterEach(async () => {
    await aztecNode?.stop();
    await aztecRpcServer?.stop();
  });

  const deployContract = async (initialNote1 = 0n, owner = { x: 0n, y: 0n }) => {
    logger(`Deploying token contract...`);
    const deployer = new ContractDeployer(ZkTokenContractAbi, aztecRpcServer);
    const tx = deployer.deploy(initialNote1, owner).send();
    const receipt = await tx.getReceipt();
    contract = new Contract(receipt.contractAddress!, ZkTokenContractAbi, aztecRpcServer);
    await tx.isMined(0, 0.1);
    await tx.getReceipt();
    logger('L2 contract deployed');
    return contract;
  };

  const deployFinContract = async () => {
    logger(`Deploying payroll contract...`);
    const deployer = new ContractDeployer(ConsumerFinanceContractAbi, aztecRpcServer);
    const tx = deployer.deploy().send();
    const receipt = await tx.getReceipt();
    contract = new Contract(receipt.contractAddress!, ConsumerFinanceContractAbi, aztecRpcServer);
    await tx.isMined(0, 0.1);
    await tx.getReceipt();
    logger('L2 contract deployed');
    return contract;
  };

  const expectBalance = async (tokenContract: Contract, owner: AztecAddress, expectedBalance: bigint) => {
    const ownerPublicKey = await aztecRpcServer.getAccountPublicKey(owner);
    const [balance] = await tokenContract.methods.getBalance(pointToPublicKey(ownerPublicKey)).view({ from: owner });
    logger(`Account ${owner} balance: ${balance}`);
    expect(balance).toBe(expectedBalance);
  };

  const createAccounts = async (numberOfAccounts: number) => {
    const points: Point[] = [];
   
    for (let i = 0; i < numberOfAccounts; ++i) {
      // We use the well-known private key and the validating account contract for the first account,
      // and generate random keypairs with gullible account contracts (ie no sig validation) for the rest.
      // TODO(#662): Let the aztec rpc server generate the keypair rather than hardcoding the private key
      const [privKey, impl] = [undefined, GullibleAccountContractAbi];
      const [txHash, newAddress] = await aztecRpcServer.createSmartAccount(
        privKey,
        CurveType.GRUMPKIN,
        SignerType.SCHNORR,
        impl,
      );
      const isMined = await new SentTx(aztecRpcServer, Promise.resolve(txHash)).isMined();
      expect(isMined).toBeTruthy();
      const address = newAddress;
      const pubKey = await aztecRpcServer.getAccountPublicKey(address);
      points.push(pubKey);
      logger(`Created account ${address.toString()} with public key ${pubKey.toString()}`);
    }
    return points;
  }


  it('Credit Score for US goverment using Aztec noir privacy based smart contracts', async () => {
    const initialNote1 = 30n; 
    const initialNote2 = 45n;
    logger(`Deploying L2 contract...`)
    const zkContract = await deployContract(initialNote1, pointToPublicKey(owner));
    const finContract = await deployFinContract();

     // create another note for the owner:
     logger(`Giving the sender another note...`);
     // done because only after tx goes through circuits, state is upadted. Until then, if you fetch notes for the 2nd batch transfer, `get_notes` fetches the same notes and spends that instead.
     // So in our contract, we hard-core and tell the token to spend the other note.
     const tx = zkContract.methods.mint(45n, owner).send({ from: ownerAddress });
     await tx.isMined(0, 0.5);
     await tx.getReceipt();
     // call getBalance on zkContract for the owner:
    await expectBalance(zkContract, ownerAddress, initialNote1 + initialNote2);
 
    logger(`create some user accounts`)
    const numberOfAccounts = 6;
    const points = await createAccounts(numberOfAccounts);

    const amounts: bigint[] = [4n, 3n, 2n, 4n, 3n, 2n];
    const amountSum = amounts.reduce((a, b) => a + b, 0n);

    logger(`processPayroll()...`);
    const batchTransferTx = finContract.methods
      .processPayroll(
        zkContract.address.toField(),
        points,
        amounts,
        owner,
        Fr.fromBuffer(zkContract.methods.batchTransfer.selector),
      )
      .send({ from: ownerAddress });
    // const batchTransferTx = zkContract.methods.batchTransfer(owner, amounts, points, true).send({ from: ownerAddress });
    await batchTransferTx.isMined(0, 0.5);
    const batchTransferTxReceipt = await batchTransferTx.getReceipt();
    logger(`Consumption Receipt status: ${batchTransferTxReceipt.status}`);
    await expectBalance(zkContract, ownerAddress, initialNote1 + initialNote2 - amountSum);
  }, 240_000);
});
