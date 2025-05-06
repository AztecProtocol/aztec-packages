import { createAvmMinimalPublicTx } from '../../fixtures/minimal_public_tx.js';

describe('Public TX simulator apps tests: AvmMinimalTestContract', () => {
  it('Minimal Tx avm inputs snapshot', async () => {
    const result = await createAvmMinimalPublicTx();
    expect(result.revertCode.isOK()).toBe(true);
    expect(result.avmProvingRequest.inputs).toMatchSnapshot();
  });
});
