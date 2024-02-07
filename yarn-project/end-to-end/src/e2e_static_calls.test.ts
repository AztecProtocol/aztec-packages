import { Wallet } from '@aztec/aztec.js';
import { getTestData, isGenerateTestDataEnabled } from '@aztec/foundation/testing';
import { ChildContract, ParentContract } from '@aztec/noir-contracts';

import { writeFileSync } from 'fs';

import { setup } from './fixtures/utils.js';

describe('e2e_static_calls', () => {
  let wallet: Wallet;
  let parentContract: ParentContract;
  let childContract: ChildContract;
  let teardown: () => Promise<void>;

  beforeEach(async () => {
    ({ teardown, wallet } = await setup());
  }, 100_000);

  afterEach(() => teardown());

  beforeEach(async () => {
    parentContract = await ParentContract.deploy(wallet).send().deployed();
    childContract = await ChildContract.deploy(wallet).send().deployed();
  }, 100_000);

  describe('direct calls', () => {
    it('performs legal private static calls', async () => {
      await childContract.methods
        .privateGetValue(42n, wallet.getCompleteAddress().address)
        .send({ static: true })
        .wait();

      if (isGenerateTestDataEnabled()) {
        {
          const privateKernelInputsInit = getTestData('private-kernel-inputs-init');
          const nestedCallPrivateKernelInput = privateKernelInputsInit[0];
          writeFileSync(
            '../noir-protocol-circuits/src/fixtures/nested-call-private-kernel-init.hex',
            nestedCallPrivateKernelInput.toBuffer().toString('hex'),
          );
        }

        {
          const privateKernelInputsInner = getTestData('private-kernel-inputs-inner');
          const nestedCallPrivateKernelInput = privateKernelInputsInner[privateKernelInputsInner.length - 1];
          writeFileSync(
            '../noir-protocol-circuits/src/fixtures/nested-call-private-kernel-inner.hex',
            nestedCallPrivateKernelInput.toBuffer().toString('hex'),
          );
        }

        {
          const privateKernelInputsOrdering = getTestData('private-kernel-inputs-ordering');
          const nestedCallPrivateKernelInput = privateKernelInputsOrdering[0];
          writeFileSync(
            '../noir-protocol-circuits/src/fixtures/nested-call-private-kernel-ordering.hex',
            nestedCallPrivateKernelInput.toBuffer().toString('hex'),
          );
        }
      }
    }, 100_000);

    it('performs legal public static calls', async () => {
      await childContract.methods.pubGetValue(42n).send({ static: true }).wait();
    }, 100_000);

    it('fails when performing illegal private static calls', async () => {
      await expect(
        childContract.methods.privateSetValue(42n, wallet.getCompleteAddress().address).send({ static: true }).wait(),
      ).rejects.toThrow('Static call cannot create new notes');
    }, 100_000);

    it('fails when performing illegal public static calls', async () => {
      await expect(childContract.methods.pubSetValue(42n).send({ static: true }).wait()).rejects.toThrow(
        'Static call cannot update the state',
      );
    }, 100_000);
  });

  describe('parent calls child', () => {
    it('performs legal private to private static calls', async () => {
      await parentContract.methods
        .privateStaticCall(childContract.address, childContract.methods.privateGetValue.selector, [
          42n,
          wallet.getCompleteAddress().address,
        ])
        .send()
        .wait();
    }, 100_000);

    it('performs legal public to public static calls', async () => {
      await parentContract.methods
        .enqueueStaticCallToPubFunction(childContract.address, childContract.methods.pubGetValue.selector, [42n])
        .send()
        .wait();
    }, 100_000);

    it('performs legal enqueued public static calls', async () => {
      await parentContract.methods
        .publicStaticCall(childContract.address, childContract.methods.pubGetValue.selector, [42n])
        .send()
        .wait();
    }, 100_000);

    it('fails when performing illegal private to private static calls', async () => {
      await expect(
        parentContract.methods
          .privateStaticCall(childContract.address, childContract.methods.privateSetValue.selector, [
            42n,
            wallet.getCompleteAddress().address,
          ])
          .send()
          .wait(),
      ).rejects.toThrow('Static call cannot create new notes');
    }, 100_000);

    it('fails when performing illegal public to public static calls', async () => {
      await expect(
        parentContract.methods
          .publicStaticCall(childContract.address, childContract.methods.pubSetValue.selector, [42n])
          .send()
          .wait(),
      ).rejects.toThrow('Static call cannot update the state');
    }, 100_000);

    it('fails when performing illegal enqueued public static calls', async () => {
      await expect(
        parentContract.methods
          .enqueueStaticCallToPubFunction(childContract.address, childContract.methods.pubSetValue.selector, [42n])
          .send()
          .wait(),
      ).rejects.toThrow('Static call cannot update the state');
    }, 100_000);
  });
});
