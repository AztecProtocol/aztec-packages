import { getPublicEvents } from '@aztec/aztec.js/events';
import { Fr } from '@aztec/aztec.js/fields';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { type LargeEvent, LargePublicEventContract } from '@aztec/noir-test-contracts.js/LargePublicEvent';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import { jest } from '@jest/globals';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';

const TIMEOUT = 300_000;

/// Tests that events exceeding MAX_EVENT_SERIALIZED_LEN can be emitted publicly.
describe('LargePublicEvent', () => {
  let contract: LargePublicEventContract;
  jest.setTimeout(TIMEOUT);

  let wallet: Wallet;
  let aztecNode: AztecNode;
  let accountAddress: AztecAddress;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      aztecNode,
      accounts: [accountAddress],
    } = await setup(1, { ...AUTOMINE_E2E_OPTS }));
    ({ contract } = await LargePublicEventContract.deploy(wallet).send({ from: accountAddress }));
  });

  afterAll(() => teardown());

  it('emits and retrieves a public event with more than MAX_EVENT_SERIALIZED_LEN fields', async () => {
    const data = Array.from({ length: 11 }, () => Fr.random());

    const { receipt: tx } = await contract.methods.emit_large_event(data).send({ from: accountAddress });

    const { events } = await getPublicEvents<LargeEvent>(aztecNode, LargePublicEventContract.events.LargeEvent, {
      fromBlock: BlockNumber(tx.blockNumber!),
      toBlock: BlockNumber(tx.blockNumber! + 1),
    });

    expect(events.length).toBe(1);
    expect(events[0].event.data).toEqual(data.map(f => f.toBigInt()));
  });
});
