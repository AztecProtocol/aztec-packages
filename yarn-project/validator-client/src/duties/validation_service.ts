import {
  BlockAttestation,
  BlockProposal,
  ConsensusPayload,
  SignatureDomainSeperator,
  type TxHash,
} from '@aztec/circuit-types';
import { type BlockHeader } from '@aztec/circuits.js';
import { Buffer32 } from '@aztec/foundation/buffer';
import { keccak256 } from '@aztec/foundation/crypto';
import { type Fr } from '@aztec/foundation/fields';

import { type ValidatorKeyStore } from '../key_store/interface.js';

export class ValidationService {
  constructor(private keyStore: ValidatorKeyStore) {}

  /**
   * Create a block proposal with the given header, archive, and transactions
   *
   * @param header - The block header
   * @param archive - The archive of the current block
   * @param txs - TxHash[] ordered list of transactions
   *
   * @returns A block proposal signing the above information (not the current implementation!!!)
   */
  createBlockProposal(header: BlockHeader, archive: Fr, txs: TxHash[]): Promise<BlockProposal> {
    const payloadSigner = (payload: Buffer32) => this.keyStore.signMessage(payload);

    return BlockProposal.createProposalFromSigner(new ConsensusPayload(header, archive, txs), payloadSigner);
  }

  /**
   * Attest to the given block proposal constructed by the current sequencer
   *
   * NOTE: This is just a blind signing.
   *       We assume that the proposal is valid and DA guarantees have been checked previously.
   *
   * @param proposal - The proposal to attest to
   * @returns attestation
   */
  async attestToProposal(proposal: BlockProposal): Promise<BlockAttestation> {
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/7961): check that the current validator is correct

    const buf = Buffer32.fromBuffer(
      keccak256(proposal.payload.getPayloadToSign(SignatureDomainSeperator.blockAttestation)),
    );
    const sig = await this.keyStore.signMessage(buf);
    return new BlockAttestation(proposal.payload, sig);
  }
}
