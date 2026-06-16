// End-to-end test for the scaffolded Counter contract.
//
// Copied into the scaffolded workspace at test time by ../test.ts, then executed with
// `node --test`. Runs from inside the workspace so that:
//   - `./artifacts/Counter.js` resolves to the codegen'd bindings (and its types flow).
//   - `@aztec/*` imports resolve via the workspace's `node_modules` symlink to the
//     installed Aztec toolchain — i.e. the same packages a real user would have.
//
// The test expects an `aztec start --local-network` node reachable at NODE_URL. It uses the
// pre-funded test0 account that local-network already deployed, stands up an in-process
// EmbeddedWallet + PXE, deploys a fresh Counter, and exercises a full round trip through
// the codegen'd bindings (send + simulate).

import test from 'node:test';
import assert from 'node:assert/strict';

import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { EmbeddedWallet } from '@aztec/wallets/embedded';

import { CounterContract } from './artifacts/Counter.ts';

const NODE_URL = process.env.NODE_URL ?? 'http://localhost:8080';
const INITIAL_COUNTER_VALUE = 0n;

test('Counter deploys and increments through codegen bindings', async () => {
  const wallet = await EmbeddedWallet.create(NODE_URL, { ephemeral: true });

  const [test0] = (await getInitialTestAccountsData()) as Array<
    Awaited<ReturnType<typeof getInitialTestAccountsData>>[number] & { type?: string }
  >;
  assert.match(test0.type ?? 'schnorr', /^schnorr(_initializerless)?$/, 'supported test account type');
  const accountManager =
    test0.type === 'schnorr_initializerless'
      ? await createSchnorrInitializerlessAccount(wallet, test0)
      : await wallet.createSchnorrAccount(test0.secret, test0.salt, test0.signingKey);
  assert.equal(
    accountManager.address.toString(),
    test0.address.toString(),
    `imported ${test0.type ?? 'schnorr'} test account address`,
  );
  const owner = test0.address;

  const { contract: counter } = await CounterContract.deploy(wallet, INITIAL_COUNTER_VALUE, owner).send({
    from: owner,
  });

  const initial = await counter.methods.get_counter(owner).simulate({ from: owner });
  assert.equal(initial.result, INITIAL_COUNTER_VALUE, 'counter value just after deploy');

  await counter.methods.increment(owner).send({ from: owner });

  const afterIncrement = await counter.methods.get_counter(owner).simulate({ from: owner });
  assert.equal(afterIncrement.result, INITIAL_COUNTER_VALUE + 1n, 'counter value after increment');
});

async function createSchnorrInitializerlessAccount(
  wallet: Awaited<ReturnType<typeof EmbeddedWallet.create>>,
  account: Awaited<ReturnType<typeof getInitialTestAccountsData>>[number],
) {
  const createAccount = (
    wallet as typeof wallet & {
      createSchnorrInitializerlessAccount?: typeof wallet.createSchnorrAccount;
    }
  ).createSchnorrInitializerlessAccount;
  if (typeof createAccount !== 'function') {
    assert.fail('installed wallet supports schnorr_initializerless test accounts');
  }
  return await createAccount.call(wallet, account.secret, account.salt, account.signingKey);
}
