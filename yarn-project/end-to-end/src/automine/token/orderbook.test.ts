import type { FieldLike } from '@aztec/aztec.js/abi';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { getPublicEvents } from '@aztec/aztec.js/events';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { type OrderCreated, type OrderFulfilled, OrderbookContract } from '@aztec/noir-contracts.js/Orderbook';
import type { TestTokenContract } from '@aztec/noir-test-contracts.js/TestToken';

import { jest } from '@jest/globals';

import { deployTestToken, mintTokensToPrivate } from '../../fixtures/token_utils.js';
import type { TestWallet } from '../../test-wallet/test_wallet.js';
import { AutomineTestContext } from '../automine_test_context.js';

const TIMEOUT = 300_000;

// Unhappy path tests are written only in Noir.
//
// We keep this test around because it's the only TS test where we have async completion of a partial note (partial
// note created in one tx and completed in another).
//
// Exercises the Orderbook contract's create_order / fulfill_order flow. Uses a single node with AutomineSequencer
// and three accounts (admin, maker, taker). Each step lands in its own block; the partial note opened by
// create_order is completed in fulfill_order's block.
describe('automine/token/orderbook', () => {
  jest.setTimeout(TIMEOUT);

  let teardown: () => Promise<void>;
  let logger: Logger;

  let aztecNode: AztecNode;

  let wallet: TestWallet;

  let adminAddress: AztecAddress;
  let makerAddress: AztecAddress;
  let takerAddress: AztecAddress;

  let token0: TestTokenContract;
  let token1: TestTokenContract;
  let orderbook: OrderbookContract;

  const bidAmount = 1000n;
  const askAmount = 2000n;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [adminAddress, makerAddress, takerAddress],
      aztecNode,
      logger,
    } = (await AutomineTestContext.setup({ numberOfAccounts: 3 })).context);

    ({ contract: token0 } = await deployTestToken(wallet, adminAddress, 0n, logger));
    ({ contract: token1 } = await deployTestToken(wallet, adminAddress, 0n, logger));

    ({ contract: orderbook } = await OrderbookContract.deploy(wallet, token0.address, token1.address).send({
      from: adminAddress,
    }));

    // Mint tokens to maker and taker
    await mintTokensToPrivate(token0, adminAddress, makerAddress, bidAmount);
    await mintTokensToPrivate(token1, adminAddress, takerAddress, askAmount);
  });

  afterAll(() => teardown());

  // Happy-path sequence: create an order (opening a partial note), then fulfill it (completing that note
  // in the next tx). Two sequential it() blocks intentionally share state through `orderId`.
  describe('full flow - happy path', () => {
    let orderId: FieldLike;

    // Maker creates an authwit authorising the orderbook to escrow bidAmount of token0, calls
    // create_order, then asserts the OrderCreated event was emitted and the orderbook holds bidAmount.
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
        .send({ from: makerAddress });

      const { events: orderCreatedEvents } = await getPublicEvents<OrderCreated>(
        aztecNode,
        OrderbookContract.events.OrderCreated,
        { contractAddress: orderbook.address },
      );
      expect(orderCreatedEvents.length).toBe(1);

      // TODO: Check that the order ID returned from create_order matches the one in the event. It's currently not
      // supported by Aztec.js to get a return value from a sent transaction.

      // Get order ID from emitted event
      orderId = orderCreatedEvents[0].event.order_id;

      // Get order from orderbook and verify details
      const {
        result: [order, isFulfilled],
      } = await orderbook.methods.get_order(orderId).simulate({ from: adminAddress });
      expect(order.bid_amount).toEqual(bidAmount);
      expect(order.ask_amount).toEqual(askAmount);
      expect(order.bid_token_is_zero).toBeTrue();
      expect(isFulfilled).toBeFalse();

      // At this point, bidAmount of token0 should be transferred to the public balance of the orderbook and maker
      // should have 0.
      const { result: orderbookBalances0 } = await token0.methods
        .balance_of_public(orderbook.address)
        .simulate({ from: makerAddress });
      const { result: makerBalances0 } = await token0.methods
        .balance_of_private(makerAddress)
        .simulate({ from: makerAddress });
      expect(orderbookBalances0).toEqual(bidAmount);
      expect(makerBalances0).toEqual(0n);
    });

    // Note that this test case depends on the previous one.
    // Taker creates an authwit for finalize_transfer_to_private_from_private, calls fulfill_order,
    // then asserts the OrderFulfilled event and final private balances for both maker and taker.
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
        .send({ from: takerAddress });

      // Verify order was fulfilled by checking events
      const { events: orderFulfilledEvents } = await getPublicEvents<OrderFulfilled>(
        aztecNode,
        OrderbookContract.events.OrderFulfilled,
        { contractAddress: orderbook.address },
      );
      expect(orderFulfilledEvents.length).toBe(1);
      expect(orderFulfilledEvents[0].event.order_id).toEqual(orderId);

      // Verify balances after order fulfillment
      const { result: makerBalances0 } = await token0.methods
        .balance_of_private(makerAddress)
        .simulate({ from: makerAddress });
      const { result: makerBalances1 } = await token1.methods
        .balance_of_private(makerAddress)
        .simulate({ from: makerAddress });
      const { result: takerBalances0 } = await token0.methods
        .balance_of_private(takerAddress)
        .simulate({ from: takerAddress });
      const { result: takerBalances1 } = await token1.methods
        .balance_of_private(takerAddress)
        .simulate({ from: takerAddress });

      // Full maker token 0 balance should be transferred to taker and hence maker should have 0
      expect(makerBalances0).toEqual(0n);
      // askAmount of token1 should be transferred to maker
      expect(makerBalances1).toEqual(askAmount);
      // bidAmount of token0 should be transferred to taker
      expect(takerBalances0).toEqual(bidAmount);
      // Full taker token 1 balance should be transferred to maker and hence taker should have 0
      expect(takerBalances1).toEqual(0n);

      // Verify that the order is fulfilled
      const {
        result: [_, isFulfilled],
      } = await orderbook.methods.get_order(orderId).simulate({ from: adminAddress });
      expect(isFulfilled).toBeTrue();
    });
  });
});
