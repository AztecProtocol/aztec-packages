import {
  type AccountWallet,
  type AztecAddress,
  BatchCall,
  Fr,
  type Logger,
  type PXE,
  deriveKeys,
} from '@aztec/aztec.js';
import { type PublicKeys, computePartialAddress } from '@aztec/circuits.js';
import { EscrowContract } from '@aztec/noir-contracts.js/Escrow';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { expectTokenBalance, mintTokensToPrivate } from './fixtures/token_utils.js';
import { setup } from './fixtures/utils.js';

describe('e2e_escrow_contract', () => {
  let pxe: PXE;
  let wallet: AccountWallet;
  let recipientWallet: AccountWallet;

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
      pxe,
      wallets: [wallet, recipientWallet],
      logger,
    } = await setup(2));
    owner = wallet.getAddress();
    recipient = recipientWallet.getAddress();

    // Generate private key for escrow contract, register key in pxe service, and deploy
    // Note that we need to register it first if we want to emit an encrypted note for it in the constructor
    escrowSecretKey = Fr.random();
    escrowPublicKeys = deriveKeys(escrowSecretKey).publicKeys;
    const escrowDeployment = EscrowContract.deployWithPublicKeys(escrowPublicKeys, wallet, owner);
    const escrowInstance = escrowDeployment.getInstance();
    await pxe.registerAccount(escrowSecretKey, computePartialAddress(escrowInstance));
    escrowContract = await escrowDeployment.send().deployed();
    logger.info(`Escrow contract deployed at ${escrowContract.address}`);

    // Deploy Token contract and mint funds for the escrow contract
    token = await TokenContract.deploy(wallet, owner, 'TokenName', 'TokenSymbol', 18).send().deployed();

    await mintTokensToPrivate(token, wallet, escrowContract.address, 100n);

    // We allow our wallet to see the escrow contract's notes.
    wallet.setScopes([wallet.getAddress(), escrowContract.address]);

    logger.info(`Token contract deployed at ${token.address}`);
  });

  afterEach(() => teardown(), 30_000);

  it('withdraws funds from the escrow contract', async () => {
    await expectTokenBalance(wallet, token, owner, 0n, logger);
    await expectTokenBalance(wallet, token, recipient, 0n, logger);
    await expectTokenBalance(wallet, token, escrowContract.address, 100n, logger);

    logger.info(`Withdrawing funds from token contract to ${recipient}`);
    await escrowContract.methods.withdraw(token.address, 30, recipient).send().wait();

    await expectTokenBalance(wallet, token, owner, 0n, logger);
    await expectTokenBalance(wallet, token, recipient, 30n, logger);
    await expectTokenBalance(wallet, token, escrowContract.address, 70n, logger);
  });

  it('refuses to withdraw funds as a non-owner', async () => {
    await expect(
      escrowContract.withWallet(recipientWallet).methods.withdraw(token.address, 30, recipient).prove(),
    ).rejects.toThrow();
  });

  it('moves funds using multiple keys on the same tx (#1010)', async () => {
    logger.info(`Minting funds in token contract to ${owner}`);
    const mintAmount = 50n;

    await mintTokensToPrivate(token, wallet, owner, mintAmount);

    await expectTokenBalance(wallet, token, owner, 50n, logger);

    await new BatchCall(wallet, [
      token.methods.transfer(recipient, 10).request(),
      escrowContract.methods.withdraw(token.address, 20, recipient).request(),
    ])
      .send()
      .wait();
    await expectTokenBalance(wallet, token, recipient, 30n, logger);
  });
});
