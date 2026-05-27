import { throwTrap } from '@aztec/foundation/error';

/* eslint-disable @typescript-eslint/no-extraneous-class */
export class Sentinel {
  constructor(..._args: unknown[]) {
    throwTrap('Sentinel');
  }
}
