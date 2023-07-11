import { AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, AztecRPCServer, Contract, ContractDeployer, Fr, TxStatus, Wallet } from '@aztec/aztec.js';
import { PendingCommitmentsContractAbi } from '@aztec/noir-contracts/examples';
import { DebugLogger } from '@aztec/foundation/log';

import { pointToPublicKey, setup } from './utils.js';

describe('e2e_pending_commitments_contract', () => {
  let aztecNode: AztecNodeService;
  let aztecRpcServer: AztecRPCServer;
  let wallet: Wallet;
  let accounts: AztecAddress[];
  let logger: DebugLogger;

  let contract: Contract;

  beforeEach(async () => {
    ({ aztecNode, aztecRpcServer, accounts, wallet, logger } = await setup(2));
  }, 100_000);

  afterEach(async () => {
    await aztecNode?.stop();
    await aztecRpcServer?.stop();
  });

  const deployContract = async () => {
    logger(`Deploying L2 contract...`);
    const deployer = new ContractDeployer(PendingCommitmentsContractAbi, aztecRpcServer);
    const tx = deployer.deploy().send();
    const receipt = await tx.getReceipt();
    contract = new Contract(receipt.contractAddress!, PendingCommitmentsContractAbi, wallet);
    await tx.isMined(0, 0.1);
    await tx.getReceipt();
    logger('L2 contract deployed');
    return contract;
  };

  it('Noir function can "get" notes it just "inserted"', async () => {
    const mintAmount = 65n;

    const [owner] = accounts;
    const ownerPublicKey = pointToPublicKey(await aztecRpcServer.getAccountPublicKey(owner));

    const deployedContract = await deployContract();

    const tx = deployedContract.methods
      .create_get_and_check_note_inline(mintAmount, ownerPublicKey)
      .send({ from: owner });
    //assert commitment output from app
    //assert no rr output from app that matches pending commitment
    //assert bal?

    await tx.isMined(0, 0.1);
    const receipt = await tx.getReceipt();

    expect(receipt.status).toBe(TxStatus.MINED);
  }, 60_000);

  it('Noir function can "get" notes inserted in a previous function call in same TX', async () => {
    const mintAmount = 65n;

    const [owner] = accounts;
    const ownerPublicKey = pointToPublicKey(await aztecRpcServer.getAccountPublicKey(owner));

    const deployedContract = await deployContract();

    const tx = deployedContract.methods
      .create_get_and_check_note_in_nested_calls(
        mintAmount,
        ownerPublicKey,
        Fr.fromBuffer(deployedContract.methods.create_note.selector),
        Fr.fromBuffer(deployedContract.methods.get_and_check_note.selector),
      )
      .send({ from: owner });
    //assert commitment output from app
    //assert no rr output from app that matches pending commitment
    //assert bal?

    await tx.isMined(0, 0.1);
    const receipt = await tx.getReceipt();

    expect(receipt.status).toBe(TxStatus.MINED);
  }, 60_000);

  // TODO(dbanks12): tests for nullifying pending notes
  // TODO(dbanks12): test expected kernel failures if transient reads and nullifiers (or their hints) don't match or follow rules
  // TODO(dbanks12): test creation, getting, nullifying of multiple notes
});
