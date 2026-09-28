import { ChildProcess } from 'child_process';

/** Whether a child process was spawned and has not been observed to exit. */
export function isChildRunning(child: ChildProcess): boolean {
  return child.pid !== undefined && child.exitCode === null && child.signalCode === null;
}
