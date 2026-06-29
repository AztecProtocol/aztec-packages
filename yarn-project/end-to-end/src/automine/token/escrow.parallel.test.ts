import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import { deriveKeys } from '@aztec/aztec.js/keys';
import type { Logger } from '@aztec/aztec.js/log';
import { EscrowContract } from '@aztec/noir-contracts.js/Escrow';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import type { PublicKeys } from '@aztec/stdlib/keys';

import { expectTokenBalance, mintTokensToPrivate } from '../../fixtures/token_utils.js';
import type { TestWallet } from '../../test-wallet/test_wallet.js';
import { AutomineTestContext } from '../automine_test_context.js';

// Tests the Escrow contract: withdrawing to a recipient, access-control enforcement, and
// multi-key batch operations. Uses setup(2, AUTOMINE_E2E_OPTS) with one node, automine sequencer,
// and two funded accounts (owner, recipient). A fresh escrow and token are deployed in beforeEach.
describe('automine/token/escrow', () => {
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
    } = (await AutomineTestContext.setup({ numberOfAccounts: 2 })).context);

    // Generate private key for escrow contract, register key in PXE, and deploy
    // Note that we need to register it first if we want to emit an encrypted note for it in the constructor
    escrowSecretKey = Fr.random();
    escrowPublicKeys = (await deriveKeys(escrowSecretKey)).publicKeys;
    const escrowDeployment = EscrowContract.deploy(wallet, owner, { publicKeys: escrowPublicKeys, deployer: owner });
    const escrowInstance = await escrowDeployment.getInstance();
    await wallet.registerContract(escrowInstance, EscrowContract.artifact, escrowSecretKey);
    // The contract constructor initializes private storage vars that need the contract's own nullifier key.
    ({ contract: escrowContract } = await escrowDeployment.send({
      from: owner,
      additionalScopes: [escrowInstance.address],
    }));
    logger.info(`Escrow contract deployed at ${escrowContract.address}`);

    // Deploy Token contract and mint funds for the escrow contract
    ({ contract: token } = await TokenContract.deploy(wallet, owner, 'TokenName', 'TokenSymbol', 18).send({
      from: owner,
    }));

    await mintTokensToPrivate(token, owner, escrowContract.address, 100n);

    logger.info(`Token contract deployed at ${token.address}`);
  });

  afterEach(() => teardown(), 30_000);

  // Calls escrowContract.withdraw(token, 30, recipient) as owner and asserts recipient balance
  // increases by 30 and escrow decreases from 100 to 70.
  it('withdraws funds from the escrow contract', async () => {
    await expectTokenBalance(wallet, token, owner, 0n, logger);
    await expectTokenBalance(wallet, token, recipient, 0n, logger);
    await expectTokenBalance(wallet, token, escrowContract.address, 100n, logger);

    logger.info(`Withdrawing funds from token contract to ${recipient}`);
    await escrowContract.methods
      .withdraw(token.address, 30, recipient)
      // Withdraw nullifies the contract's own token notes, which requires its nullifier key.
      .send({ from: owner, additionalScopes: [escrowContract.address] });

    await expectTokenBalance(wallet, token, owner, 0n, logger);
    await expectTokenBalance(wallet, token, recipient, 30n, logger);
    await expectTokenBalance(wallet, token, escrowContract.address, 70n, logger);
  });

  // Simulates withdraw from recipient (non-owner) and expects a rejection (owner check).
  it('refuses to withdraw funds as a non-owner', async () => {
    await expect(
      escrowContract.methods
        .withdraw(token.address, 30, recipient)
        // Withdraw nullifies the contract's own token notes, which requires its nullifier key.
        .simulate({ from: recipient, additionalScopes: [escrowContract.address] }),
    ).rejects.toThrow();
  });

  // Mints 50 to owner, then uses BatchCall to transfer 10 from owner and withdraw 20 from escrow
  // in the same tx. Asserts recipient ends up with 30 total.
  it('moves funds using multiple keys on the same tx - regression 1010', async () => {
    logger.info(`Minting funds in token contract to ${owner}`);
    const mintAmount = 50n;

    await mintTokensToPrivate(token, owner, owner, mintAmount);

    await expectTokenBalance(wallet, token, owner, 50n, logger);

    await new BatchCall(wallet, [
      token.methods.transfer(recipient, 10),
      escrowContract.methods.withdraw(token.address, 20, recipient),
      // Withdraw nullifies the contract's own token notes, which requires its nullifier key.
    ]).send({ from: owner, additionalScopes: [escrowContract.address] });
    await expectTokenBalance(wallet, token, recipient, 30n, logger);
  });
});
