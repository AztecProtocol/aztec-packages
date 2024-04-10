import { BatchCall, TxStatus } from '@aztec/aztec.js';

import { type EndToEndContext, setup } from './fixtures/utils.js';

describe('e2e_empty_batch_call', () => {
  let ctx: EndToEndContext;

  beforeAll(async () => {
    ctx = await setup(1);
  });

  afterAll(() => ctx.teardown());

  it('should not fail', async () => {
    const batch = new BatchCall(ctx.wallet, []);
    await expect(batch.send().wait()).resolves.toEqual(
      expect.objectContaining({
        status: TxStatus.MINED,
      }),
    );
  });
});
