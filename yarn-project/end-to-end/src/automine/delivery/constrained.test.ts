<<<<<<< HEAD
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall } from '@aztec/aztec.js/contracts';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { HandshakeRegistryContract } from '@aztec/noir-contracts.js/HandshakeRegistry';
import { OnchainDeliveryTestContract } from '@aztec/noir-test-contracts.js/OnchainDeliveryTest';
import { STANDARD_HANDSHAKE_REGISTRY_ADDRESS } from '@aztec/standard-contracts/handshake-registry/constants';
=======
import { generateSchnorrAccounts } from '@aztec/accounts/testing';
import { NO_FROM } from '@aztec/aztec.js/account';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall } from '@aztec/aztec.js/contracts';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { type Fq, Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { HandshakeRegistryContract } from '@aztec/noir-contracts.js/HandshakeRegistry';
import { OnchainDeliveryTestContract } from '@aztec/noir-test-contracts.js/OnchainDeliveryTest';
import { UtilityExecutionOracle } from '@aztec/pxe/simulator';
import { STANDARD_HANDSHAKE_REGISTRY_ADDRESS } from '@aztec/standard-contracts/handshake-registry/constants';
import { computeAddressSecret, deriveMasterIncomingViewingSecretKey } from '@aztec/stdlib/keys';
>>>>>>> origin/v5-next

import { jest } from '@jest/globals';

import { AUTOMINE_E2E_OPTS } from '../../fixtures/fixtures.js';
import { ensureHandshakeRegistryPublished, setup } from '../../fixtures/setup.js';
<<<<<<< HEAD
=======
import type { TestWallet } from '../../test-wallet/test_wallet.js';

// Keep in sync with aztec::messages::delivery::OnchainDeliveryMode.
const ONCHAIN_CONSTRAINED_DELIVERY_MODE = { inner: 3 };
>>>>>>> origin/v5-next

// Delivery-method-specific tests that don't fit the generic (strategy, mode) matrix in `onchain.test.ts`
describe('delivery/constrained', () => {
  jest.setTimeout(300_000);

  let teardown: () => Promise<void>;
  let wallet: Wallet;
  let sender: AztecAddress;
  let recipient: AztecAddress;
  let batchRecipient: AztecAddress;
  let batchRecipient2: AztecAddress;
  let batchRecipient3: AztecAddress;
  let batchRecipient4: AztecAddress;
  let contract: OnchainDeliveryTestContract;
  let registry: HandshakeRegistryContract;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [sender, recipient, batchRecipient, batchRecipient2, batchRecipient3, batchRecipient4],
    } = await setup(6, { ...AUTOMINE_E2E_OPTS }));

    await ensureHandshakeRegistryPublished(wallet, sender);
    ({ contract } = await OnchainDeliveryTestContract.deploy(wallet).send({ from: sender }));
    registry = HandshakeRegistryContract.at(STANDARD_HANDSHAKE_REGISTRY_ADDRESS, wallet);
  });

  afterAll(() => teardown());

  it('reuses an existing standard-registry constrained handshake', async () => {
    await contract.methods.emit_note(recipient, 1).send({ from: sender });

    const { result: secretAfterFirstSend } = await contract.methods
      .get_app_siloed_secrets(sender, recipient)
      .simulate({ from: sender });
    expect(secretAfterFirstSend).toBeDefined();

    await contract.methods.emit_event(recipient, 1).send({ from: sender });

    const { result: secret } = await contract.methods
      .get_app_siloed_secrets(sender, recipient)
      .simulate({ from: sender });
    // The second send reuses the handshake rather than bootstrapping a new one: the secret is unchanged.
    expect(secret).toEqual(secretAfterFirstSend);

<<<<<<< HEAD
    const { result: index } = await contract.methods.next_index_for_secret(secret).simulate({ from: sender });
=======
    const { result: index } = await contract.methods
      .next_index_for_secret(secret, ONCHAIN_CONSTRAINED_DELIVERY_MODE)
      .simulate({ from: sender });
>>>>>>> origin/v5-next

    expect(index).toEqual(2n);
  });

  // Constrained sends to one recipient form a strictly ordered sequence, so concurrent and batched sends behave
  // differently: parallel txs collide on the shared index nullifier, same-tx batches work only once the handshake is
  // committed, and batches that bootstrap a brand-new recipient re-handshake onto separate secrets. Each test uses
  // its own recipient.
  describe('concurrency and batching', () => {
    // Constrained sends to one `(sender, recipient)` pair are strictly ordered: the first send bootstraps the
    // handshake and every send emits a nullifier keyed only on `(sender, recipient, secret, index)`. Two sends fired
    // in parallel read the same index and collide, so one tx is rejected. Marked `it.failing` because this is a
    // protocol limitation, not a bug: it documents the constraint and will start failing (prompting its removal) if
    // parallel sends to a single pair ever become supported. The working alternative is the batched test below.
    it.failing('cannot fan out constrained sends on the same sequence in parallel', async () => {
      await Promise.all([
        contract.methods.emit_note(recipient, 1).send({ from: sender }),
        contract.methods.emit_note(recipient, 1).send({ from: sender }),
      ]);
    });

    // CAN batch (1): a contract call may emit several constrained messages to one recipient in a single tx; each
    // later emit proves the previous nullifier as a same-tx pending nullifier. The handshake must already be
    // committed (see the re-handshake test below), so it is established first; a fresh recipient starts at index 0,
    // so two emits land indices 0 and 1 and the next index is 2.
    it('lands multiple constrained sends from a single contract call on an established handshake', async () => {
      await registry.methods.non_interactive_handshake(sender, batchRecipient).send({ from: sender });

      await contract.methods.emit_two_events(batchRecipient).send({ from: sender });

      const { result: secret } = await contract.methods
        .get_app_siloed_secrets(sender, batchRecipient)
        .simulate({ from: sender });
      expect(secret).toBeDefined();

<<<<<<< HEAD
      const { result: index } = await contract.methods.next_index_for_secret(secret).simulate({ from: sender });
=======
      const { result: index } = await contract.methods
        .next_index_for_secret(secret, ONCHAIN_CONSTRAINED_DELIVERY_MODE)
        .simulate({ from: sender });
>>>>>>> origin/v5-next
      expect(index).toEqual(2n);
    });

    // CAN batch (2): client-side BatchCall aggregates separate calls into one tx with the same effect. The two
    // emit_note calls that fail as parallel txs (above) succeed batched, given an established handshake.
    it('lands the same two sends when aggregated into one tx with BatchCall', async () => {
      await registry.methods.non_interactive_handshake(sender, batchRecipient2).send({ from: sender });

      await new BatchCall(wallet, [
        contract.methods.emit_note(batchRecipient2, 1),
        contract.methods.emit_note(batchRecipient2, 1),
      ]).send({ from: sender });

      const { result: secret } = await contract.methods
        .get_app_siloed_secrets(sender, batchRecipient2)
        .simulate({ from: sender });
      expect(secret).toBeDefined();

<<<<<<< HEAD
      const { result: index } = await contract.methods.next_index_for_secret(secret).simulate({ from: sender });
=======
      const { result: index } = await contract.methods
        .next_index_for_secret(secret, ONCHAIN_CONSTRAINED_DELIVERY_MODE)
        .simulate({ from: sender });
>>>>>>> origin/v5-next
      expect(index).toEqual(2n);
    });

    // CANNOT batch onto a brand-new recipient, even within a single contract call. The registry lookup that decides
    // reuse-vs-bootstrap is a utility call reading committed state, so the second emit cannot see the first emit's
    // pending bootstrap and re-handshakes onto a fresh secret (each handshake mints a new shared secret). The registry
    // keeps the second handshake, which holds a single log, so the next index is 1, not 2. This is why the
    // established-handshake tests above seed the handshake first.
    it('re-handshakes instead of reusing when sends bootstrap a new recipient in the same tx', async () => {
      await contract.methods.emit_two_events(batchRecipient3).send({ from: sender });

      const { result: secret } = await contract.methods
        .get_app_siloed_secrets(sender, batchRecipient3)
        .simulate({ from: sender });
      expect(secret).toBeDefined();

<<<<<<< HEAD
      const { result: index } = await contract.methods.next_index_for_secret(secret).simulate({ from: sender });
=======
      const { result: index } = await contract.methods
        .next_index_for_secret(secret, ONCHAIN_CONSTRAINED_DELIVERY_MODE)
        .simulate({ from: sender });
>>>>>>> origin/v5-next
      expect(index).toEqual(1n);
    });

    // The same new-recipient limitation holds via client-side BatchCall: the two aggregated emit_note calls each
    // bootstrap and re-handshake onto separate secrets (the utility read can't see the first's pending bootstrap),
    // so the next index is 1, not 2. Confirms the constraint is in the utility read, not the batching mechanism.
    it('re-handshakes instead of reusing when BatchCall sends bootstrap a new recipient in the same tx', async () => {
      await new BatchCall(wallet, [
        contract.methods.emit_note(batchRecipient4, 1),
        contract.methods.emit_note(batchRecipient4, 1),
      ]).send({ from: sender });

      const { result: secret } = await contract.methods
        .get_app_siloed_secrets(sender, batchRecipient4)
        .simulate({ from: sender });
      expect(secret).toBeDefined();

<<<<<<< HEAD
      const { result: index } = await contract.methods.next_index_for_secret(secret).simulate({ from: sender });
=======
      const { result: index } = await contract.methods
        .next_index_for_secret(secret, ONCHAIN_CONSTRAINED_DELIVERY_MODE)
        .simulate({ from: sender });
>>>>>>> origin/v5-next
      expect(index).toEqual(1n);
    });
  });
});

