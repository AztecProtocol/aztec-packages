import { type AccountWallet, type FieldLike, Fr, type Logger, type PXE } from '@aztec/aztec.js';
import { type OrderCreated, type OrderFulfilled, OrderbookContract } from '@aztec/noir-contracts.js/Orderbook';
import type { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';

import { deployToken, mintTokensToPrivate } from './fixtures/token_utils.js';
import { setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;

// TODO(#14525): Write thorough Orderbook tests. Currently we test only a happy path here because we will migrate these
// tests to TXE once TXE 2.0 is ready. Didn't write it in TXE now as there is no way to obtain public events and all of
// TXE will be rewritten soon.
describe('Orderbook', () => {
  jest.setTimeout(TIMEOUT);

  let teardown: () => Promise<void>;
  let logger: Logger;

  let pxe: PXE;

  let adminWallet: AccountWallet;
  let maker: AccountWallet;
  let taker: AccountWallet;

  let token0: TokenContract;
  let token1: TokenContract;
  let orderbook: OrderbookContract;

  const bidAmount = 1000n;
  const askAmount = 2000n;

  beforeAll(async () => {
    ({
      pxe,
      teardown,
      wallets: [adminWallet, maker, taker],
      logger,
    } = await setup(3));

    token0 = await deployToken(adminWallet, 0n, logger);
    token1 = await deployToken(adminWallet, 0n, logger);

    orderbook = await OrderbookContract.deploy(adminWallet, token0.address, token1.address).send().deployed();

    // Mint tokens to maker and taker
    await mintTokensToPrivate(token0, adminWallet, maker.getAddress(), bidAmount);
    await mintTokensToPrivate(token1, adminWallet, taker.getAddress(), askAmount);
  });

  afterAll(() => teardown());

  describe('full flow - happy path', () => {
    let orderId: FieldLike;

    it('creates an order', async () => {
      const nonceForAuthwits = Fr.random();

      // Create authwit for maker to allow orderbook to transfer bidAmount of token0 to itself
      const makerAuthwit = await maker.createAuthWit({
        caller: orderbook.address,
        action: token0.methods.transfer_to_public(maker.getAddress(), orderbook.address, bidAmount, nonceForAuthwits),
      });

      // Create order
      await orderbook
        .withWallet(maker)
        .methods.create_order(token0.address, token1.address, bidAmount, askAmount, nonceForAuthwits)
        .with({ authWitnesses: [makerAuthwit] })
        .send()
        .wait();

      const orderCreatedEvents = await pxe.getPublicEvents<OrderCreated>(OrderbookContract.events.OrderCreated, 0, 100);
      expect(orderCreatedEvents.length).toBe(1);

      // TODO: Check that the order ID returned from create_order matches the one in the event. It's currently not
      // supported by Aztec.js to get a return value from a sent transaction.

      // Get order ID from emitted event
      orderId = orderCreatedEvents[0].order_id;

      // Get order from orderbook and verify details
      const [order, isFulfilled] = await orderbook.methods.get_order(orderId).simulate();
      expect(order.bid_amount).toEqual(bidAmount);
      expect(order.ask_amount).toEqual(askAmount);
      expect(order.bid_token_is_zero).toBeTrue();
      expect(isFulfilled).toBeFalse();

      // At this point, bidAmount of token0 should be transferred to the public balance of the orderbook and maker
      // should have 0.
      const orderbookBalances0 = await token0.withWallet(maker).methods.balance_of_public(orderbook.address).simulate();
      const makerBalances0 = await token0.withWallet(maker).methods.balance_of_private(maker.getAddress()).simulate();
      expect(orderbookBalances0).toEqual(bidAmount);
      expect(makerBalances0).toEqual(0n);
    });

    // Note that this test case depends on the previous one.
    it('fulfills an order', async () => {
      const nonceForAuthwits = Fr.random();

      // Create authwit for taker to allow orderbook to transfer askAmount of token1 from taker to maker's partial note
      const takerAuthwit = await taker.createAuthWit({
        caller: orderbook.address,
        action: token1.methods.finalize_transfer_to_private_from_private(
          taker.getAddress(),
          { commitment: orderId }, // makerPartialNote
          askAmount,
          nonceForAuthwits,
        ),
      });

      // Fulfill order
      await orderbook
        .withWallet(taker)
        .methods.fulfill_order(orderId, nonceForAuthwits)
        .with({ authWitnesses: [takerAuthwit] })
        .send()
        .wait();

      // Verify order was fulfilled by checking events
      const orderFulfilledEvents = await pxe.getPublicEvents<OrderFulfilled>(
        OrderbookContract.events.OrderFulfilled,
        0,
        100,
      );
      expect(orderFulfilledEvents.length).toBe(1);
      expect(orderFulfilledEvents[0].order_id).toEqual(orderId);

      // Verify balances after order fulfillment
      const makerBalances0 = await token0.withWallet(maker).methods.balance_of_private(maker.getAddress()).simulate();
      const makerBalances1 = await token1.withWallet(maker).methods.balance_of_private(maker.getAddress()).simulate();
      const takerBalances0 = await token0.withWallet(taker).methods.balance_of_private(taker.getAddress()).simulate();
      const takerBalances1 = await token1.withWallet(taker).methods.balance_of_private(taker.getAddress()).simulate();

      // Full maker token 0 balance should be transferred to taker and hence maker should have 0
      expect(makerBalances0).toEqual(0n);
      // askAmount of token1 should be transferred to maker
      expect(makerBalances1).toEqual(askAmount);
      // bidAmount of token0 should be transferred to taker
      expect(takerBalances0).toEqual(bidAmount);
      // Full taker token 1 balance should be transferred to maker and hence taker should have 0
      expect(takerBalances1).toEqual(0n);

      // Verify that the order is fulfilled
      const [_, isFulfilled] = await orderbook.methods.get_order(orderId).simulate();
      expect(isFulfilled).toBeTrue();
    });
  });
});
