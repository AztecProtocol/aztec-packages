import { jest } from '@jest/globals';

import { sleep } from '../sleep/index.js';
import { executeTimeout } from './timeout.js';

describe('timeout', () => {
  it('execs within timeout', async () => {
    const task = jest.fn<(signal: AbortSignal) => Promise<string>>(() => sleep(200).then(() => 'ok'));
    await expect(executeTimeout(task, 1000)).resolves.toEqual('ok');
    expect(task.mock.calls[0][0].aborted).toEqual(false);
  });

  it('rejects with custom error on timeout', async () => {
    const task = jest.fn<(signal: AbortSignal) => Promise<string>>(() => sleep(500).then(() => 'ok'));
    await expect(executeTimeout(task, 200, 'Timed out!')).rejects.toThrow('Timed out!');
    expect(task.mock.calls[0][0].aborted).toEqual(true);
  });

  it('rejects if timeout is zero', async () => {
    await expect(executeTimeout(() => sleep(500), 0, 'Timed out!')).rejects.toThrow('Timed out!');
  });

  it('rejects if timeout is negative', async () => {
    await expect(executeTimeout(() => sleep(500), -100, 'Timed out!')).rejects.toThrow(
      /The value of .* is out of range/,
    );
  });
});
