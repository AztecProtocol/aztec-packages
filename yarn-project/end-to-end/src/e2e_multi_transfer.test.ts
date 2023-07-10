import { AztecNodeService } from '@aztec/aztec-node';
import {
  AztecAddress,
  AztecRPCServer,
  Contract,
  ContractDeployer,
  Fr,
  Point,
  Wallet,
} from '@aztec/aztec.js';
import {
  MultiTransferContractAbi,
  ZkTokenContractAbi,
} from '@aztec/noir-contracts/examples';
import { DebugLogger } from '@aztec/foundation/log';

import { pointToPublicKey, setup } from './utils.js';

describe('multi-transfer payments', () => {
  const numberOfAccounts = 6;

  let aztecNode: AztecNodeService;
  let aztecRpcServer: AztecRPCServer;
  let wallet: Wallet;
  let accounts: AztecAddress[];
  let logger: DebugLogger;

  let owner: Point;
  let ownerAddress: AztecAddress;

  const points: Point[] = [];
  const recipients: AztecAddress[] = [];

  beforeEach(async () => {
    ({ aztecNode, aztecRpcServer, accounts, logger, wallet } = await setup(numberOfAccounts+1)); // 1st being the `owner`
    owner = await aztecRpcServer.getAccountPublicKey(accounts[0]);
    ownerAddress = accounts[0];
    
    for (let i=1; i<accounts.length; i++) {
      const account = accounts[i];
      const publicKey = await aztecRpcServer.getAccountPublicKey(account);
      points.push(publicKey);
      recipients.push(account);
    }
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
    const contract = new Contract(receipt.contractAddress!, ZkTokenContractAbi, wallet);
    await tx.isMined(0, 0.1);
    await tx.getReceipt();
    logger('L2 contract deployed');
    return contract;
  };

  const deployMultiTransferContract = async () => {
    logger(`Deploying multiTransfer contract...`);
    const deployer = new ContractDeployer(MultiTransferContractAbi, aztecRpcServer);
    const tx = deployer.deploy().send();
    const receipt = await tx.getReceipt();
    const contract = new Contract(receipt.contractAddress!, MultiTransferContractAbi, wallet);
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

  it('12 transfers per transactions should work PLEASE WORK', async () => {
    const initialNote = 1000n;

    logger(`Deploying L2 contract...`);
    const zkContract = await deployContract(initialNote, pointToPublicKey(owner));
    const multiTransferContract = await deployMultiTransferContract();

    logger(`split the large note into four notes for the owner`);
    // TODO: this should be fixed - https://github.com/noir-lang/noir/issues/1850
    const batchTransferRecipients = [
      new Point(owner.x, owner.x),
      new Point(owner.x, owner.y),
      new Point(owner.y, owner.y),
    ];
    const batchTransferTx = zkContract.methods
      .batchTransfer(owner, [400n, 300n, 200n], batchTransferRecipients, 0)
      .send({ from: ownerAddress });
    await batchTransferTx.isMined(0, 0.5);
    const batchTransferTxReceipt = await batchTransferTx.getReceipt();
    logger(`consumption Receipt status: ${batchTransferTxReceipt.status}`);
    await expectBalance(zkContract, ownerAddress, initialNote);

    const amounts: bigint[] = [50n, 50n, 50n, 20n, 20n, 20n, 15n, 15n, 15n, 30n, 30n, 30n];
    const amountSum = amounts.reduce((a, b) => a + b, 0n);

    // We need to pass the points as (p1.x, p2.x, ..., pk.x, p1.y, p2.y, ..., pk.y)
    // This is because noir expects all the x-coordinates first and then the y-coordinates. 
    // TODO(suyash): This should be fixed when argument parsing is fixed in noir.
    const seralizedPoints = [
        new Point(points[0].x, points[1].x),
        new Point(points[2].x, points[3].x),
        new Point(points[4].x, points[5].x),
        new Point(points[0].x, points[1].x),
        new Point(points[2].x, points[3].x),
        new Point(points[4].x, points[5].x),
        new Point(points[0].y, points[1].y),
        new Point(points[2].y, points[3].y),
        new Point(points[4].y, points[5].y),
        new Point(points[0].y, points[1].y),
        new Point(points[2].y, points[3].y),
        new Point(points[4].y, points[5].y),
    ]

    logger(`multiTransfer()...`);
    // Send all the 6 employees 2 notes each
    // TODO: correct the "points"
    const multiTransferTx = multiTransferContract.methods
      .multiTransfer(
        zkContract.address.toField(),
        seralizedPoints,
        amounts,
        owner,
        Fr.fromBuffer(zkContract.methods.batchTransfer.selector),
      )
      .send({ from: ownerAddress });
    await multiTransferTx.isMined(0, 0.5);
    const multiTransferTxReceipt = await multiTransferTx.getReceipt();
    logger(`Consumption Receipt status: ${multiTransferTxReceipt.status}`);
    await expectBalance(zkContract, ownerAddress, initialNote - amountSum);
    await expectBalance(zkContract, recipients[0], amounts[0] + amounts[numberOfAccounts]);
    await expectBalance(zkContract, recipients[1], amounts[1] + amounts[numberOfAccounts + 1]);
    await expectBalance(zkContract, recipients[2], amounts[2] + amounts[numberOfAccounts + 2]);
    await expectBalance(zkContract, recipients[3], amounts[3] + amounts[numberOfAccounts + 3]);
    await expectBalance(zkContract, recipients[4], amounts[4] + amounts[numberOfAccounts + 4]);
    await expectBalance(zkContract, recipients[5], amounts[5] + amounts[numberOfAccounts + 5]);
    

  }, 240_000);

//   it.skip('12 transfers per transactions should work', async () => {
//     const initialNote1 = 30n;
//     const initialNote2 = 45n;
//     const initialNote3 = 60n;
//     const initialNote4 = 75n;

//     logger(`Deploying L2 contract...`);
//     const zkContract = await deployContract(initialNote1, pointToPublicKey(owner));
//     const multiTransferContract = await deployMultiTransferContract();

//     // We need to first create 4 notes for the owner and get those in the private data tree.
//     // This is because until we have those trees in the private data tree, we cannot spend them (atleast until we support pending commitments).
//     // That means we need the transactions to mint these notes to be settled and only then we can test multi-transfer.
//     logger(`mint the second note`);
//     {
//       const tx = zkContract.methods.mint(initialNote2, owner).send({ from: ownerAddress });
//       await tx.isMined(0, 0.5);
//       await tx.getReceipt();
//       await expectBalance(zkContract, ownerAddress, initialNote1 + initialNote2);
//     }
//     logger(`mint the third note`);
//     {
//       const tx = zkContract.methods.mint(initialNote3, owner).send({ from: ownerAddress });
//       await tx.isMined(0, 0.5);
//       await tx.getReceipt();
//       await expectBalance(zkContract, ownerAddress, initialNote1 + initialNote2 + initialNote3);
//     }
//     logger(`mint the fourth note`);
//     {
//       const tx = zkContract.methods.mint(initialNote4, owner).send({ from: ownerAddress });
//       await tx.isMined(0, 0.5);
//       await tx.getReceipt();
//       await expectBalance(zkContract, ownerAddress, initialNote1 + initialNote2 + initialNote3 + initialNote4);
//     }

//     logger(`create some user accounts`);
//     const numberOfAccounts = 12;
//     const points = await createAccounts(numberOfAccounts);

//     const amounts: bigint[] = [5n, 5n, 5n, 10n, 10n, 10n, 15n, 15n, 15n, 20n, 20n, 20n];
//     const amountSum = amounts.reduce((a, b) => a + b, 0n);

//     logger(`multiTransfer()...`);
//     const multiTransferTx = multiTransferContract.methods
//       .multiTransfer(
//         zkContract.address.toField(),
//         points,
//         amounts,
//         owner,
//         Fr.fromBuffer(zkContract.methods.batchTransfer.selector),
//       )
//       .send({ from: ownerAddress });
//     await multiTransferTx.isMined(0, 0.5);
//     const multiTransferTxReceipt = await multiTransferTx.getReceipt();
//     logger(`Consumption Receipt status: ${multiTransferTxReceipt.status}`);
//     await expectBalance(
//       zkContract,
//       ownerAddress,
//       initialNote1 + initialNote2 + initialNote3 + initialNote4 - amountSum,
//     );
//   }, 240_000);
});