import { sleep } from '../sleep/index.js';
import { executeTimeout } from './timeout.js';

describe('timeout', () => {
  it('execs within timeout', async () => {
    await expect(executeTimeout(() => sleep(200).then(() => 'ok'), 300)).resolves.toEqual('ok');
  });

  it('rejects with custom error on timeout', async () => {
    await expect(executeTimeout(() => sleep(500), 200, 'Timed out!')).rejects.toThrow('Timed out!');
  });

  it('rejects if timeout is zero', async () => {
    await expect(executeTimeout(() => sleep(500), 0, 'Timed out!')).rejects.toThrow('Timed out!');
  });

  it('rejects if timeout is negative', async () => {
    await expect(executeTimeout(() => sleep(500), -100, 'Timed out!')).rejects.toThrow('Timed out!');
  });
});