// This test builds its own PXE via setup() rather than reusing the wallet from the describe block above, because
// it needs a resolveTaggingSecretStrategy hook that only exists as a PXE-creation-time option.
describe('delivery/constrained: rejects unsound sources', () => {
  jest.setTimeout(300_000);

  it('rejects a constrained send backed by an arbitrary secret', async () => {
    const {
      teardown,
      wallet,
      accounts: [sender, recipient],
    } = await setup(2, {
      ...AUTOMINE_E2E_OPTS,
      pxeCreationOptions: {
        hooks: {
          resolveTaggingSecretStrategy: async () => ({ type: 'arbitrary-secret', secret: await Point.random() }),
        },
      },
    });
    try {
      await ensureHandshakeRegistryPublished(wallet, sender);
      const { contract } = await OnchainDeliveryTestContract.deploy(wallet).send({ from: sender });
      await expect(contract.methods.emit_event(recipient, 1).send({ from: sender })).rejects.toThrow(
        'an unconstrained tagging secret cannot back constrained delivery',
      );
    } finally {
      await teardown();
    }
  });
});
<<<<<<< HEAD
=======

// Regression test: a recipient must not be able to forge a handshake that reuses an honest handshake's tag stream.
// The ECDH secret is symmetric, so the recipient can recompute it and mint a colliding handshake; aztec-nr's
// `protect_from_forgery` docs walk the full argument. The forgery forces bob's ephemeral key via the same
// `getRandomField` oracle that unit tests mock, intercepted at the PXE, as a real attacker does by running its own PXE.
describe('constrained delivery handshake forgery', () => {
  jest.setTimeout(300_000);

  let teardown: () => Promise<void>;
  let wallet: TestWallet;
  let alice: AztecAddress;
  let bob: AztecAddress;
  let bobAddressSecret: Fq;
  let contract: OnchainDeliveryTestContract;
  let registry: HandshakeRegistryContract;

  beforeAll(async () => {
    const [bobAccount] = await generateSchnorrAccounts(1, 'schnorr');
    ({
      teardown,
      wallet,
      accounts: [alice],
    } = await setup(1, { ...AUTOMINE_E2E_OPTS, additionallyFundedAccounts: [bobAccount] }));

    // Deploy bob (the recipient and forger) from its known secret, and recover its address secret: the discrete log
    // of its address point. Knowing this is what lets bob force a handshake's ephemeral key to its own public key.
    const bobManager = await wallet.createSchnorrAccount(bobAccount.secret, bobAccount.salt, bobAccount.signingKey);
    await (await bobManager.getDeployMethod()).send({ from: NO_FROM });
    bob = bobManager.address;
    bobAddressSecret = await computeAddressSecret(
      await (await bobManager.getCompleteAddress()).getPreaddress(),
      deriveMasterIncomingViewingSecretKey(bobAccount.secret),
    );

    await ensureHandshakeRegistryPublished(wallet, alice);
    ({ contract } = await OnchainDeliveryTestContract.deploy(wallet).send({ from: alice }));
    registry = HandshakeRegistryContract.at(STANDARD_HANDSHAKE_REGISTRY_ADDRESS, wallet);
  });

  afterAll(() => teardown());

  it('binding the ephemeral key stops a recipient from reproducing an honest handshake secret', async () => {
    await registry.methods.non_interactive_handshake(alice, bob).send({ from: alice });

    await wallet.sync();
    const { result: page } = await registry.methods.get_non_interactive_handshakes(bob, 0).simulate({ from: bob });
    const aliceEphemeralPublicKey = page.items.storage[0].eph_pk;

    const { result: honestSecret } = await contract.methods
      .get_app_siloed_secrets(alice, bob)
      .simulate({ from: alice });
    expect(honestSecret).toBeDefined();

    // bob forges a handshake addressed to alice's ephemeral key, with its OWN ephemeral forced to its address point,
    // which by the symmetry above reproduces alice's raw shared point.
    const forgedRecipient = AztecAddress.fromFieldUnsafe(new Fr(aliceEphemeralPublicKey.x));
    await withForcedEphemeral(new Fr(bobAddressSecret.toBigInt()), () =>
      registry.methods.non_interactive_handshake(bob, forgedRecipient).send({ from: bob }),
    );
    const { result: forgedSecret } = await contract.methods
      .get_app_siloed_secrets(bob, forgedRecipient)
      .simulate({ from: bob });

    // The forgery announces a different ephemeral key, so the forgery protection makes the two secrets diverge.
    expect(forgedSecret).not.toEqual(honestSecret);
  });
});

/**
 * Runs `fn` with the in-circuit `random()` oracle forced to `value`, so the ephemeral key the handshake generates is
 * `value`'s keypair. A real attacker controls this by running its own PXE; we intercept it at `getRandomField`.
 *
 * Asserts the interception actually happened: whether the ephemeral key is forced is the premise of the forgery
 * test, so if `getRandomField` ever stops carrying it the "forgery" silently degrades to an ordinary random
 * handshake and the caller's divergence assertion would pass vacuously.
 */
async function withForcedEphemeral<T>(value: Fr, fn: () => Promise<T>): Promise<T> {
  const spy = jest.spyOn(UtilityExecutionOracle.prototype, 'getRandomField').mockReturnValue(value);
  try {
    const result = await fn();
    expect(spy).toHaveBeenCalled();
    return result;
  } finally {
    spy.mockRestore();
  }
}
>>>>>>> origin/v5-next
