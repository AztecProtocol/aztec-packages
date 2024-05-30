import { type Fr } from '@aztec/foundation/fields';
import { serializeToBuffer } from '@aztec/foundation/serialize';

import { type RECURSIVE_PROOF_LENGTH } from '../../constants.gen.js';
import { type Header } from '../header.js';
import { type RecursiveProof } from '../recursive_proof.js';
import { type VerificationKeyAsFields } from '../verification_key.js';

export class PrivateKernelEmptyInputs {
  constructor(
    public readonly emptyNested: EmptyNestedData,
    public readonly header: Header,
    public readonly chainId: Fr,
    public readonly version: Fr,
  ) {}

  toBuffer(): Buffer {
    return serializeToBuffer(this.emptyNested, this.header, this.chainId, this.version);
  }
}

export class EmptyNestedCircuitInputs {
  toBuffer(): Buffer {
    return Buffer.alloc(0);
  }
}

export class EmptyNestedData {
  constructor(
    public readonly proof: RecursiveProof<typeof RECURSIVE_PROOF_LENGTH>,
    public readonly vk: VerificationKeyAsFields,
  ) {}

  toBuffer(): Buffer {
    return serializeToBuffer(this.proof, this.vk);
  }
}
