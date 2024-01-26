import {
  AccountWallet,
  AztecNode,
  CompleteAddress,
  DebugLogger,
  ExtendedNote,
  FeePaymentInfo,
  Fr,
  FunctionSelector,
  GrumpkinPrivateKey,
  GrumpkinScalar,
  Note,
  PXE,
  PublicKey,
  TxHash,
  TxStatus,
  computeMessageSecretHash,
  generatePublicKey,
  getContractDeploymentInfo,
} from '@aztec/aztec.js';
import { FeePaymentContract } from '@aztec/noir-contracts/FeePayment';
import { TokenContract } from '@aztec/noir-contracts/Token';

import { setup } from './fixtures/utils.js';

describe('e2e_public_fees', () => {
  // AZT is the token being sent, and used to pay fees.
  const TOKEN_NAME = 'Aztec Token';
  const TOKEN_SYMBOL = 'AZT';
  const TOKEN_DECIMALS = 18n;
  const MINTED_TOKENS = 1000n;

  let asset: TokenContract;

  let feePaymentContract: FeePaymentContract;

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
    const deployInfo = getContractDeploymentInfo(FeePaymentContract.artifact, [senderAddress], salt, escrowPublicKey);
    await pxe.registerAccount(escrowPrivateKey, deployInfo.completeAddress.partialAddress);
    feePaymentContract = await FeePaymentContract.deployWithPublicKey(escrowPublicKey, sender)
      .send({ contractAddressSalt: salt })
      .deployed();
    logger.info('fee payment contract address: ' + feePaymentContract.completeAddress.toReadableString());
  }, 100_000);

  afterEach(async () => {
    await teardown();
  });

  describe('sequencer charges fees', () => {
    beforeEach(async () => {
      await asset.methods.mint_public(senderAddress, MINTED_TOKENS).send().wait();

      const secret = Fr.random();
      const hash = computeMessageSecretHash(secret);
      const mintTx = await asset.methods.mint_private(MINTED_TOKENS, hash).send().wait();
      await addPendingShieldNoteToPXE(sender, asset.completeAddress, MINTED_TOKENS, hash, mintTx.txHash);
      await asset.methods.redeem_shield(senderAddress, MINTED_TOKENS, secret).send().wait();

      await aztecNode.setConfig({
        chargeFees: true,
      });
    }, 50_000);

    it.skip('rejects transactions if fee payment information is not set', async () => {
      // the recipient's account does not have fee payment information set up
      await expect(
        asset.methods.transfer_public(senderAddress, recipientAddress, 100n, Fr.ZERO).send().wait(),
      ).rejects.toThrow(/Transaction .* was dropped/);
    });

    it("executes transaction's transfer_public and pays the appropriate fee publicly", async () => {
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
            FunctionSelector.fromSignature('disburse_fee((Field),(Field),Field)'),
            sequencerAddress.address,
          ),
        })
        .wait();

      expect(tx.status).toBe(TxStatus.MINED);

      expect(await asset.methods.balance_of_public(recipientAddress).view()).toBe(transferAmount);
      expect(await asset.methods.balance_of_public(senderAddress).view()).toBe(
        MINTED_TOKENS - transferAmount - feeAmount,
      );
      expect(await asset.methods.balance_of_public(sequencerAddress).view()).toBe(feeAmount);
    }, 100_000);

    it("executes transaction's unshield and pays the appropriate fee publicly", async () => {
      const transferAmount = 100n;
      const feeAmount = 1n;

      const sendersPublicBalance = await asset.methods.balance_of_public(senderAddress).view();
      const sequencersPublicBalance = await asset.methods.balance_of_public(sequencerAddress).view();

      const tx = await asset.methods
        .unshield(sender.getAddress(), recipientAddress.address, transferAmount, Fr.ZERO)
        .send({
          feePaymentInfo: new FeePaymentInfo(
            new Fr(feeAmount),
            asset.address,
            feePaymentContract.address,
            FunctionSelector.fromSignature('transfer_public((Field),(Field),Field,Field)'),
            feePaymentContract.address,
            FunctionSelector.fromSignature('disburse_fee((Field),(Field),Field)'),
            sequencerAddress.address,
          ),
        })
        .wait();

      expect(tx.status).toBe(TxStatus.MINED);

      expect(await asset.methods.balance_of_public(recipientAddress).view()).toBe(transferAmount);
      expect(await asset.methods.balance_of_private(senderAddress).view()).toBe(MINTED_TOKENS - transferAmount);
      expect(await asset.methods.balance_of_public(senderAddress).view()).toBe(sendersPublicBalance - feeAmount);
      expect(await asset.methods.balance_of_public(sequencerAddress).view()).toBe(sequencersPublicBalance + feeAmount);
    }, 100_000);
  });
});

async function addPendingShieldNoteToPXE(
  wallet: AccountWallet,
  asset: CompleteAddress,
  amount: bigint,
  secretHash: Fr,
  txHash: TxHash,
) {
  // The storage slot of `pending_shields` is 5.
  // TODO AlexG, this feels brittle
  const storageSlot = new Fr(5);
  const note = new Note([new Fr(amount), secretHash]);
  const extendedNote = new ExtendedNote(note, wallet.getAddress(), asset.address, storageSlot, txHash);
  await wallet.addNote(extendedNote);
}
