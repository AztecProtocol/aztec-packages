// Test suite for testing proper ordering of side effects
import { Fr, type FunctionSelector, type PXE, type Wallet, toBigIntBE } from '@aztec/aztec.js';
import { serializeToBuffer } from '@aztec/foundation/serialize';
import { ChildContract } from '@aztec/noir-test-contracts.js/Child';
import { ParentContract } from '@aztec/noir-test-contracts.js/Parent';
import { computeCalldataHash } from '@aztec/stdlib/hash';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';

const TIMEOUT = 300_000;

// See https://github.com/AztecProtocol/aztec-packages/issues/1601
describe('e2e_ordering', () => {
  jest.setTimeout(TIMEOUT);

  let pxe: PXE;
  let wallet: Wallet;
  let teardown: () => Promise<void>;

  const expectLogsFromLastBlockToBe = async (logMessages: bigint[]) => {
    // docs:start:get_logs
    const fromBlock = await pxe.getBlockNumber();
    const logFilter = {
      fromBlock,
      toBlock: fromBlock + 1,
    };
    const publicLogs = (await pxe.getPublicLogs(logFilter)).logs;
    // docs:end:get_logs

    const bigintLogs = publicLogs.map(extendedLog => toBigIntBE(serializeToBuffer(extendedLog.log.getEmittedFields())));

    expect(bigintLogs).toStrictEqual(logMessages);
  };

  beforeEach(async () => {
    ({ teardown, pxe, wallet } = await setup());
  }, TIMEOUT);

  afterEach(() => teardown());

  describe('with parent and child contract', () => {
    let parent: ParentContract;
    let child: ChildContract;
    let pubSetValueSelector: FunctionSelector;

    beforeEach(async () => {
      parent = await ParentContract.deploy(wallet).send().deployed();
      child = await ChildContract.deploy(wallet).send().deployed();
      pubSetValueSelector = await child.methods.pub_set_value.selector();
    }, TIMEOUT);

    describe('enqueued public calls ordering', () => {
      const nestedValue = 10n;
      const directValue = 20n;

      const expectedOrders = {
        enqueue_calls_to_child_with_nested_first: [nestedValue, directValue] as bigint[], // eslint-disable-line camelcase
        enqueue_calls_to_child_with_nested_last: [directValue, nestedValue] as bigint[], // eslint-disable-line camelcase
      } as const;

      it.each(['enqueue_calls_to_child_with_nested_first', 'enqueue_calls_to_child_with_nested_last'] as const)(
        'orders public function execution in %s',
        async method => {
          const expectedOrder = expectedOrders[method];
          const action = parent.methods[method](child.address, pubSetValueSelector);
          const tx = await action.prove();

          await tx.send().wait();

          // There are two enqueued calls
          const enqueuedPublicCalls = tx.getPublicCallRequestsWithCalldata();
          expect(enqueuedPublicCalls.length).toEqual(2);

          // The calldataHashes are derived from the calldata.
          await Promise.all(
            enqueuedPublicCalls.map(async ({ request, calldata }) =>
              expect(request.calldataHash).toEqual(await computeCalldataHash(calldata)),
            ),
          );

          // The enqueued public calls are in the expected order based on the argument they set.
          expect(enqueuedPublicCalls.map(c => c.args[0].toBigInt())).toEqual(expectedOrder);

          // Logs are emitted in the expected order
          await expectLogsFromLastBlockToBe(expectedOrder);

          // The final value of the child is the last one set
          const value = await pxe.getPublicStorageAt(child.address, new Fr(1));
          expect(value.toBigInt()).toBe(expectedOrder[1]); // final state should match last value set
        },
      );
    });

    describe('public state update ordering, and final state value check', () => {
      const nestedValue = 10n;
      const directValue = 20n;

      const expectedOrders = {
        set_value_twice_with_nested_first: [nestedValue, directValue] as bigint[], // eslint-disable-line camelcase
        set_value_twice_with_nested_last: [directValue, nestedValue] as bigint[], // eslint-disable-line camelcase
        set_value_with_two_nested_calls: [nestedValue, directValue, directValue, nestedValue, directValue] as bigint[], // eslint-disable-line camelcase
      } as const;

      it.each([
        'set_value_twice_with_nested_first',
        'set_value_twice_with_nested_last',
        'set_value_with_two_nested_calls',
      ] as const)('orders public state updates in %s (and ensures final state value is correct)', async method => {
        const expectedOrder = expectedOrders[method];

        await child.methods[method]().send().wait();

        const value = await pxe.getPublicStorageAt(child.address, new Fr(1));
        expect(value.toBigInt()).toBe(expectedOrder[expectedOrder.length - 1]); // final state should match last value set
      });

      it.each([
        'set_value_twice_with_nested_first',
        'set_value_twice_with_nested_last',
        'set_value_with_two_nested_calls',
      ] as const)('orders public logs in %s', async method => {
        const expectedOrder = expectedOrders[method];

        await child.methods[method]().send().wait();

        // Logs are emitted in the expected order
        await expectLogsFromLastBlockToBe(expectedOrder);
      });
    });
  });
});
