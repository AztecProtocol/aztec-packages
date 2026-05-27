import { throwTrap } from '@aztec/foundation/error';

export class Sentinel {
  constructor(..._args: unknown[]) {
    throwTrap('Sentinel');
  }
}
