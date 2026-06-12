import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { ConstrainedDeliveryTestContract } from '@aztec/noir-test-contracts.js/ConstrainedDeliveryTest';
import { STANDARD_HANDSHAKE_REGISTRY_ADDRESS } from '@aztec/standard-contracts/handshake-registry/constants';

import { jest } from '@jest/globals';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { ensureHandshakeRegistryPublished, setup } from './fixtures/setup.js';

describe('constrained delivery', () => {
  jest.setTimeout(300_000);

  let teardown: () => Promise<void>;
  let wallet: Wallet;
  let sender: AztecAddress;
  let recipient: AztecAddress;
  let contract: ConstrainedDeliveryTestContract;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [sender, recipient],
    } = await setup(2, { ...AUTOMINE_E2E_OPTS }));

    await ensureHandshakeRegistryPublished(wallet, sender);
    ({ contract } = await ConstrainedDeliveryTestContract.deploy(wallet).send({ from: sender }));
  });

  afterAll(() => teardown());

  it('resolves an existing standard-registry constrained handshake without utility hooks', async () => {
    await contract.methods.emit_note(sender, recipient).send({ from: sender });

    const {
      result: [_secret, index],
    } = await contract.methods
      .resolve_and_return(STANDARD_HANDSHAKE_REGISTRY_ADDRESS, sender, recipient)
      .simulate({ from: sender });

    expect(index).toEqual(1n);
  });
});
