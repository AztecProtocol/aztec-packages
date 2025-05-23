import { type AccountWallet, type FieldLike, Fr, type Logger, type PXE } from '@aztec/aztec.js';
import { type OrderCreated, type OrderFulfilled, OrderbookContract } from '@aztec/noir-contracts.js/Orderbook';
import type { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';

import { deployToken, mintTokensToPrivate } from './fixtures/token_utils.js';
import { setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;

// We test only a happy path here since this is just a demonstration of the orderbook contract and writing here more
// thorough tests seems unnecessary. Also hopefully we will migrate this to TXE eventually. Didn't write it in TXE
// now as there is no way to obtain public events and all of TXE will be rewritten soon.
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

  const amountIn = 1000n;
  const amountOut = 2000n;

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
    await mintTokensToPrivate(token0, adminWallet, maker.getAddress(), amountIn);
    await mintTokensToPrivate(token1, adminWallet, taker.getAddress(), amountOut);
  });

  afterAll(() => teardown());

  describe('full flow - happy path', () => {
    let orderId: {
      commitment: FieldLike;
    };

    it('creates an order', async () => {
      const nonceForAuthwits = Fr.random();

      // Create authwit for maker to allow orderbook to transfer amountIn of token0 to itself
      const makerAuthwit = await maker.createAuthWit({
        caller: orderbook.address,
        action: token0.methods.transfer_to_public(maker.getAddress(), orderbook.address, amountIn, nonceForAuthwits),
      });

      // Create order
      await orderbook
        .withWallet(maker)
        .methods.create_order(token0.address, token1.address, amountIn, amountOut, nonceForAuthwits)
        .with({ authWitnesses: [makerAuthwit] })
        .send()
        .wait();

      const orderCreatedEvents = await pxe.getPublicEvents<OrderCreated>(OrderbookContract.events.OrderCreated, 0, 100);
      expect(orderCreatedEvents.length).toBe(1);

      // Get order ID from emitted event
      orderId = orderCreatedEvents[0].order_id;

      // Get order from orderbook and verify details
      const order = await orderbook.methods.get_order(orderId).simulate();
      expect(order.amount_in).toEqual(amountIn);
      expect(order.amount_out).toEqual(amountOut);
      expect(order.zero_to_one).toBeTruthy();

      // At this point, amountIn of token0 should be transferred to the public balance of the orderbook and maker
      // should have 0.
      const orderbookBalances0 = await token0.withWallet(maker).methods.balance_of_public(orderbook.address).simulate();
      const makerBalances0 = await token0.withWallet(maker).methods.balance_of_private(maker.getAddress()).simulate();
      expect(orderbookBalances0).toEqual(amountIn);
      expect(makerBalances0).toEqual(0n);
    });

    it('fulfills an order', async () => {
      const nonceForAuthwits = Fr.random();

      // Create authwit for taker to allow orderbook to transfer amountOut of token1 to itself
      const takerAuthwit = await taker.createAuthWit({
        caller: orderbook.address,
        action: token1.methods.transfer_to_public(taker.getAddress(), orderbook.address, amountOut, nonceForAuthwits),
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
      // amountOut of token1 should be transferred to maker
      expect(makerBalances1).toEqual(amountOut);
      // amountIn of token0 should be transferred to taker
      expect(takerBalances0).toEqual(amountIn);
      // Full taker token 1 balance should be transferred to maker and hence taker should have 0
      expect(takerBalances1).toEqual(0n);
    });
  });
});
