import type { AztecAddress } from '@aztec/aztec.js/addresses';
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
  let contract: ConstrainedDeliveryTestContract;
  let registry: HandshakeRegistryContract;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [sender, recipient],
    } = await setup(2, { ...AUTOMINE_E2E_OPTS }));

    await ensureHandshakeRegistryPublished(wallet, sender);
    ({ contract } = await ConstrainedDeliveryTestContract.deploy(wallet).send({ from: sender }));
    registry = HandshakeRegistryContract.at(STANDARD_HANDSHAKE_REGISTRY_ADDRESS, wallet);
  });

  afterAll(() => teardown());

  it('reuses an existing standard-registry constrained handshake without utility hooks', async () => {
    await contract.methods.emit_note(sender, recipient).send({ from: sender });
    await contract.methods.emit_event(sender, recipient).send({ from: sender });

    const { result: secret } = await registry.methods
      .get_app_siloed_secret(sender, recipient, ONCHAIN_CONSTRAINED, contract.address)
      .simulate({ from: sender });
    expect(secret).toBeDefined();

    const { result: index } = await contract.methods.next_index_for_secret(secret).simulate({ from: sender });

    expect(index).toEqual(2n);
  });

  // Constrained sends on one `(sender, recipient)` chain are strictly sequential: the first send bootstraps the
  // handshake and every send emits a chain nullifier keyed only on `(sender, recipient, secret, index)`. Two sends
  // fired in parallel read the same index and collide, so one tx is rejected. Marked `it.failing` because this is a
  // protocol limitation, not a bug: it documents the constraint and will start failing (prompting its removal) if
  // parallel sends on a single chain ever become supported.
  it.failing('cannot fan out constrained sends on the same chain in parallel', async () => {
    await Promise.all([
      contract.methods.emit_note(sender, recipient).send({ from: sender }),
      contract.methods.emit_note(sender, recipient).send({ from: sender }),
    ]);
  });
});
