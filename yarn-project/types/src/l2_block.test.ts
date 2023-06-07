import { L2Block } from './l2_block.js';

describe('L2Block', () => {
  it('can encode a L2 block data object to buffer and back', () => {
    const block = L2Block.random(42);

    const buffer = block.encode();
    const recovered = L2Block.decode(buffer);

    expect(recovered).toEqual(block);
  });

  // TS equivalent of `testComputeKernelLogsHashNoLogs` in `Decoder.t.sol`
  it('correctly computes kernel logs hash when there are no logs', () => {
    const encodedLogs = Buffer.from('00000000', 'hex'); // 4 empty bytes indicating that length of kernel logs is 0
    const logsHash = L2Block.computeKernelLogsHash(encodedLogs);

    expect(logsHash).toEqual(Buffer.alloc(32, 0));
  });

  // TS equivalent of `testComputeKernelLogs1Iteration` in `Decoder.t.sol`
  it('correctly computes kernel logs hash when are logs from 1 iteration', () => {
    // The following 2 values are copied from `testComputeKernelLogs1Iteration` in `Decoder.t.sol`
    const encodedLogs = Buffer.from('0000000c00000008aafdc7aa93e78a70', 'hex');
    const referenceLogsHash = Buffer.from('8fabfa6cd5f3590246c5e8b82371ad9a0cc1bb34a031b761697295f5ecda418a', 'hex');

    const logsHash = L2Block.computeKernelLogsHash(encodedLogs);
    expect(logsHash).toEqual(referenceLogsHash);
  });

  // TS equivalent of `testComputeKernelLogs2Iterations` in `Decoder.t.sol`
  it('correctly computes kernel logs hash when are logs from 2 iterations', () => {
    // The following 2 values are copied from `testComputeKernelLogs2Iterations` in `Decoder.t.sol`
    const encodedLogs = Buffer.from(
      '0000002400000008aafdc7aa93e78a700000001497aee30906a86173c86c6d3f108eefc36e7fb014',
      'hex',
    );
    const referenceLogsHash = Buffer.from('23796d70846c2bfcf5d43172e6078c09bee2a42c51c1f6b02bd00be33154b24e', 'hex');

    const logsHash = L2Block.computeKernelLogsHash(encodedLogs);
    expect(logsHash).toEqual(referenceLogsHash);
  });
});
