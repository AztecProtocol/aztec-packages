import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall } from '@aztec/aztec.js/contracts';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { HandshakeRegistryContract } from '@aztec/noir-contracts.js/HandshakeRegistry';
import { ConstrainedDeliveryTestContract } from '@aztec/noir-test-contracts.js/ConstrainedDeliveryTest';
import { STANDARD_HANDSHAKE_REGISTRY_ADDRESS } from '@aztec/standard-contracts/handshake-registry/constants';

import { jest } from '@jest/globals';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { ensureHandshakeRegistryPublished, setup } from './fixtures/setup.js';

const ONCHAIN_CONSTRAINED = { inner: 3 };

describe('constrained delivery', () => {
  jest.setTimeout(300_000);

  let teardown: () => Promise<void>;
  let wallet: Wallet;
  let sender: AztecAddress;
  let recipient: AztecAddress;
  let batchRecipient: AztecAddress;
  let batchRecipient2: AztecAddress;
  let batchRecipient3: AztecAddress;
  let batchRecipient4: AztecAddress;
  let contract: ConstrainedDeliveryTestContract;
  let registry: HandshakeRegistryContract;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [sender, recipient, batchRecipient, batchRecipient2, batchRecipient3, batchRecipient4],
    } = await setup(6, { ...AUTOMINE_E2E_OPTS }));

    await ensureHandshakeRegistryPublished(wallet, sender);
    ({ contract } = await ConstrainedDeliveryTestContract.deploy(wallet).send({ from: sender }));
    registry = HandshakeRegistryContract.at(STANDARD_HANDSHAKE_REGISTRY_ADDRESS, wallet);
  });

  afterAll(() => teardown());

  it('reuses an existing standard-registry constrained handshake', async () => {
    await contract.methods.emit_note(recipient).send({ from: sender });
    await contract.methods.emit_event(recipient).send({ from: sender });

    const { result: secret } = await registry.methods
      .get_app_siloed_secret(sender, recipient, ONCHAIN_CONSTRAINED, contract.address)
      .simulate({ from: sender });
    expect(secret).toBeDefined();

    const { result: index } = await contract.methods.next_index_for_secret(secret).simulate({ from: sender });

    expect(index).toEqual(2n);
  });

  // Constrained sends on one chain are strictly sequential, so concurrent and batched sends behave differently:
  // parallel txs collide on the per-chain nullifier, same-tx batches work only on an already-committed chain, and
  // batches that bootstrap a brand-new chain re-handshake onto separate chains. Each test uses its own recipient.
  describe('concurrency and batching', () => {
    // Constrained sends on one `(sender, recipient)` chain are strictly sequential: the first send bootstraps the
    // handshake and every send emits a chain nullifier keyed only on `(sender, recipient, secret, index)`. Two sends
    // fired in parallel read the same index and collide, so one tx is rejected. Marked `it.failing` because this is a
    // protocol limitation, not a bug: it documents the constraint and will start failing (prompting its removal) if
    // parallel sends on a single chain ever become supported. The working alternative is the batched test below.
    it.failing('cannot fan out constrained sends on the same chain in parallel', async () => {
      await Promise.all([
        contract.methods.emit_note(recipient).send({ from: sender }),
        contract.methods.emit_note(recipient).send({ from: sender }),
      ]);
    });

    // CAN batch (1): a contract call may emit several constrained messages to one recipient in a single tx; each
    // later emit proves the previous chain nullifier as a same-tx pending nullifier. The handshake must already be
    // committed (see the re-handshake test below), so it is established first; a fresh recipient keeps the chain
    // at index 0, so two emits land indices 0 and 1 and the next index is 2.
    it('lands multiple constrained sends from a single contract call on an established chain', async () => {
      await registry.methods
        .non_interactive_handshake(sender, batchRecipient, ONCHAIN_CONSTRAINED)
        .send({ from: sender });

      await contract.methods.emit_two_events(batchRecipient).send({ from: sender });

      const { result: secret } = await registry.methods
        .get_app_siloed_secret(sender, batchRecipient, ONCHAIN_CONSTRAINED, contract.address)
        .simulate({ from: sender });
      expect(secret).toBeDefined();

      const { result: index } = await contract.methods.next_index_for_secret(secret).simulate({ from: sender });
      expect(index).toEqual(2n);
    });

    // CAN batch (2): client-side BatchCall aggregates separate calls into one tx with the same effect. The two
    // emit_note calls that fail as parallel txs (above) succeed batched, given an established handshake.
    it('lands the same two sends when aggregated into one tx with BatchCall', async () => {
      await registry.methods
        .non_interactive_handshake(sender, batchRecipient2, ONCHAIN_CONSTRAINED)
        .send({ from: sender });

      await new BatchCall(wallet, [
        contract.methods.emit_note(batchRecipient2),
        contract.methods.emit_note(batchRecipient2),
      ]).send({ from: sender });

      const { result: secret } = await registry.methods
        .get_app_siloed_secret(sender, batchRecipient2, ONCHAIN_CONSTRAINED, contract.address)
        .simulate({ from: sender });
      expect(secret).toBeDefined();

      const { result: index } = await contract.methods.next_index_for_secret(secret).simulate({ from: sender });
      expect(index).toEqual(2n);
    });

    // CANNOT batch onto a brand-new chain, even within a single contract call. The registry lookup that decides
    // reuse-vs-bootstrap is a utility call reading committed state, so the second emit cannot see the first emit's
    // pending bootstrap and re-handshakes onto a separate chain (each handshake mints a fresh shared secret). The
    // registry keeps the second handshake, whose chain holds a single log, so the next index is 1, not 2. This is
    // why the established-chain tests above seed the handshake first.
    it('re-handshakes instead of reusing when sends bootstrap a new chain in the same tx', async () => {
      await contract.methods.emit_two_events(batchRecipient3).send({ from: sender });

      const { result: secret } = await registry.methods
        .get_app_siloed_secret(sender, batchRecipient3, ONCHAIN_CONSTRAINED, contract.address)
        .simulate({ from: sender });
      expect(secret).toBeDefined();

      const { result: index } = await contract.methods.next_index_for_secret(secret).simulate({ from: sender });
      expect(index).toEqual(1n);
    });

    // The new-chain limitation is the same via client-side BatchCall: the two aggregated emit_note calls each
    // bootstrap and re-handshake onto separate chains (the utility read can't see the first's pending bootstrap),
    // so the next index is 1, not 2. Confirms the constraint is in the utility read, not the batching mechanism.
    it('re-handshakes instead of reusing when BatchCall sends bootstrap a new chain in the same tx', async () => {
      await new BatchCall(wallet, [
        contract.methods.emit_note(batchRecipient4),
        contract.methods.emit_note(batchRecipient4),
      ]).send({ from: sender });

      const { result: secret } = await registry.methods
        .get_app_siloed_secret(sender, batchRecipient4, ONCHAIN_CONSTRAINED, contract.address)
        .simulate({ from: sender });
      expect(secret).toBeDefined();

      const { result: index } = await contract.methods.next_index_for_secret(secret).simulate({ from: sender });
      expect(index).toEqual(1n);
    });
  });
});
