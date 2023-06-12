import { L2BlockNoirLogs } from './l2_block_noir_logs.js';

describe('L2BlockNoirLogs', () => {
  it('can encode NoirLogs to buffer and back', () => {
    const noirLogs = L2BlockNoirLogs.random(3, 6, 2);

    const buffer = noirLogs.toBuffer();
    const recovered = L2BlockNoirLogs.fromBuffer(buffer);

    expect(recovered).toEqual(noirLogs);
  });

  it('getSerializedLength returns the correct length', () => {
    const noirLogs = L2BlockNoirLogs.random(3, 6, 2);

    const buffer = noirLogs.toBuffer();
    const recovered = L2BlockNoirLogs.fromBuffer(buffer);

    expect(recovered.getSerializedLength()).toEqual(buffer.length);
  });
});
