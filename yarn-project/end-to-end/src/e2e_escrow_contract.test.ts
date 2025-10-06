import { type AztecAddress, BatchCall, Fr, type Logger, deriveKeys } from '@aztec/aztec.js';
import { EscrowContract } from '@aztec/noir-contracts.js/Escrow';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import type { PublicKeys } from '@aztec/stdlib/keys';
import type { TestWallet } from '@aztec/test-wallet/server';

import { expectTokenBalance, mintTokensToPrivate } from './fixtures/token_utils.js';
import { setup } from './fixtures/utils.js';

describe('e2e_escrow_contract', () => {
  let wallet: TestWallet;

  let logger: Logger;
  let teardown: () => Promise<void>;

  let token: TokenContract;
  let escrowContract: EscrowContract;
  let owner: AztecAddress;
  let recipient: AztecAddress;

  let escrowSecretKey: Fr;
  let escrowPublicKeys: PublicKeys;

  beforeEach(async () => {
    // Setup environment
    ({
      teardown,
      wallet,
      accounts: [owner, recipient],
      logger,
    } = await setup(2));

    // Generate private key for escrow contract, register key in PXE, and deploy
    // Note that we need to register it first if we want to emit an encrypted note for it in the constructor
    escrowSecretKey = Fr.random();
    escrowPublicKeys = (await deriveKeys(escrowSecretKey)).publicKeys;
    const escrowDeployment = EscrowContract.deployWithPublicKeys(escrowPublicKeys, wallet, owner);
    const escrowInstance = await escrowDeployment.getInstance();
    await wallet.registerContract(escrowInstance, EscrowContract.artifact, escrowSecretKey);
    escrowContract = await escrowDeployment.send({ from: owner }).deployed();
    logger.info(`Escrow contract deployed at ${escrowContract.address}`);

    // Deploy Token contract and mint funds for the escrow contract
    token = await TokenContract.deploy(wallet, owner, 'TokenName', 'TokenSymbol', 18).send({ from: owner }).deployed();

    await mintTokensToPrivate(token, owner, escrowContract.address, 100n);

    logger.info(`Token contract deployed at ${token.address}`);
  });

  afterEach(() => teardown(), 30_000);

  it('withdraws funds from the escrow contract', async () => {
    await expectTokenBalance(wallet, token, owner, 0n, logger);
    await expectTokenBalance(wallet, token, recipient, 0n, logger);
    await expectTokenBalance(wallet, token, escrowContract.address, 100n, logger);

    logger.info(`Withdrawing funds from token contract to ${recipient}`);
    await escrowContract.methods.withdraw(token.address, 30, recipient).send({ from: owner }).wait();

    await expectTokenBalance(wallet, token, owner, 0n, logger);
    await expectTokenBalance(wallet, token, recipient, 30n, logger);
    await expectTokenBalance(wallet, token, escrowContract.address, 70n, logger);
  });

  it('refuses to withdraw funds as a non-owner', async () => {
    await expect(
      escrowContract.methods.withdraw(token.address, 30, recipient).simulate({ from: recipient }),
    ).rejects.toThrow();
  });

  it('moves funds using multiple keys on the same tx (#1010)', async () => {
    logger.info(`Minting funds in token contract to ${owner}`);
    const mintAmount = 50n;

    await mintTokensToPrivate(token, owner, owner, mintAmount);

    await expectTokenBalance(wallet, token, owner, 50n, logger);

    await new BatchCall(wallet, [
      token.methods.transfer(recipient, 10),
      escrowContract.methods.withdraw(token.address, 20, recipient),
    ])
      .send({ from: owner })
      .wait();
    await expectTokenBalance(wallet, token, recipient, 30n, logger);
  });
});
