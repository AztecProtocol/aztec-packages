import {
  AccountWallet,
  AztecNode,
  CompleteAddress,
  DebugLogger,
  FeePaymentInfo,
  Fr,
  FunctionSelector,
  GrumpkinPrivateKey,
  GrumpkinScalar,
  PXE,
  PublicKey,
  TxStatus,
  generatePublicKey,
  getContractDeploymentInfo,
} from '@aztec/aztec.js';
import { EscrowContract, EscrowContractArtifact } from '@aztec/noir-contracts/Escrow';
import { TokenContract } from '@aztec/noir-contracts/Token';

import { setup } from './fixtures/utils.js';

describe('e2e_public_fees', () => {
  // AZT is the token being sent, and used to pay fees.
  const TOKEN_NAME = 'Aztec Token';
  const TOKEN_SYMBOL = 'AZT';
  const TOKEN_DECIMALS = 18n;
  const MINTED_TOKENS = 1000n;

  let asset: TokenContract;

  let feePaymentContract: EscrowContract;

  let pxe: PXE;
  let logger: DebugLogger;

  let sender: AccountWallet;
  let senderAddress: CompleteAddress;
  let escrowPrivateKey: GrumpkinPrivateKey;
  let escrowPublicKey: PublicKey;
  // let recipient: AccountWallet;
  let recipientAddress: CompleteAddress;
  // let _sequencer: AccountWallet;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let sequencerAddress: CompleteAddress;
  let aztecNode: AztecNode;
  let teardown: () => Promise<void>;

  beforeEach(async () => {
    ({
      aztecNode,
      pxe,
      accounts: [senderAddress, recipientAddress, sequencerAddress],
      wallets: [sender], // recipient, _sequencer],
      logger,
      teardown: teardown,
    } = await setup(3, {
      enableFees: true,
    }));

    logger.info('senderAddress: ' + senderAddress.toReadableString());
    logger.info('recipientAddress: ' + senderAddress.toReadableString());

    const registeredAccounts = await pxe.getRegisteredAccounts();
    logger.info(
      'registeredAccounts:\n ' +
        JSON.stringify(
          registeredAccounts.map(a => a.toReadableString()),
          null,
          2,
        ),
    );

    asset = await TokenContract.deploy(sender, senderAddress, TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS)
      .send()
      .deployed();

    logger.info('asset address: ' + asset.completeAddress.toReadableString());

    expect(await asset.methods.admin().view()).toBe(senderAddress.address.toBigInt());

    // Deploy the fee payment contract. Note that we don't yet register it in our account contract
    escrowPrivateKey = GrumpkinScalar.random();
    escrowPublicKey = generatePublicKey(escrowPrivateKey);
    const salt = Fr.random();
    const deployInfo = getContractDeploymentInfo(EscrowContractArtifact, [senderAddress], salt, escrowPublicKey);
    await pxe.registerAccount(escrowPrivateKey, deployInfo.completeAddress.partialAddress);
    feePaymentContract = await EscrowContract.deployWithPublicKey(escrowPublicKey, sender, senderAddress)
      .send({ contractAddressSalt: salt })
      .deployed();
    logger.info('fee payment contract address: ' + feePaymentContract.completeAddress.toReadableString());
  }, 100_000);

  afterEach(async () => {
    await teardown();
  });

  describe('sequencer charges fees', () => {
    beforeEach(async () => {
      // give each one tokens
      await asset.methods.mint_public(senderAddress, MINTED_TOKENS).send().wait();

      // enable fee payments only for the sender account
      // await sender.setFeeContractAddress(feePaymentContract.completeAddress.address).send().wait();

      await aztecNode.setConfig({
        chargeFees: true,
      });
    });

    it.skip('rejects transactions if fee payment information is not set', async () => {
      // the recipient's account does not have fee payment information set up
      await expect(
        asset.methods.transfer_public(senderAddress, recipientAddress, 100n, Fr.ZERO).send().wait(),
      ).rejects.toThrow(/Transaction .* was dropped/);
    });

    it('executes the transaction and pays the appropriate fee', async () => {
      const transferAmount = 100n;
      const feeAmount = 1n;
      const tx = await asset.methods
        .transfer_public(sender.getAddress(), recipientAddress.address, transferAmount, Fr.ZERO)
        .send({
          feePaymentInfo: new FeePaymentInfo(
            new Fr(feeAmount),
            asset.address,
            feePaymentContract.address,
            FunctionSelector.fromSignature('transfer_public((Field),(Field),Field,Field)'),
            feePaymentContract.address,
            FunctionSelector.empty(),
          ),
        })
        .wait();

      expect(tx.status).toBe(TxStatus.MINED);

      expect(await asset.methods.balance_of_public(recipientAddress).view()).toBe(transferAmount);
      expect(await asset.methods.balance_of_public(senderAddress).view()).toBe(
        MINTED_TOKENS - transferAmount - feeAmount,
      );
      // expect(await asset.methods.balance_of_public(sequencerAddress).view()).toBe(feeAmount);
    });
  });
});
