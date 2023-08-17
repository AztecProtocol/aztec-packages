// Test suite for testing proper ordering of side effects
import { AztecNodeService } from '@aztec/aztec-node';
import { AztecRPCServer } from '@aztec/aztec-rpc';
import { BatchCall, Wallet } from '@aztec/aztec.js';
import { Fr } from '@aztec/circuits.js';
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

    const getChildStoredValue = () =>
      aztecRpcServer.getPublicStorageAt(child.address, new Fr(1)).then(x => toBigInt(x!));

    // Transaction is dropped due to incorrect public call hash
    // aztec:sequencer:public-processor Error processing tx 24bde0a0a97663544394135c1b7665ff84f5baf74a1bcd9305d431f25fd6bf00: Error: calculated public_call_hash (0x14f75518391d0170eab12a72d211820d4336a6d690e57339ac4442822805a1d7) does not match provided public_call_hash (0x0a266bd9f749d04f4c55cb92126dbc060ad0c94a36e31703cc8071f0a8bc1b14) at the top of the call stack
    it.skip('orders public function execution requests when nested call is last', async () => {
      const actions: FunctionCall[] = [
        child.methods.pubSetValue(10).request(),
        parent.methods.enqueueCallToChild(child.address, child.methods.pubSetValue.selector, 20).request(),
      ];

      await new BatchCall(wallet, actions).send().wait();
      expect(await getChildStoredValue()).toEqual(20n);
      const logs = await aztecRpcServer.getUnencryptedLogs(1, 10).then(L2BlockL2Logs.unrollLogs);
      expect(logs).toEqual([[10], [20]].map(Buffer.from));
    });

    // Transaction is dropped due to incorrect public call hash
    // aztec:sequencer:public-processor Error processing tx 045ff26096541cda6683de3b98795ad4327eb0df50e9aa2c4f270be7a37bc1ff: Error: calculated public_call_hash (0x04974297d43d77cb75fd74d0c72594d6d9ec3ec20c644590216296dc7a0bc1e0) does not match provided public_call_hash (0x19180b1dd6a14efeba6bfdb48b80b1f5fd11c78a67d5336cf6473b9c53033a01) at the top of the call stack
    it.skip('orders public function execution requests when nested call is first', async () => {
      const actions: FunctionCall[] = [
        parent.methods.enqueueCallToChild(child.address, child.methods.pubSetValue.selector, 10).request(),
        child.methods.pubSetValue(20).request(),
      ];

      await new BatchCall(wallet, actions).send().wait();
      expect(await getChildStoredValue()).toEqual(20n);
      const logs = await aztecRpcServer.getUnencryptedLogs(1, 10).then(L2BlockL2Logs.unrollLogs);
      expect(logs).toEqual([[10], [20]].map(Buffer.from));
    });
  });
});
