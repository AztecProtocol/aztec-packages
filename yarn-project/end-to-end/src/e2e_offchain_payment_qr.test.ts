import { AztecAddress } from '@aztec/aztec.js/addresses';
import { PRIVATE_LOG_CIPHERTEXT_LEN } from '@aztec/constants';
import { OffchainPaymentContract } from '@aztec/noir-test-contracts.js/OffchainPayment';
import { OFFCHAIN_MESSAGE_IDENTIFIER } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';
import type { TestWallet } from './test-wallet/test_wallet.js';
import { proveInteraction } from './test-wallet/utils.js';

const TIMEOUT = 120_000;

describe('e2e_offchain_payment_qr', () => {
  let contract: OffchainPaymentContract;
  let wallet: TestWallet;
  let accounts: AztecAddress[];
  let teardown: () => Promise<void>;

  jest.setTimeout(TIMEOUT);

  beforeAll(async () => {
    ({ teardown, wallet, accounts } = await setup(2));
    ({ contract } = await OffchainPaymentContract.deploy(wallet).send({ from: accounts[0] }));
  });

  afterAll(() => teardown());

  it('processes an offchain-delivered private payment via QR-style handoff', async () => {
    const [alice, bob] = accounts;

    const mintAmount = 100n;
    const paymentAmount = 40n;

    // Mint to Alice using onchain delivery so she can spend the note.
    await contract.methods.mint(mintAmount, alice).send({ from: alice });

    // Alice prepares the private transfer which emits offchain effects.
    const provenTx = await proveInteraction(wallet, contract.methods.transfer_offchain(paymentAmount, bob), {
      from: alice,
    });
    const { txHash } = await provenTx.send();

    const offchainEffects = provenTx.offchainEffects;
    expect(offchainEffects.length).toBeGreaterThan(0);

    // QR payload is the offchain effect for Bob.
    const effectForBob = offchainEffects.find(
      effect => effect.data[0].equals(OFFCHAIN_MESSAGE_IDENTIFIER) && effect.data[1].equals(bob.toField()),
    );
    expect(effectForBob).toBeTruthy();

    const ciphertext = effectForBob!.data.slice(2, 2 + PRIVATE_LOG_CIPHERTEXT_LEN);

    await contract.methods.offchain_enqueue(ciphertext, bob, txHash.hash).simulate({ from: bob });

    await contract.methods.offchain_sync_inbox().simulate({ from: bob });

    const { result: bobBalance } = await contract.methods.get_balance(bob).simulate({ from: bob });
    expect(bobBalance).toBe(paymentAmount);
  });
});
