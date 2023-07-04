import { AztecNodeService } from '@aztec/aztec-node';
import {
  AztecAddress,
  AztecRPCServer,
  Contract,
  ContractDeployer,
  ContractFunctionInteraction,
  Fr,
} from '@aztec/aztec.js';
import { CGamContractAbi } from '@aztec/noir-contracts/examples';
import { DebugLogger } from '@aztec/foundation/log';

import { pointToPublicKey, setup } from './utils.js';

describe('e2e_c_gam_contract', () => {
  let aztecNode: AztecNodeService;
  let aztecRpcServer: AztecRPCServer;
  let accounts: AztecAddress[];
  let logger: DebugLogger;

  let contract: Contract;

  beforeEach(async () => {
    ({ aztecNode, aztecRpcServer, accounts, logger } = await setup(/*two accounts for 2 players*/ 2));
  }, 100_000);

  afterEach(async () => {
    await aztecNode?.stop();
    await aztecRpcServer?.stop();
  });

  const deployContract = async () => {
    logger(`Deploying L2 contract...`);
    const deployer = new ContractDeployer(CGamContractAbi, aztecRpcServer);
    const tx = deployer.deploy().send();
    const receipt = await tx.getReceipt();
    contract = new Contract(receipt.contractAddress!, CGamContractAbi, aztecRpcServer);
    await tx.isMined(0, 0.1);
    await tx.getReceipt();
    logger('L2 contract deployed');
    return contract;
  };

  it('should call buy_pack and see notes', async () => {
    const owner = await aztecRpcServer.getAccountPublicKey(accounts[0]);
    const deployedContract = await deployContract();
    const seed = 1n;
    const tx: ContractFunctionInteraction = deployedContract.methods.buy_pack(seed, pointToPublicKey(owner));
    await tx.send({ from: accounts[0] }).isMined();
    logger(`We bought our pack!`);
    const cardData = await deployedContract.methods
      .get_pack_cards_unconstrained(seed, pointToPublicKey(owner))
      .view({ from: accounts[0] });
    // Test that we have received the expected card data
    expect(cardData[0]).toBe([328682529145n, 657365058290n, 986047587435n]);
  }, 30_000);

  it('should call create_game and see our storage slot filled', async () => {
    const owner = await aztecRpcServer.getAccountPublicKey(accounts[0]);
    const deployedContract = await deployContract();
    const tx: ContractFunctionInteraction = deployedContract.methods.create_game();
    await tx.send({ from: accounts[0] }).isMined();
    logger(`We created our game!`);
    const gameIdStorageSlot = new Fr(2);
    const storage = await aztecRpcServer.getStorageAt(deployedContract.address, gameIdStorageSlot);
    logger({ storage });
  }, 30_000);

  // /**
  //  * Milestone 1.3.
  //  * https://hackmd.io/AG5rb9DyTRu3y7mBptWauA
  //  */
  // it('1.3 should deploy zk token contract with initial token minted to the account', async () => {
  //   const initialBalance = 987n;
  //   const owner = await aztecRpcServer.getAccountPublicKey(accounts[0]);
  //   await deployContract(initialBalance, pointToPublicKey(owner));
  //   await expectBalance(accounts[0], initialBalance);
  //   await expectBalance(accounts[1], 0n);

  //   await expectsNumOfEncryptedLogsInTheLastBlockToBe(1);
  //   await expectUnencryptedLogsFromLastBlockToBe(['Balance set in constructor']);
  // }, 30_000);

  // /**
  //  * Milestone 1.4.
  //  */
  // it('1.4 should call mint and increase balance', async () => {
  //   const mintAmount = 65n;

  //   const [owner] = accounts;
  //   const ownerPublicKey = pointToPublicKey(await aztecRpcServer.getAccountPublicKey(owner));

  //   const deployedContract = await deployContract(0n, ownerPublicKey);
  //   await expectBalance(owner, 0n);

  //   await expectsNumOfEncryptedLogsInTheLastBlockToBe(1);
  //   await expectUnencryptedLogsFromLastBlockToBe(['Balance set in constructor']);

  //   const tx = deployedContract.methods.mint(mintAmount, ownerPublicKey).send({ from: owner });

  //   await tx.isMined(0, 0.1);
  //   const receipt = await tx.getReceipt();

  //   expect(receipt.status).toBe(TxStatus.MINED);
  //   await expectBalance(owner, mintAmount);

  //   await expectsNumOfEncryptedLogsInTheLastBlockToBe(1);
  //   await expectUnencryptedLogsFromLastBlockToBe(['Coins minted']);
  // }, 60_000);

  // /**
  //  * Milestone 1.5.
  //  */
  // it('1.5 should call transfer and increase balance of another account', async () => {
  //   const initialBalance = 987n;
  //   const transferAmount = 654n;
  //   const [owner, receiver] = accounts;

  //   await deployContract(initialBalance, pointToPublicKey(await aztecRpcServer.getAccountPublicKey(owner)));

  //   await expectBalance(owner, initialBalance);
  //   await expectBalance(receiver, 0n);

  //   await expectsNumOfEncryptedLogsInTheLastBlockToBe(1);
  //   await expectUnencryptedLogsFromLastBlockToBe(['Balance set in constructor']);

  //   const tx = contract.methods
  //     .transfer(
  //       transferAmount,
  //       pointToPublicKey(await aztecRpcServer.getAccountPublicKey(owner)),
  //       pointToPublicKey(await aztecRpcServer.getAccountPublicKey(receiver)),
  //     )
  //     .send({ from: accounts[0] });

  //   await tx.isMined(0, 0.1);
  //   const receipt = await tx.getReceipt();

  //   expect(receipt.status).toBe(TxStatus.MINED);

  //   await expectBalance(owner, initialBalance - transferAmount);
  //   await expectBalance(receiver, transferAmount);

  //   await expectsNumOfEncryptedLogsInTheLastBlockToBe(2);
  //   await expectUnencryptedLogsFromLastBlockToBe(['Coins transferred']);
  // }, 60_000);
});
