import { pickBridgeRoute } from './bridging.js';

const FJ = 10n ** 18n;

describe('pickBridgeRoute', () => {
  it('transfers when the balance covers the requested amount, even with a faucet available', () => {
    expect(pickBridgeRoute({ hasFaucet: true, l1Balance: 1000n * FJ, amount: 1000n * FJ })).toEqual({
      useFaucet: false,
      amount: 1000n * FJ,
    });
    expect(pickBridgeRoute({ hasFaucet: false, l1Balance: 5n * FJ, amount: 1n * FJ })).toEqual({
      useFaucet: false,
      amount: 1n * FJ,
    });
  });

  it('mints when the balance falls short of the requested amount and a faucet exists', () => {
    // A leftover balance below the request must not skip the mint — bridging the full amount from a
    // short balance would revert on L1 with ERC20InsufficientBalance.
    expect(pickBridgeRoute({ hasFaucet: true, l1Balance: 50n * FJ, amount: 1000n * FJ })).toEqual({ useFaucet: true });
    expect(pickBridgeRoute({ hasFaucet: true, l1Balance: 0n, amount: 1000n * FJ })).toEqual({ useFaucet: true });
  });

  it('throws with the shortfall when the balance falls short and there is no faucet', () => {
    expect(() => pickBridgeRoute({ hasFaucet: false, l1Balance: 50n * FJ, amount: 1000n * FJ })).toThrow(/holds 50/);
  });

  it('requires a faucet when no amount is given', () => {
    expect(pickBridgeRoute({ hasFaucet: true, l1Balance: 0n })).toEqual({ useFaucet: true });
    expect(() => pickBridgeRoute({ hasFaucet: false, l1Balance: 1000n * FJ })).toThrow(/`amount` is required/);
  });
});
