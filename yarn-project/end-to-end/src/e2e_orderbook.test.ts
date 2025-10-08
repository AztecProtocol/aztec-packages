import { AztecAddress, type AztecNode, type FieldLike, Fr, type Logger, getDecodedPublicEvents } from '@aztec/aztec.js';
import { type OrderCreated, type OrderFulfilled, OrderbookContract } from '@aztec/noir-contracts.js/Orderbook';
import type { TokenContract } from '@aztec/noir-contracts.js/Token';
import type { TestWallet } from '@aztec/test-wallet/server';

import { jest } from '@jest/globals';

import { deployToken, mintTokensToPrivate } from './fixtures/token_utils.js';
import { setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;

// Unhappy path tests are written only in Noir.
//
// We keep this test around because it's the only TS test where we have async completion of a partial note (partial
// note created in one tx and completed in another).
describe('Orderbook', () => {
  jest.setTimeout(TIMEOUT);

  let teardown: () => Promise<void>;
  let logger: Logger;

  let aztecNode: AztecNode;

  let wallet: TestWallet;

  let adminAddress: AztecAddress;
  let makerAddress: AztecAddress;
  let takerAddress: AztecAddress;

  let token0: TokenContract;
  let token1: TokenContract;
  let orderbook: OrderbookContract;

  const bidAmount = 1000n;
  const askAmount = 2000n;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      aztecNode,
      accounts: [adminAddress, makerAddress, takerAddress],
      logger,
    } = await setup(3));

    token0 = await deployToken(wallet, adminAddress, 0n, logger);
    token1 = await deployToken(wallet, adminAddress, 0n, logger);

    orderbook = await OrderbookContract.deploy(wallet, token0.address, token1.address)
      .send({ from: adminAddress })
      .deployed();

    // Mint tokens to maker and taker
    await mintTokensToPrivate(token0, adminAddress, makerAddress, bidAmount);
    await mintTokensToPrivate(token1, adminAddress, takerAddress, askAmount);
  });

  afterAll(() => teardown());

  describe('full flow - happy path', () => {
    let orderId: FieldLike;

    it('creates an order', async () => {
      const nonceForAuthwits = Fr.random();

      // Create authwit for maker to allow orderbook to transfer bidAmount of token0 to itself
      const makerAuthwit = await wallet.createAuthWit(makerAddress, {
        caller: orderbook.address,
        action: token0.methods.transfer_to_public(makerAddress, orderbook.address, bidAmount, nonceForAuthwits),
      });

      // Create order
      await orderbook.methods
        .create_order(token0.address, token1.address, bidAmount, askAmount, nonceForAuthwits)
        .with({ authWitnesses: [makerAuthwit] })
        .send({ from: makerAddress })
        .wait();

      const orderCreatedEvents = await getDecodedPublicEvents<OrderCreated>(
        aztecNode,
        OrderbookContract.events.OrderCreated,
        0,
        100,
      );
      expect(orderCreatedEvents.length).toBe(1);

      // TODO: Check that the order ID returned from create_order matches the one in the event. It's currently not
      // supported by Aztec.js to get a return value from a sent transaction.

      // Get order ID from emitted event
      orderId = orderCreatedEvents[0].order_id;

      // Get order from orderbook and verify details
      const [order, isFulfilled] = await orderbook.methods.get_order(orderId).simulate({ from: adminAddress });
      expect(order.bid_amount).toEqual(bidAmount);
      expect(order.ask_amount).toEqual(askAmount);
      expect(order.bid_token_is_zero).toBeTrue();
      expect(isFulfilled).toBeFalse();

      // At this point, bidAmount of token0 should be transferred to the public balance of the orderbook and maker
      // should have 0.
      const orderbookBalances0 = await token0.methods
        .balance_of_public(orderbook.address)
        .simulate({ from: makerAddress });
      const makerBalances0 = await token0.methods.balance_of_private(makerAddress).simulate({ from: makerAddress });
      expect(orderbookBalances0).toEqual(bidAmount);
      expect(makerBalances0).toEqual(0n);
    });

    // Note that this test case depends on the previous one.
    it('fulfills an order', async () => {
      const nonceForAuthwits = Fr.random();

      // Create authwit for taker to allow orderbook to transfer askAmount of token1 from taker to maker's partial note
      const takerAuthwit = await wallet.createAuthWit(takerAddress, {
        caller: orderbook.address,
        action: token1.methods.finalize_transfer_to_private_from_private(
          takerAddress,
          { commitment: orderId }, // makerPartialNote
          askAmount,
          nonceForAuthwits,
        ),
      });

      // Fulfill order
      await orderbook.methods
        .fulfill_order(orderId, nonceForAuthwits)
        .with({ authWitnesses: [takerAuthwit] })
        .send({ from: takerAddress })
        .wait();

      // Verify order was fulfilled by checking events
      const orderFulfilledEvents = await getDecodedPublicEvents<OrderFulfilled>(
        aztecNode,
        OrderbookContract.events.OrderFulfilled,
        0,
        100,
      );
      expect(orderFulfilledEvents.length).toBe(1);
      expect(orderFulfilledEvents[0].order_id).toEqual(orderId);

      // Verify balances after order fulfillment
      const makerBalances0 = await token0.methods.balance_of_private(makerAddress).simulate({ from: makerAddress });
      const makerBalances1 = await token1.methods.balance_of_private(makerAddress).simulate({ from: makerAddress });
      const takerBalances0 = await token0.methods.balance_of_private(takerAddress).simulate({ from: takerAddress });
      const takerBalances1 = await token1.methods.balance_of_private(takerAddress).simulate({ from: takerAddress });

      // Full maker token 0 balance should be transferred to taker and hence maker should have 0
      expect(makerBalances0).toEqual(0n);
      // askAmount of token1 should be transferred to maker
      expect(makerBalances1).toEqual(askAmount);
      // bidAmount of token0 should be transferred to taker
      expect(takerBalances0).toEqual(bidAmount);
      // Full taker token 1 balance should be transferred to maker and hence taker should have 0
      expect(takerBalances1).toEqual(0n);

      // Verify that the order is fulfilled
      const [_, isFulfilled] = await orderbook.methods.get_order(orderId).simulate({ from: adminAddress });
      expect(isFulfilled).toBeTrue();
    });
  });
});
