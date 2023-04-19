import { Fr } from '@aztec/foundation';
import { assertLength } from '../../utils/jsUtils.js';
import { PublicCallStackItem } from '../call_stack_item.js';
import {
  PUBLIC_CALL_STACK_LENGTH,
  PUBLIC_DATA_TREE_HEIGHT,
  STATE_READS_LENGTH,
  STATE_TRANSITIONS_LENGTH,
} from '../constants.js';
import { PreviousKernelData as PreviousPrivateKernelData } from './previous_kernel_data.js';
import { CombinedConstantData } from './combined_constant_data.js';
import { CombinedAccumulatedData } from './combined_accumulated_data.js';
import { UInt8Vector } from '../shared.js';
import { MembershipWitness } from '../membership_witness.js';
import { SignedTxRequest } from '../tx_request.js';
import { VerificationKey } from '../verification_key.js';

export type PublicKernelInputs =
  | PublicKernelInputsNonFirstIteration
  | PublicKernelInputsPrivateKernelInput
  | PublicKernelInputsNoKernelInput;

export class PublicKernelInputsNonFirstIteration {
  public kind = 'NonFirstIteration' as const;

  constructor(
    public readonly previousKernel: PreviousPublicKernelData,
    public readonly witnessedPublicCall: WitnessedPublicCallData,
  ) {}
}

export class PublicKernelInputsPrivateKernelInput {
  public kind = 'PrivateKernelInput' as const;

  constructor(
    public readonly previousKernel: PreviousPrivateKernelData,
    public readonly witnessedPublicCall: WitnessedPublicCallData,
  ) {}
}

export class PublicKernelInputsNoKernelInput {
  public kind = 'NoKernelInput' as const;

  constructor(
    public readonly signedTxRequest: SignedTxRequest,
    public readonly witnessedPublicCall: WitnessedPublicCallData,
  ) {}
}

export class WitnessedPublicCallData {
  constructor(
    public readonly publicCall: PublicCallData,
    // TODO: Spec uses SiblingPaths here instead of MembershipWitness, are we ok reusing this structure instead?
    public readonly transitionsHashPaths: MembershipWitness<typeof PUBLIC_DATA_TREE_HEIGHT>[],
    public readonly readsHashPaths: MembershipWitness<typeof PUBLIC_DATA_TREE_HEIGHT>[],
    public readonly publicDataTreeRoot: Fr,
  ) {
    assertLength(this, 'transitionsHashPaths', STATE_TRANSITIONS_LENGTH);
    assertLength(this, 'readsHashPaths', STATE_READS_LENGTH);
  }
}

export class PublicCallData {
  constructor(
    public readonly callStackItem: PublicCallStackItem,
    public readonly publicCallStackPreimages: PublicCallStackItem[],
    public readonly proof: UInt8Vector,
    public readonly portalContractAddress: Fr,
    public readonly bytecodeHash: Fr,
  ) {
    assertLength(this, 'publicCallStackPreimages', PUBLIC_CALL_STACK_LENGTH);
  }
}

export class PreviousPublicKernelData {
  constructor(
    public readonly publicInputs: PublicKernelPublicInputs,
    public readonly proof: UInt8Vector,
    public readonly vk: VerificationKey,
  ) {}
}

export class PublicKernelPublicInputs {
  public readonly isPrivateKernel = false;
  constructor(public readonly end: CombinedAccumulatedData, public readonly constants: CombinedConstantData) {}

  static empty() {
    return new PublicKernelPublicInputs(CombinedAccumulatedData.empty(), CombinedConstantData.empty());
  }
}
