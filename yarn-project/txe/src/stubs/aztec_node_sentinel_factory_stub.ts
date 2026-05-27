import { throwTrap } from '@aztec/foundation/error';

export function createSentinel(..._args: unknown[]): never {
  throwTrap('createSentinel');
}
