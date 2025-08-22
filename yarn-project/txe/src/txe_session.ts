import { type Logger, createLogger } from '@aztec/foundation/log';
import type { ProtocolContract } from '@aztec/protocol-contracts';

import { TXEService } from './txe_service/txe_service.js';
import { type ForeignCallArgs, type ForeignCallResult, toForeignCallResult } from './util/encoding.js';

/**
 * A TXE Session can be ine one of four states, which change as the test progresses and different oracles are called.
 * The current state determines which oracles are available.
 */
enum SessionState {
  /**
   * The top-level state is the default state, before any other state has been entered. This is where contracts can be
   * deployed, accounts created, blocks mined, etc.
   */
  TOP_LEVEL,
  /**
   * The private state is entered via the `private_context` function. In this state the PXE oracles that `#[private]`
   * functions use are available, such as those related to note retrieval, notification of side-effects, capsule access,
   * etc. */
  PRIVATE,
  /**
   * The public state is entered via the `public_context` function. In this state the AVM opcodes that `#[public]`
   * functions execute are resolved as oracles by TXE, since Noir tests are not transpiled. */
  PUBLIC,
  /**
   * The utility state is entered via the `utility_context` function. In this state the PXE oracles that `#[utility]`
   * functions use are available, such as those related to (unconstrained) note retrieval, capsule access, public
   * storage reads, etc.
   */
  UTILITY,
}

const STATE_TRANSITION_FUNCTIONS = [
  'txeSetTopLevelTXEContext',
  'txeSetPrivateTXEContext',
  'txeSetPublicTXEContext',
  'txeSetUtilityTXEContext',
] as const;

type TXESessionStateTransitionFunction = (typeof STATE_TRANSITION_FUNCTIONS)[number];

type MethodNames<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

/**
 * The name of an oracle function that TXE supports, which are a combination of PXE oracles, non-transpiled AVM opcodes,
 * and custom TXE oracles.
 */
export type TXEOracleFunctionName = MethodNames<TXEService> | TXESessionStateTransitionFunction;

/**
 * A `TXESession` corresponds to a Noir `#[test]` function, and handles all of its oracle calls, stores test-specific
 * state, etc., independent of all other tests running in parallel.
 */
export class TXESession {
  state = SessionState.TOP_LEVEL;

  constructor(
    private logger: Logger,
    private service: TXEService,
  ) {}

  static async init(protocolContracts: ProtocolContract[]) {
    return new TXESession(createLogger('txe:session'), await TXEService.init(protocolContracts));
  }

  /**
   * Processes an oracle function invoked by the Noir test associated to this session.
   * @param functionName The name of the oracle.
   * @param inputs The inputs of the oracle.
   * @returns The oracle return values.
   */
  async processFunction(functionName: TXEOracleFunctionName, inputs: ForeignCallArgs): Promise<ForeignCallResult> {
    // TXE state transition oracles are handled directly here instead of delegating to TXE service.
    if (STATE_TRANSITION_FUNCTIONS.some(f => f == functionName)) {
      this.state = this.processStateTransition(functionName as TXESessionStateTransitionFunction);
      this.logger.debug(`Transitioned to state ${SessionState[this.state]}`);

      return toForeignCallResult([]);
    } else {
      // Check if the function exists on the txeService before calling it
      // TODO: why does the zod validation in the txe dispatcher not do this already?
      if (typeof (this.service as any)[functionName] !== 'function') {
        const availableMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(this.service))
          .filter(name => typeof (this.service as any)[name] === 'function' && name !== 'constructor')
          .sort();

        throw new Error(
          `TXE function '${functionName}' is not available. ` + `Available methods: ${availableMethods.join(', ')}`,
        );
      }

      return await (this.service as any)[functionName](...inputs);
    }
  }

  processStateTransition(functionName: TXESessionStateTransitionFunction): SessionState {
    switch (functionName) {
      case 'txeSetTopLevelTXEContext':
        this.assertNotInTopLevelState();
        return SessionState.TOP_LEVEL;

      case 'txeSetPrivateTXEContext':
        this.assertInTopLevelState();
        return SessionState.PRIVATE;

      case 'txeSetPublicTXEContext':
        this.assertInTopLevelState();
        return SessionState.PUBLIC;

      case 'txeSetUtilityTXEContext':
        this.assertInTopLevelState();
        return SessionState.UTILITY;
    }
  }

  assertInTopLevelState() {
    if (this.state != SessionState.TOP_LEVEL) {
      throw new Error(
        `Expected to be in state ${SessionState[SessionState.TOP_LEVEL]}, but got '${SessionState[this.state]}' instead`,
      );
    }
  }

  assertNotInTopLevelState() {
    if (this.state == SessionState.TOP_LEVEL) {
      throw new Error(`Expected to be in state other than ${SessionState[SessionState.TOP_LEVEL]}`);
    }
  }
}
