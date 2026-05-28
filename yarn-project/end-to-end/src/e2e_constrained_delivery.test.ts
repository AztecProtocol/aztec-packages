import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { HandshakeRegistryContract } from '@aztec/noir-contracts.js/HandshakeRegistry';
import { ConstrainedDeliveryTestContract } from '@aztec/noir-test-contracts.js/ConstrainedDeliveryTest';
import type { UtilityCallAuthorizationRequest } from '@aztec/pxe/server';

import { jest } from '@jest/globals';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';

const TIMEOUT = 300_000;

describe('Constrained delivery', () => {
  let handshakeRegistry: HandshakeRegistryContract | undefined;
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
                handshakeRegistry !== undefined &&
                constrainedDeliveryTest !== undefined &&
                req.target.equals(handshakeRegistry.address) &&
                req.caller.equals(constrainedDeliveryTest.address) &&
                req.functionName === 'get_app_siloed_secret' &&
                req.callerContext === 'private',
            }),
        },
      },
    }));

    ({ contract: handshakeRegistry } = await HandshakeRegistryContract.deploy(wallet).send({ from: sender }));
    ({ contract: constrainedDeliveryTest } = await ConstrainedDeliveryTestContract.deploy(wallet).send({
      from: sender,
    }));
  });

  afterAll(() => teardown());

  it('advances constrained note delivery indices across included transactions', async () => {
    const registry = getHandshakeRegistry();
    const testContract = getConstrainedDeliveryTest();

    await testContract.methods.emit(registry.address, sender, recipient).send({ from: sender });

    const { result: firstResolution } = await testContract.methods
      .calculate_and_return(registry.address, sender, recipient)
      .simulate({ from: sender });
    expectResolvedIndex(firstResolution, 1n);

    await testContract.methods.emit(registry.address, sender, recipient).send({ from: sender });

    const { result: secondResolution } = await testContract.methods
      .calculate_and_return(registry.address, sender, recipient)
      .simulate({ from: sender });
    expectResolvedIndex(secondResolution, 2n);
  });

  function getHandshakeRegistry() {
    if (handshakeRegistry === undefined) {
      throw new Error('HandshakeRegistry was not deployed');
    }
    return handshakeRegistry;
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
