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
    expect(secret._is_some).toBe(true);

    const { result: index } = await contract.methods.next_index_for_secret(secret._value).simulate({ from: sender });

    expect(index).toEqual(2n);
  });
});
