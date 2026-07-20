import { throwStub } from './stub_helpers.js';

export class Sentinel {
  constructor(..._args: unknown[]) {
    throwStub('Sentinel');
  }
}
