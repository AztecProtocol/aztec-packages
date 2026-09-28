import { ChildProcess, spawn } from 'child_process';
import { once } from 'events';

import { isChildRunning } from './child_liveness.js';

describe('isChildRunning', () => {
  const children: ChildProcess[] = [];

  afterEach(() => {
    for (const child of children.splice(0)) {
      child.kill('SIGKILL');
    }
  });

  function spawnTracked(command: string, args: string[] = []): ChildProcess {
    const child = spawn(command, args);
    children.push(child);
    return child;
  }

  it('is true while the child runs and false once it has been killed', async () => {
    const child = spawnTracked('sleep', ['30']);
    await once(child, 'spawn');
    expect(isChildRunning(child)).toBe(true);
    child.kill('SIGKILL');
    await once(child, 'exit');
    expect(isChildRunning(child)).toBe(false);
  });

  it('is false once the child has exited on its own', async () => {
    const child = spawnTracked('true');
    await once(child, 'exit');
    expect(isChildRunning(child)).toBe(false);
  });

  it('is false when the child failed to spawn', async () => {
    const child = spawnTracked('/nonexistent/bb-binary');
    await once(child, 'error');
    expect(isChildRunning(child)).toBe(false);
  });
});
