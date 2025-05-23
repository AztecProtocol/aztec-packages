import { Buffer32 } from '@aztec/foundation/buffer';
import { keccak256 } from '@aztec/foundation/crypto';
import type { Fr } from '@aztec/foundation/fields';
import {
  BlockAttestation,
  BlockProposal,
  type BlockProposalOptions,
  ConsensusPayload,
  SignatureDomainSeparator,
} from '@aztec/stdlib/p2p';
import type { ProposedBlockHeader, StateReference, Tx } from '@aztec/stdlib/tx';

import type { ValidatorKeyStore } from '../key_store/interface.js';

export class ValidationService {
  constructor(private keyStore: ValidatorKeyStore) {}

  /**
   * Create a block proposal with the given header, archive, and transactions
   *
   * @param blockNumber - The block number this proposal is for
   * @param header - The block header
   * @param archive - The archive of the current block
   * @param txs - TxHash[] ordered list of transactions
   *
   * @returns A block proposal signing the above information (not the current implementation!!!)
   */
  async createBlockProposal(
    blockNumber: Fr,
    header: ProposedBlockHeader,
    archive: Fr,
    stateReference: StateReference,
    txs: Tx[],
    options: BlockProposalOptions,
  ): Promise<BlockProposal> {
    const payloadSigner = (payload: Buffer32) => this.keyStore.signMessage(payload);
    // TODO: check if this is calculated earlier / can not be recomputed
    const txHashes = await Promise.all(txs.map(tx => tx.getTxHash()));

    return BlockProposal.createProposalFromSigner(
      blockNumber,
      new ConsensusPayload(header, archive, stateReference, txHashes),
      options.publishFullTxs ? txs : undefined,
      payloadSigner,
    );
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
      keccak256(proposal.payload.getPayloadToSign(SignatureDomainSeparator.blockAttestation)),
    );
    const sig = await this.keyStore.signMessage(buf);
    return new BlockAttestation(proposal.blockNumber, proposal.payload, sig);
  }
}
