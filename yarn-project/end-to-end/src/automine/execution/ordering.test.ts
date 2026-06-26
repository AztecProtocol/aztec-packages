// Test suite for testing proper ordering of side effects
// See https://github.com/AztecProtocol/aztec-packages/issues/1601 for motivation.
import type { FunctionSelector } from '@aztec/aztec.js/abi';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { AztecNode } from '@aztec/aztec.js/node';
import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { serializeToBuffer } from '@aztec/foundation/serialize';
import { ChildContract } from '@aztec/noir-test-contracts.js/Child';
import { ParentContract } from '@aztec/noir-test-contracts.js/Parent';
import { computeCalldataHash } from '@aztec/stdlib/hash';

import { jest } from '@jest/globals';

import type { TestWallet } from '../../test-wallet/test_wallet.js';
import { proveInteraction } from '../../test-wallet/utils.js';
import { AutomineTestContext } from '../automine_test_context.js';

const TIMEOUT = 300_000;

// See https://github.com/AztecProtocol/aztec-packages/issues/1601
// Verifies deterministic execution ordering for enqueued public calls and public state updates.
// Uses a single node with AutomineSequencer; each test mines one block per call via beforeEach setup.
describe('automine/execution/ordering', () => {
  jest.setTimeout(TIMEOUT);

  let wallet: TestWallet;
  let aztecNode: AztecNode;
  let defaultAccountAddress: AztecAddress;
  let teardown: () => Promise<void>;

  const expectLogsFromBlockToBe = async (logMessages: bigint[], blockNumber: number) => {
    // The log RPC is tag-based and per-contract; fetch the block's tx effects directly to assert ordering across all
    // public logs in the block in canonical (txIndex, logIndexWithinTx) order.
    const block = await aztecNode.getBlock(BlockNumber(blockNumber), { includeTransactions: true });
    if (!block) {
      throw new Error(`Block ${blockNumber} not found`);
    }
    const publicLogs = block.body.txEffects.flatMap(txEffect => txEffect.publicLogs);
    const bigintLogs = publicLogs.map(publicLog => toBigIntBE(serializeToBuffer(publicLog.getEmittedFields())));

    expect(bigintLogs).toStrictEqual(logMessages);
  };

  beforeEach(async () => {
    ({
      teardown,
      wallet,
      aztecNode,
      accounts: [defaultAccountAddress],
    } = (await AutomineTestContext.setup({ numberOfAccounts: 1 })).context);
  }, TIMEOUT);

  afterEach(() => teardown());

  // Sub-suite deploying Parent and Child contracts fresh in each test to ensure isolation.
  describe('with parent and child contract', () => {
    let parent: ParentContract;
    let child: ChildContract;
    let pubSetValueSelector: FunctionSelector;

    beforeEach(async () => {
      ({ contract: parent } = await ParentContract.deploy(wallet).send({ from: defaultAccountAddress }));
      ({ contract: child } = await ChildContract.deploy(wallet).send({ from: defaultAccountAddress }));
      pubSetValueSelector = await child.methods.pub_set_value.selector();
    }, TIMEOUT);

    // Asserts that enqueued public calls execute in the order they were enqueued (nested-first vs direct-first),
    // verified by reading public logs from the mined block in canonical order.
    describe('enqueued public calls ordering', () => {
      const nestedValue = 10n;
      const directValue = 20n;

      const expectedOrders = {
        enqueue_calls_to_child_with_nested_first: [nestedValue, directValue] as bigint[], // eslint-disable-line camelcase
        enqueue_calls_to_child_with_nested_last: [directValue, nestedValue] as bigint[], // eslint-disable-line camelcase
      } as const;

      // Proves a parent tx that enqueues two public calls (direct and nested) in different orderings; asserts
      // the calldata hashes match, the calls are enqueued in the expected order, and public logs arrive in
      // that same order in the mined block.
      it.each(['enqueue_calls_to_child_with_nested_first', 'enqueue_calls_to_child_with_nested_last'] as const)(
        'orders public function execution in %s',
        async method => {
          const expectedOrder = expectedOrders[method];
          const action = parent.methods[method](child.address, pubSetValueSelector);
          const tx = await proveInteraction(wallet, action, { from: defaultAccountAddress });

          const receipt = await tx.send();

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
          await expectLogsFromBlockToBe(expectedOrder, receipt.blockNumber!);

          // The final value of the child is the last one set
          const value = await aztecNode.getPublicStorageAt('latest', child.address, new Fr(1));
          expect(value.toBigInt()).toBe(expectedOrder[1]); // final state should match last value set
        },
      );
    });

    // Asserts that public storage writes from multiple nested calls are applied in the expected order
    // and that the final persisted value matches the last write in execution order.
    describe('public state update ordering, and final state value check', () => {
      const nestedValue = 10n;
      const directValue = 20n;

      const expectedOrders = {
        set_value_twice_with_nested_first: [nestedValue, directValue] as bigint[], // eslint-disable-line camelcase
        set_value_twice_with_nested_last: [directValue, nestedValue] as bigint[], // eslint-disable-line camelcase
        set_value_with_two_nested_calls: [nestedValue, directValue, directValue, nestedValue, directValue] as bigint[], // eslint-disable-line camelcase
      } as const;

      // Calls each method variant on the child and reads back getPublicStorageAt to confirm the final
      // persisted value equals the last write in the expected ordering sequence.
      it.each([
        'set_value_twice_with_nested_first',
        'set_value_twice_with_nested_last',
        'set_value_with_two_nested_calls',
      ] as const)('orders public state updates in %s (and ensures final state value is correct)', async method => {
        const expectedOrder = expectedOrders[method];

        await child.methods[method]().send({ from: defaultAccountAddress });

        const value = await aztecNode.getPublicStorageAt('latest', child.address, new Fr(1));
        expect(value.toBigInt()).toBe(expectedOrder[expectedOrder.length - 1]); // final state should match last value set
      });

      // Calls each method variant and reads the block's public logs via getBlock; asserts they arrive in
      // the same order as the expected write sequence.
      it.each([
        'set_value_twice_with_nested_first',
        'set_value_twice_with_nested_last',
        'set_value_with_two_nested_calls',
      ] as const)('orders public logs in %s', async method => {
        const expectedOrder = expectedOrders[method];

        const { receipt } = await child.methods[method]().send({ from: defaultAccountAddress });

        // Logs are emitted in the expected order
        await expectLogsFromBlockToBe(expectedOrder, receipt.blockNumber!);
      });
    });
  });
});
