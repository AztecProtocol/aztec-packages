import { type AccountWallet, type FieldLike, Fr, type Logger, type PXE } from '@aztec/aztec.js';
import { ClosedSetOrderbookContract } from '@aztec/noir-contracts.js/ClosedSetOrderbook';
import type { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';

import { deployToken, mintTokensToPrivate } from './fixtures/token_utils.js';
import { setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;
const CHANGE_CONFIG_DELAY_BLOCKS = 10;

// TODO(#14525): Write thorough ClosedSetOrderbook tests. Currently we test only a happy path here because we will
// migrate these tests to TXE once TXE 2.0 is ready.
describe('ClosedSetOrderbook', () => {
  jest.setTimeout(TIMEOUT);

  let teardown: () => Promise<void>;
  let logger: Logger;

  let pxe: PXE;

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
    ({
      pxe,
      teardown,
      wallets: [adminWallet, maker, taker, feeCollector],
      logger,
    } = await setup(4));

    token0 = await deployToken(adminWallet, 0n, logger);
    token1 = await deployToken(adminWallet, 0n, logger);

    orderbook = await ClosedSetOrderbookContract.deploy(
      adminWallet,
      token0.address,
      token1.address,
      feeCollector.getAddress(),
      fee,
    )
      .send()
      .deployed();

    // Mint tokens to maker and taker
    await mintTokensToPrivate(token0, adminWallet, maker.getAddress(), bidAmount);
    await mintTokensToPrivate(token1, adminWallet, taker.getAddress(), askAmount);
  });

  afterAll(() => teardown());

  // THESE TESTS HAVE TO BE RUN SEQUENTIALLY AS THEY ARE INTERDEPENDENT.
  describe('full flow - happy path', () => {
    let orderId: FieldLike;

    it('config actives', async () => {
      // We mine CHANGE_CONFIG_DELAY_BLOCKS blocks to make sure the config is active.

      // Note that it would be better to obtain the scheduled block of change from the contract as then we would
      // not have to copy the CHANGE_CONFIG_DELAY_BLOCKS value here. We currently don't have a getter on
      // SharedMutable that would allow us to do this.
      // TODO: Add utility-context getter of block of change on SharedMutable.
      for (let i = 0; i < CHANGE_CONFIG_DELAY_BLOCKS; i++) {
        await token0.methods.total_supply().send().wait();
      }

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
      const tx = await orderbook
        .withWallet(maker)
        .methods.create_order(token0.address, token1.address, bidAmount, askAmount, nonceForAuthwits)
        .with({ authWitnesses: [makerAuthwit] })
        .send()
        .wait();

      // // // Get order ID from transaction return value
      // // orderId = tx.order_id;
      // // At this point, bidAmount of token0 should be transferred to the private balance of the orderbook and maker
      // // should have 0.
      // const makerBalances0 = await token0.withWallet(maker).methods.balance_of_private(maker.getAddress()).simulate();
      // expect(makerBalances0).toEqual(0n);
      // const orderbookBalances0 = await token0.withWallet(maker).methods.balance_of_private(orderbook.address).simulate();
      // expect(orderbookBalances0).toEqual(bidAmount);
    });

    // // Note that this test case depends on the previous one.
    // it('fulfills an order', async () => {
    //   const nonceForAuthwits = Fr.random();

    //   // Create authwit for taker to allow orderbook to transfer askAmount of token1 from taker to maker
    //   const takerAuthwit = await taker.createAuthWit({
    //     caller: orderbook.address,
    //     action: token1.methods.transfer_in_private(taker.getAddress(), maker.getAddress(), askAmount, nonceForAuthwits),
    //   });

    //   // Fulfill order
    //   await orderbook
    //     .withWallet(taker)
    //     .methods.fulfill_order(orderId, nonceForAuthwits)
    //     .with({ authWitnesses: [takerAuthwit] })
    //     .send()
    //     .wait();

    //   // Verify balances after order fulfillment
    //   const makerBalances0 = await token0.withWallet(maker).methods.balance_of_private(maker.getAddress()).simulate();
    //   const makerBalances1 = await token1.withWallet(maker).methods.balance_of_private(maker.getAddress()).simulate();
    //   const takerBalances0 = await token0.withWallet(taker).methods.balance_of_private(taker.getAddress()).simulate();
    //   const takerBalances1 = await token1.withWallet(taker).methods.balance_of_private(taker.getAddress()).simulate();

    //   // Full maker token 0 balance should be transferred to taker and hence maker should have 0
    //   expect(makerBalances0).toEqual(0n);
    //   // askAmount of token1 should be transferred to maker
    //   expect(makerBalances1).toEqual(askAmount);
    //   // bidAmount of token0 should be transferred to taker
    //   expect(takerBalances0).toEqual(bidAmount);
    //   // Full taker token 1 balance should be transferred to maker and hence taker should have 0
    //   expect(takerBalances1).toEqual(0n);
    // });
  });
});
