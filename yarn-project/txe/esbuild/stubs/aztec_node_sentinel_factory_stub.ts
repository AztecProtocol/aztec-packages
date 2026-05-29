import { throwStub } from './stub_helpers.js';

export function createSentinel(..._args: unknown[]): never {
  throwStub('createSentinel');
}
