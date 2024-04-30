import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import {
  type AztecAddress,
  BatchCall,
  type DebugLogger,
  Fr,
  Grumpkin,
  type PXE,
  type Wallet,
  deriveKeys,
  toBigIntBE,
} from '@aztec/aztec.js';
import { ChildContract, ImportTestContract, ParentContract, TestContract } from '@aztec/noir-contracts.js';

import { TaggedNote } from '../../circuit-types/src/logs/index.js';
import { setup } from './fixtures/utils.js';

describe('e2e_nested_contract', () => {
  let pxe: PXE;
  let wallet: Wallet;
  let logger: DebugLogger;
  let teardown: () => Promise<void>;

  beforeEach(async () => {
    ({ teardown, pxe, wallet, logger } = await setup());
  }, 100_000);

  afterEach(() => teardown());

  describe('parent manually calls child', () => {
    let parentContract: ParentContract;
    let childContract: ChildContract;

    beforeEach(async () => {
      parentContract = await ParentContract.deploy(wallet).send().deployed();
      childContract = await ChildContract.deploy(wallet).send().deployed();
    }, 100_000);

    const getChildStoredValue = (child: { address: AztecAddress }) => pxe.getPublicStorageAt(child.address, new Fr(1));

    it('performs nested calls', async () => {
      await parentContract.methods
        .entry_point(childContract.address, childContract.methods.value.selector)
        .send()
        .wait();
    }, 100_000);

    it('fails simulation if calling a function not allowed to be called externally', async () => {
      await expect(
        parentContract.methods
          .entry_point(childContract.address, (childContract.methods as any).value_internal.selector)
          .prove(),
      ).rejects.toThrow(/Assertion failed: Function value_internal can only be called internally/);
    }, 100_000);

    it('performs public nested calls', async () => {
      await parentContract.methods
        .pub_entry_point(childContract.address, childContract.methods.pub_get_value.selector, 42n)
        .send()
        .wait();
    }, 100_000);

    it('enqueues a single public call', async () => {
      await parentContract.methods
        .enqueue_call_to_child(childContract.address, childContract.methods.pub_inc_value.selector, 42n)
        .send()
        .wait();
      expect(await getChildStoredValue(childContract)).toEqual(new Fr(42n));
    }, 100_000);

    it('fails simulation if calling a public function not allowed to be called externally', async () => {
      await expect(
        parentContract.methods
          .enqueue_call_to_child(
            childContract.address,
            (childContract.methods as any).pub_inc_value_internal.selector,
            42n,
          )
          .prove(),
      ).rejects.toThrow(/Assertion failed: Function pub_inc_value_internal can only be called internally/);
    }, 100_000);

    it('enqueues multiple public calls', async () => {
      await parentContract.methods
        .enqueue_call_to_child_twice(childContract.address, childContract.methods.pub_inc_value.selector, 42n)
        .send()
        .wait();
      expect(await getChildStoredValue(childContract)).toEqual(new Fr(85n));
    }, 100_000);

    it('enqueues a public call with nested public calls', async () => {
      await parentContract.methods
        .enqueue_call_to_pub_entry_point(childContract.address, childContract.methods.pub_inc_value.selector, 42n)
        .send()
        .wait();
      expect(await getChildStoredValue(childContract)).toEqual(new Fr(42n));
    }, 100_000);

    it('enqueues multiple public calls with nested public calls', async () => {
      await parentContract.methods
        .enqueue_calls_to_pub_entry_point(childContract.address, childContract.methods.pub_inc_value.selector, 42n)
        .send()
        .wait();
      expect(await getChildStoredValue(childContract)).toEqual(new Fr(85n));
    }, 100_000);

    // Regression for https://github.com/AztecProtocol/aztec-packages/issues/640
    it('reads fresh value after write within the same tx', async () => {
      await parentContract.methods
        .pub_entry_point_twice(childContract.address, childContract.methods.pub_inc_value.selector, 42n)
        .send()
        .wait();
      expect(await getChildStoredValue(childContract)).toEqual(new Fr(84n));
    }, 100_000);

    // Regression for https://github.com/AztecProtocol/aztec-packages/issues/1645
    // Executes a public call first and then a private call (which enqueues another public call)
    // through the account contract, if the account entrypoint behaves properly, it will honor
    // this order and not run the private call first which results in the public calls being inverted.
    it('executes public calls in expected order', async () => {
      const pubSetValueSelector = childContract.methods.pub_set_value.selector;
      const actions = [
        childContract.methods.pub_set_value(20n).request(),
        parentContract.methods.enqueue_call_to_child(childContract.address, pubSetValueSelector, 40n).request(),
      ];

      const tx = await new BatchCall(wallet, actions).send().wait();
      const extendedLogs = (
        await wallet.getUnencryptedLogs({
          fromBlock: tx.blockNumber!,
        })
      ).logs;
      const processedLogs = extendedLogs.map(extendedLog => toBigIntBE(extendedLog.log.data));
      expect(processedLogs).toEqual([20n, 40n]);
      expect(await getChildStoredValue(childContract)).toEqual(new Fr(40n));
    }, 100_000);
  });

  describe('importer uses autogenerated test contract interface', () => {
    let importerContract: ImportTestContract;
    let testContract: TestContract;

    beforeEach(async () => {
      logger.info(`Deploying importer test contract`);
      importerContract = await ImportTestContract.deploy(wallet).send().deployed();
      logger.info(`Deploying test contract`);
      testContract = await TestContract.deploy(wallet).send().deployed();
    }, 30_000);

    it('calls a method with multiple arguments', async () => {
      logger.info(`Calling main on importer contract`);
      await importerContract.methods.main_contract(testContract.address).send().wait();
    }, 30_000);

    it('calls a method no arguments', async () => {
      logger.info(`Calling noargs on importer contract`);
      await importerContract.methods.call_no_args(testContract.address).send().wait();
    }, 30_000);

    it('calls an open function', async () => {
      logger.info(`Calling openfn on importer contract`);
      await importerContract.methods.call_open_fn(testContract.address).send().wait();
    }, 30_000);

    it('calls an open function from an open function', async () => {
      logger.info(`Calling pub openfn on importer contract`);
      await importerContract.methods.pub_call_open_fn(testContract.address).send().wait();
    }, 30_000);
  });

  describe('logs in nested calls are ordered as expected', () => {
    let testContract: TestContract;

    beforeEach(async () => {
      logger.info(`Deploying test contract`);
      testContract = await TestContract.deploy(wallet).send().deployed();
    }, 30_000);

    it('calls a method with nested unencrypted logs', async () => {
      const tx = await testContract.methods.emit_unencrypted_logs_nested([1, 2, 3, 4, 5]).send().wait();
      const logs = (await pxe.getUnencryptedLogs({ txHash: tx.txHash })).logs.map(l => l.log);

      // First log should be contract address
      expect(logs[0].data).toEqual(testContract.address.toBuffer());

      // Second log should be array of fields
      let expectedBuffer = Buffer.concat([1, 2, 3, 4, 5].map(num => new Fr(num).toBuffer()));
      expect(logs[1].data.subarray(-32 * 5)).toEqual(expectedBuffer);

      // Third log should be string "test"
      expectedBuffer = Buffer.concat(
        ['t', 'e', 's', 't'].map(num => Buffer.concat([Buffer.alloc(31), Buffer.from(num)])),
      );
      expect(logs[2].data.subarray(-32 * 5)).toEqual(expectedBuffer);
    }, 30_000);

    it('calls a method with nested encrypted logs', async () => {
      // account setup
      const privateKey = new Fr(7n);
      const keys = deriveKeys(privateKey);
      const account = getSchnorrAccount(pxe, privateKey, keys.masterIncomingViewingSecretKey);
      await account.deploy().wait();
      const thisWallet = await account.getWallet();

      // call test contract
      const action = testContract.methods.emit_encrypted_logs_nested(10, thisWallet.getAddress());
      const tx = await action.prove();
      const rct = await action.send().wait();

      // compare logs
      expect(rct.status).toEqual('mined');
      const decryptedLogs = tx.encryptedLogs
        .unrollLogs()
        .map(l => TaggedNote.fromEncryptedBuffer(l.data, keys.masterIncomingViewingSecretKey));
      const notevalues = decryptedLogs.map(l => l?.notePayload.note.items[0]);
      expect(notevalues[0]).toEqual(new Fr(10));
      expect(notevalues[1]).toEqual(new Fr(11));
      expect(notevalues[2]).toEqual(new Fr(12));
    }, 30_000);
  });
});
