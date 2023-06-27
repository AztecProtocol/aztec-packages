import { AztecNodeService } from '@aztec/aztec-node';
import {
  AztecAddress,
  AztecRPCServer,
  Contract,
  ContractDeployer,
  Fr,
  Point,
  TxStatus,
  computeMessageSecretHash,
} from '@aztec/aztec.js';
import { NonNativeTokenContractAbi } from '@aztec/noir-contracts/examples';
import { DebugLogger } from '@aztec/foundation/log';
import { expectStorageSlot, pointToPublicKey, setup } from './utils.js';

describe('e2e_public_to_private_messaging', () => {
  let aztecNode: AztecNodeService;
  let aztecRpcServer: AztecRPCServer;
  let accounts: AztecAddress[];
  let ownerPub: Point;
  let logger: DebugLogger;

  let contract: Contract;

  beforeEach(async () => {
    ({ aztecNode, aztecRpcServer, accounts, logger } = await setup());
    ownerPub = await aztecRpcServer.getAccountPublicKey(accounts[0]);
  }, 100_000);

  afterEach(async () => {
    await aztecNode?.stop();
    await aztecRpcServer?.stop();
  });

  const expectBalance = async (owner: AztecAddress, expectedBalance: bigint) => {
    const ownerPublicKey = await aztecRpcServer.getAccountPublicKey(owner);
    const [balance] = await contract.methods.getBalance(pointToPublicKey(ownerPublicKey)).view({ from: owner });
    logger(`Account ${owner} balance: ${balance}`);
    expect(balance).toBe(expectedBalance);
  };

  const deployContract = async () => {
    logger(`Deploying Public to Private L2 contract...`);
    const deployer = new ContractDeployer(NonNativeTokenContractAbi, aztecRpcServer);
    const tx = deployer.deploy(0n, ownerPub).send();
    const receipt = await tx.getReceipt();
    contract = new Contract(receipt.contractAddress!, NonNativeTokenContractAbi, aztecRpcServer);
    await tx.isMined(0, 0.1);
    await tx.getReceipt();
    logger('L2 contract deployed');
    return contract;
  };

  /**
   * Milestone 5.4: Intra-contract Public -\> Private calls (shielding).
   */
  it('5.4: Should be able to create a commitment in a public function and spend in a private function', async () => {
    const mintAmount = 100n;

    const [owner] = accounts;

    await deployContract();

    // Create a secret for the transparent message
    const secret = Fr.random();
    const secretHash = await computeMessageSecretHash(secret);

    // Create the commitment to be spent in the private domain
    logger('Creating commitment in public call');
    const shieldTx = contract.methods.shield(mintAmount, secretHash).send({ from: owner });

    await shieldTx.isMined(0, 0.1);
    const shieldReceipt = await shieldTx.getReceipt();

    expect(shieldReceipt.status).toBe(TxStatus.MINED);

    // Create the transaction spending the commitment
    logger('Spending commitment in private call');
    const privateTx = contract.methods.redeemShield(mintAmount, secret, ownerPub).send({ from: owner });

    await privateTx.isMined();
    const privateReceipt = await privateTx.getReceipt();

    expect(privateReceipt.status).toBe(TxStatus.MINED);
    await expectBalance(owner, mintAmount);

    // Unshield the tokens again, sending them to the same account, however this can be any account.
    logger('Unshielding tokens');
    const unshieldTx = contract.methods.unshieldTokens(mintAmount, ownerPub, owner).send({ from: owner });
    await unshieldTx.isMined();
    const unshieldReceipt = await unshieldTx.getReceipt();

    expect(unshieldReceipt.status).toBe(TxStatus.MINED);
    await expectBalance(owner, 0n);

    const publicBalancesSlot = 2n;
    await expectStorageSlot(logger, aztecNode, contract, publicBalancesSlot, owner.toField(), mintAmount);
  }, 100_000);
});
