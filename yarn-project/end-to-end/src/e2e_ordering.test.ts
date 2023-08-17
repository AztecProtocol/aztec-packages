// Test suite for testing proper ordering of side effects
import { AztecNodeService } from '@aztec/aztec-node';
import { AztecRPCServer } from '@aztec/aztec-rpc';
import { BatchCall, Wallet } from '@aztec/aztec.js';
import { Fr, PublicCallRequest } from '@aztec/circuits.js';
import { toBigInt } from '@aztec/foundation/serialize';
import { ChildContract, ParentContract } from '@aztec/noir-contracts/types';
import { AztecRPC, FunctionCall, L2BlockL2Logs } from '@aztec/types';

import { setup } from './fixtures/utils.js';

// See https://github.com/AztecProtocol/aztec-packages/issues/1601
describe('e2e_ordering', () => {
  let aztecNode: AztecNodeService | undefined;
  let aztecRpcServer: AztecRPC;
  let wallet: Wallet;

  beforeEach(async () => {
    ({ aztecNode, aztecRpcServer, wallet } = await setup());
  }, 100_000);

  afterEach(async () => {
    await aztecNode?.stop();
    if (aztecRpcServer instanceof AztecRPCServer) {
      await aztecRpcServer?.stop();
    }
  });

  describe('with parent and child contract', () => {
    let parent: ParentContract;
    let child: ChildContract;

    beforeEach(async () => {
      parent = await ParentContract.deploy(wallet).send().deployed();
      child = await ChildContract.deploy(wallet).send().deployed();
    });

    describe('enqueued public calls ordering', () => {
      const sendBatch = async (actions: FunctionCall[]) => {
        const batch = new BatchCall(wallet, actions);
        const tx = await batch.simulate();
        await batch.send().wait();
        const logs = await aztecRpcServer.getUnencryptedLogs(1, 10).then(L2BlockL2Logs.unrollLogs);
        const value = await aztecRpcServer.getPublicStorageAt(child.address, new Fr(1)).then(x => toBigInt(x!));
        return { tx, logs, value };
      };

      const callsToHashes = (enqueuedPublicCalls: PublicCallRequest[]) =>
        Promise.all(enqueuedPublicCalls.map(call => call.toPublicCallStackItem().then(item => item.hash())));

      it('orders public function execution requests when nested call is last', async () => {
        const actions: FunctionCall[] = [
          child.methods.pubSetValue(10).request(),
          parent.methods.enqueueCallToChild(child.address, child.methods.pubSetValue.selector, 20).request(),
        ];

        const { tx, logs, value } = await sendBatch(actions);
        const { enqueuedPublicFunctionCalls: enqueuedPublicCalls } = tx;

        expect(enqueuedPublicCalls.length).toEqual(2);
        expect(tx.data.end.publicCallStack.slice(0, 2)).toEqual(await callsToHashes(enqueuedPublicCalls));
        expect(enqueuedPublicCalls.map(c => c.args[0].toBigInt())).toEqual([20n, 10n]);
        expect(logs).toEqual([[10], [20]].map(Buffer.from));
        expect(value).toEqual(20n);
      });

      it('orders public function execution requests when nested call is first', async () => {
        const actions: FunctionCall[] = [
          parent.methods.enqueueCallToChild(child.address, child.methods.pubSetValue.selector, 10).request(),
          child.methods.pubSetValue(20).request(),
        ];

        const { tx, logs, value } = await sendBatch(actions);
        const { enqueuedPublicFunctionCalls: enqueuedPublicCalls } = tx;

        expect(enqueuedPublicCalls.length).toEqual(2);
        expect(tx.data.end.publicCallStack.slice(0, 2)).toEqual(await callsToHashes(enqueuedPublicCalls));
        expect(enqueuedPublicCalls.map(c => c.args[0].toBigInt())).toEqual([20n, 10n]);
        expect(logs).toEqual([[10], [20]].map(Buffer.from));
        expect(value).toEqual(20n);
      });
    });
  });
});
