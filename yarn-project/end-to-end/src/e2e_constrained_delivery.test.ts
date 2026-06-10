import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { ConstrainedDeliveryTestContract } from '@aztec/noir-test-contracts.js/ConstrainedDeliveryTest';
import type { UtilityCallAuthorizationRequest } from '@aztec/pxe/server';
import { getStandardHandshakeRegistry } from '@aztec/standard-contracts/handshake-registry';

import { jest } from '@jest/globals';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { ensureHandshakeRegistryPublished, setup } from './fixtures/utils.js';

const TIMEOUT = 300_000;

describe('Constrained delivery', () => {
  let handshakeRegistryAddress: AztecAddress | undefined;
  let constrainedDeliveryTest: ConstrainedDeliveryTestContract | undefined;
  let wallet: Wallet;
  let sender: AztecAddress;
  let recipient: AztecAddress;
  let teardown: () => Promise<void> = async () => {};
  jest.setTimeout(TIMEOUT);

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [sender, recipient],
    } = await setup(2, {
      ...AUTOMINE_E2E_OPTS,
      pxeCreationOptions: {
        hooks: {
          authorizeUtilityCall: (req: UtilityCallAuthorizationRequest) =>
            Promise.resolve({
              authorized:
                handshakeRegistryAddress !== undefined &&
                constrainedDeliveryTest !== undefined &&
                req.target.equals(handshakeRegistryAddress) &&
                req.caller.equals(constrainedDeliveryTest.address) &&
                req.functionName === 'get_app_siloed_secret' &&
                req.callerContext === 'private',
            }),
        },
      },
    }));

    ({
      instance: { address: handshakeRegistryAddress },
    } = await getStandardHandshakeRegistry());
    await ensureHandshakeRegistryPublished(wallet, sender);

    ({ contract: constrainedDeliveryTest } = await ConstrainedDeliveryTestContract.deploy(wallet).send({
      from: sender,
    }));
  });

  afterAll(() => teardown());

  it('advances constrained note delivery indices across included transactions', async () => {
    const registry = getHandshakeRegistryAddress();
    const testContract = getConstrainedDeliveryTest();

    await testContract.methods.emit(sender, recipient).send({ from: sender });

    const { result: firstResolution } = await testContract.methods
      .resolve_and_return(registry, sender, recipient)
      .simulate({ from: sender });
    expectResolvedIndex(firstResolution, 1n);

    await testContract.methods.emit(sender, recipient).send({ from: sender });

    const { result: secondResolution } = await testContract.methods
      .resolve_and_return(registry, sender, recipient)
      .simulate({ from: sender });
    expectResolvedIndex(secondResolution, 2n);
  });

  function getHandshakeRegistryAddress() {
    if (handshakeRegistryAddress === undefined) {
      throw new Error('HandshakeRegistry was not published');
    }
    return handshakeRegistryAddress;
  }

  function getConstrainedDeliveryTest() {
    if (constrainedDeliveryTest === undefined) {
      throw new Error('ConstrainedDeliveryTest was not deployed');
    }
    return constrainedDeliveryTest;
  }
});

function expectResolvedIndex(resolution: unknown, expectedIndex: bigint) {
  if (!Array.isArray(resolution)) {
    throw new Error(`Expected constrained delivery resolution tuple, got ${String(resolution)}`);
  }
  expect(resolution[1]).toEqual(expectedIndex);
}
