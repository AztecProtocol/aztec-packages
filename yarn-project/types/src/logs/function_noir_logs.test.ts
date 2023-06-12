import { FunctionNoirLogs } from './function_noir_logs.js';

describe('FunctionNoirLogs', () => {
  it('can encode NoirLogs to buffer and back', () => {
    const noirLogs = FunctionNoirLogs.random(42);

    const buffer = noirLogs.toBuffer();
    const recovered = FunctionNoirLogs.fromBuffer(buffer);

    expect(recovered).toEqual(noirLogs);
  });

  it('getSerializedLength returns the correct length', () => {
    const noirLogs = FunctionNoirLogs.random(42);

    const buffer = noirLogs.toBuffer();
    const recovered = FunctionNoirLogs.fromBuffer(buffer);

    expect(recovered.getSerializedLength()).toEqual(buffer.length);
  });
});
