import { ProvingRequestType } from '@aztec/circuit-types';
import {
  BaseParityInputs,
  type Fr,
  type NUM_MSGS_PER_BASE_PARITY,
  type ParityPublicInputs,
  type RootParityInput,
} from '@aztec/circuits.js';
import { memoize } from '@aztec/foundation/decorators';
import { type Tuple } from '@aztec/foundation/serialize';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';

import { type OrchestratorContext , type Circuit } from '../types.js';

export class BaseParityCircuit implements Circuit<typeof ProvingRequestType.BASE_PARITY> {
  constructor(
    public readonly messages: Tuple<Fr, typeof NUM_MSGS_PER_BASE_PARITY>,
    public readonly index: number,
    private readonly context: OrchestratorContext,
  ) {}

  @memoize
  public buildInputs() {
    return new BaseParityInputs(this.messages, getVKTreeRoot());
  }

  @memoize
  public simulate(): Promise<ParityPublicInputs> {
    return this.context.simulator.simulate({ type: ProvingRequestType.BASE_PARITY, inputs: this.buildInputs() });
  }

  @memoize
  public prove(): Promise<RootParityInput<439>> {
    return this.context.prover.prove({ type: ProvingRequestType.BASE_PARITY, inputs: this.buildInputs() });
  }
}
