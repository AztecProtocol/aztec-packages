import { L2Block } from './l2_block.js';
import { TxL2Logs } from './logs/index.js';

describe('L2Block', () => {
  it('can serialize an L2 block with logs to a buffer and back', () => {
    const block = L2Block.random(42);

    const buffer = block.toBufferWithLogs();
    const recovered = L2Block.fromBufferWithLogs(buffer);

    expect(recovered).toEqual(block);
  });

  it('can serialize an L2 block without logs to a buffer and back', () => {
    const block = L2Block.random(42);
    block.newEncryptedLogs = undefined;
    block.newUnencryptedLogs = undefined;

    const serialized = block.toString();
    const recovered = L2Block.fromString(serialized);

    expect(recovered).toEqual(block);
  });

  // TS equivalent of `testComputeKernelLogsIterationWithoutLogs` in `Decoder.t.sol`
  it('correctly computes kernel logs hash when there are no logs', () => {
    // The following 2 values are copied from `testComputeKernelLogsIterationWithoutLogs` in `Decoder.t.sol`
    const encodedLogs = Buffer.from('0000000400000000', 'hex');
    const logs = TxL2Logs.fromBuffer(encodedLogs, true);
    const referenceLogsHash = Buffer.from('00dae73c4ea565ca24f345f35ec8892fb315a405f12d90b7e50c2aaa0a65a8cf', 'hex');

    const logsHash = L2Block.computeKernelLogsHash(logs);
    expect(logsHash).toEqual(referenceLogsHash);
  });

  // TS equivalent of `testComputeKernelLogs1Iteration` in `Decoder.t.sol`
  it('correctly computes kernel logs hash when are logs from 1 iteration', () => {
    // The following 2 values are copied from `testComputeKernelLogs1Iteration` in `Decoder.t.sol`
    const encodedLogs = Buffer.from('0000000c000000080000000493e78a70', 'hex');
    const logs = TxL2Logs.fromBuffer(encodedLogs, true);
    const referenceLogsHash = Buffer.from('0040eee38970b8757f08391ed6efdc615de7bebbe1cf5ce0b4dcd9db63a401f2', 'hex');

    const logsHash = L2Block.computeKernelLogsHash(logs);
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
    const referenceLogsHash = Buffer.from('00a730555c05b04cb15c753f6a4c31c4728b6bea00bfd6ce7af83434e7ad1247', 'hex');

    const logsHash = L2Block.computeKernelLogsHash(logs);
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
    const referenceLogsHash = Buffer.from('009d71ab2985e52a0f30520f37303c8f3233279b917511941844571556a07c85', 'hex');

    const logsHash = L2Block.computeKernelLogsHash(logs);
    expect(logsHash).toEqual(referenceLogsHash);
  });
});
