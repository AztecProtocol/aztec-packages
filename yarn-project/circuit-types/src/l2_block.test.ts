import { L2Block } from './l2_block.js';
import { TxL2Logs } from './logs/index.js';

describe('L2Block', () => {
  it('can serialize an L2 block with logs to a buffer and back', () => {
    const block = L2Block.random(42);

    const buffer = block.toBuffer();
    const recovered = L2Block.fromBuffer(buffer);

    expect(recovered).toEqual(block);
  });

  // TS equivalent of `testComputeKernelLogsIterationWithoutLogs` in `Decoder.t.sol`
  it('correctly computes kernel logs hash when there are no logs', () => {
    // The following 2 values are copied from `testComputeKernelLogsIterationWithoutLogs` in `Decoder.t.sol`
    const encodedLogs = Buffer.from('0000000400000000', 'hex');
    const logs = TxL2Logs.fromBuffer(encodedLogs, true);
    const referenceLogsHash = Buffer.from('2119b62cf8cfd2cc801d51dcaaf1d41914430d21723d7af8008562061755242e', 'hex');

    const logsHash = logs.hash();
    expect(logsHash).toEqual(referenceLogsHash);
  });

  // TS equivalent of `testComputeKernelLogs1Iteration` in `Decoder.t.sol`
  it('correctly computes kernel logs hash when are logs from 1 iteration', () => {
    // The following 2 values are copied from `testComputeKernelLogs1Iteration` in `Decoder.t.sol`
    const encodedLogs = Buffer.from('0000000c000000080000000493e78a70', 'hex');
    const logs = TxL2Logs.fromBuffer(encodedLogs, true);
    const referenceLogsHash = Buffer.from('b9a962089baf9cec331c264da7d2d3c5654e0f0a4ba2fd89ac7b0ab81f9a2f93', 'hex');

    const logsHash = logs.hash();
    expect(logsHash).toEqual(referenceLogsHash);
  });

  // TS equivalent of `testComputeKernelLogs2Iterations` in `Decoder.t.sol`
  it('correctly computes kernel logs hash when are logs from 2 iterations', () => {
    // The following 2 values are copied from `testComputeKernelLogs2Iterations` in `Decoder.t.sol`
    const encodedLogs = Buffer.from(
      '00000024000000080000000493e78a70000000140000001006a86173c86c6d3f108eefc36e7fb014',
      'hex',
    );
    const logs = TxL2Logs.fromBuffer(encodedLogs, true);
    const referenceLogsHash = Buffer.from('4c4537f4c2e0c31baeca1ea7b9c3c4654c82be4f5572476e8ada295bd292b217', 'hex');

    const logsHash = logs.hash();
    expect(logsHash).toEqual(referenceLogsHash);
  });

  // TS equivalent of `testComputeKernelLogsMiddleIterationWithoutLogs` in `Decoder.t.sol`
  it('correctly computes kernel logs hash when are logs from 3 iterations (2nd iter. without logs)', () => {
    // The following 2 values are copied from `testComputeKernelLogsMiddleIterationWithoutLogs` in `Decoder.t.sol`
    const encodedLogs = Buffer.from(
      '00000028000000080000000493e78a7000000000000000140000001006a86173c86c6d3f108eefc36e7fb014',
      'hex',
    );
    const logs = TxL2Logs.fromBuffer(encodedLogs, true);
    const referenceLogsHash = Buffer.from('cf66b845678a5f53ba10492c81a0c4e3db0ad29e26a6e3963f3bd0f194ffaa13', 'hex');

    const logsHash = logs.hash();
    expect(logsHash).toEqual(referenceLogsHash);
  });
});
