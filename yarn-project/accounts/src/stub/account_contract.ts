import type { AuthWitnessProvider } from '@aztec/aztec.js/account';
import { Fr } from '@aztec/foundation/fields';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import { CompleteAddress } from '@aztec/stdlib/contract';

import { DefaultAccountContract } from '../defaults/account_contract.js';

/**
 * An Account contract that does not perform any authentication of authwits
 * (`is_valid` always returns `true`)
 * It is used to capture authorization data during simulations
 */
export abstract class StubBaseAccountContract extends DefaultAccountContract {
  constructor() {
    super();
  }

  getInitializationFunctionAndArgs() {
    return Promise.resolve({ constructorName: 'constructor', constructorArgs: [] });
  }

  getAuthWitnessProvider(_address: CompleteAddress): AuthWitnessProvider {
    return new StubAuthWitnessProvider();
  }
}

/** Creates auth witnesses using Stub signatures. */
export class StubAuthWitnessProvider implements AuthWitnessProvider {
  constructor() {}

  /**
   * A fake account always returns an empty authwitness, since it doesn't
   * perform any verification whatsoever
   * @param messageHash - The outer hash of the message for which the auth witness is created
   */
  createAuthWit(messageHash: Fr): Promise<AuthWitness> {
    return Promise.resolve(new AuthWitness(messageHash, []));
  }
}
