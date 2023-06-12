import { TxNoirLogs } from './tx_noir_logs.js';

describe('TxNoirLogs', () => {
  it('can encode NoirLogs to buffer and back', () => {
    const noirLogs = TxNoirLogs.random(6, 2);

    const buffer = noirLogs.toBuffer();
    const recovered = TxNoirLogs.fromBuffer(buffer);

    expect(recovered).toEqual(noirLogs);
  });
});
