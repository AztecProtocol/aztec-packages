import { type InitialAccountData, deployFundedSchnorrAccount } from '@aztec/accounts/testing';
import type { AztecNode } from '@aztec/aztec.js';
import { type AccountWallet, type FieldLike, Fr, type Logger, type PXE, deriveKeys, sleep } from '@aztec/aztec.js';
import type { CheatCodes } from '@aztec/aztec/testing';
import { ClosedSetOrderbookContract } from '@aztec/noir-contracts.js/ClosedSetOrderbook';
import type { TokenContract } from '@aztec/noir-contracts.js/Token';
import type { SequencerClient } from '@aztec/sequencer-client';

import { jest } from '@jest/globals';

import { deployToken, expectTokenBalance, mintTokensToPrivate } from './fixtures/token_utils.js';
import { setup, setupPXEService } from './fixtures/utils.js';

const TIMEOUT = 120_000;
const CHANGE_CONFIG_DELAY = 60 * 60 * 24;

// TODO(#14525): Write thorough ClosedSetOrderbook tests. Currently we test only a happy path here because we will
// migrate these tests to TXE once TXE 2.0 is ready.
describe('ClosedSetOrderbook', () => {
  jest.setTimeout(TIMEOUT);

  let teardownA: () => Promise<void>;
  let teardownB: () => Promise<void>;
  let logger: Logger;

  let makerPxe: PXE;
  let takerPxe: PXE;
  let cheatCodes: CheatCodes;
  let sequencer: SequencerClient;
  let aztecNode: AztecNode;

  let initialFundedAccounts: InitialAccountData[];

  let adminWallet: AccountWallet;
  let maker: AccountWallet;
  let taker: AccountWallet;
  let feeCollector: AccountWallet;

  let token0: TokenContract;
  let token1: TokenContract;
  let orderbook: ClosedSetOrderbookContract;

  const bidAmount = 1000n;
  const askAmount = 2000n;
  const fee = 10n; // 0.1%

  beforeAll(async () => {
    let maybeSequencer: SequencerClient | undefined = undefined;
    ({
      pxe: makerPxe,
      teardown: teardownA,
      wallets: [adminWallet, maker, feeCollector],
      initialFundedAccounts,
      logger,
      cheatCodes,
      sequencer: maybeSequencer,
      aztecNode,
    } = await setup(3, { numberOfInitialFundedAccounts: 4 }));

    if (!maybeSequencer) {
      throw new Error('Sequencer client not found');
    }
    sequencer = maybeSequencer;

    // TAKER ACCOUNT SETUP
    // We setup a second PXE for the taker account to demonstrate a more realistic scenario.
    {
      // Setup second PXE for taker
      ({ pxe: takerPxe, teardown: teardownB } = await setupPXEService(aztecNode, {}, undefined, true));
      const takerAccount = await deployFundedSchnorrAccount(takerPxe, initialFundedAccounts[3]);
      taker = await takerAccount.getWallet();

      /*TODO(post-honk): We wait 5 seconds for a race condition in setting up two nodes.
      What is a more robust solution? */
      await sleep(5000);
    }

    await makerPxe.registerSender(taker.getAddress());
    await takerPxe.registerSender(maker.getAddress());
    // We need to register the admin wallet as a sender for taker such that taker's PXE knows that it needs to sync
    // the minted token1 note (admin is set as sender there).
    await takerPxe.registerSender(adminWallet.getAddress());

    // TOKEN SETUP
    {
      token0 = await deployToken(adminWallet, 0n, logger);
      token1 = await deployToken(adminWallet, 0n, logger);

      // Register tokens with taker's PXE
      await takerPxe.registerContract(token0);
      await takerPxe.registerContract(token1);

      // Mint tokens to maker and taker
      await mintTokensToPrivate(token0, adminWallet, maker.getAddress(), bidAmount);
      await mintTokensToPrivate(token1, adminWallet, taker.getAddress(), askAmount);
    }

    // ORDERBOOK SETUP
    {
      // Generate secret key and public keys for the orderbook contract
      const orderbookSecretKey = Fr.random();
      const orderbookPublicKeys = (await deriveKeys(orderbookSecretKey)).publicKeys;

      // Deploy the orderbook contract with public keys such that it can receive and nullify notes.
      orderbook = await ClosedSetOrderbookContract.deployWithPublicKeys(
        orderbookPublicKeys,
        adminWallet,
        token0.address,
        token1.address,
        feeCollector.getAddress(),
        fee,
      )
        .send()
        .deployed();

      // Register orderbook with both PXEs
      await makerPxe.registerAccount(orderbookSecretKey, await orderbook.partialAddress);
      await takerPxe.registerAccount(orderbookSecretKey, await orderbook.partialAddress);
      await takerPxe.registerContract(orderbook);
    }
  });

  afterAll(async () => {
    await teardownB();
    await teardownA();
  });

  // THESE TESTS HAVE TO BE RUN SEQUENTIALLY AS THEY ARE INTERDEPENDENT.
  describe('full flow - happy path', () => {
    let orderId: FieldLike;

    it('config actives', async () => {
      // Warp time to get past the config change delay
      await cheatCodes.warpL2TimeAtLeastBy(sequencer, aztecNode, CHANGE_CONFIG_DELAY);

      const config = await orderbook.methods.get_config().simulate();
      expect(config.token0).toEqual(token0.address);
      expect(config.token1).toEqual(token1.address);
      expect(config.fee_collector).toEqual(feeCollector.getAddress());
      expect(config.fee).toEqual(fee);
    });

    it('creates an order', async () => {
      const nonceForAuthwits = Fr.random();

      // Create authwit for maker to allow orderbook to transfer bidAmount of token0 to itself
      const makerAuthwit = await maker.createAuthWit({
        caller: orderbook.address,
        action: token0.methods.transfer_in_private(maker.getAddress(), orderbook.address, bidAmount, nonceForAuthwits),
      });

      // Create order
      const txReceipt = await orderbook
        .withWallet(maker)
        .methods.create_order(token0.address, token1.address, bidAmount, askAmount, nonceForAuthwits)
        .with({ authWitnesses: [makerAuthwit] })
        .send()
        .wait();

      // At this point, bidAmount of token0 should be transferred to the private balance of the orderbook and maker
      // should have 0.
      await expectTokenBalance(maker, token0, maker.getAddress(), 0n, logger);
      await expectTokenBalance(maker, token0, orderbook.address, bidAmount, logger);

      const notes = await makerPxe.getNotes({
        txHash: txReceipt.txHash,
        contractAddress: orderbook.address,
      });
      expect(notes.length).toEqual(1);

      // First item in the note is the order ID
      orderId = notes[0].note.items[0];
    });

    it('fulfills an order', async () => {
      // First we check that taker's PXE has managed to successfully sync the order note and the bid token note that
      // are both held by the orderbook contract.
      {
        const orderNote = await takerPxe.getNotes({
          contractAddress: orderbook.address,
        });
        expect(orderNote.length).toEqual(1);

        await expectTokenBalance(taker, token0, orderbook.address, bidAmount, logger);
        await expectTokenBalance(taker, token1, taker.getAddress(), askAmount, logger);
      }

      const nonceForAuthwits = Fr.random();

      // Create authwit for taker to allow orderbook to transfer askAmount of token1 from taker to maker
      const takerAuthwit = await taker.createAuthWit({
        caller: orderbook.address,
        action: token1.methods.transfer_in_private(taker.getAddress(), maker.getAddress(), askAmount, nonceForAuthwits),
      });

      // Fulfill order using taker's PXE
      await orderbook
        .withWallet(taker)
        .methods.fulfill_order(orderId, nonceForAuthwits)
        .with({ authWitnesses: [takerAuthwit] })
        .send()
        .wait({ interval: 0.1 });

      // Verify balances after order fulfillment - at this point, maker should have the askAmount of token1 and taker
      // should have the bidAmount of token0 and orderbook should have nothing.
      await expectTokenBalance(maker, token0, maker.getAddress(), 0n, logger);
      await expectTokenBalance(maker, token1, maker.getAddress(), askAmount, logger);
      await expectTokenBalance(taker, token0, taker.getAddress(), bidAmount, logger);
      await expectTokenBalance(taker, token1, taker.getAddress(), 0n, logger);
    });
  });
});
