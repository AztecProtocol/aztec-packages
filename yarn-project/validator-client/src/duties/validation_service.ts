import { Buffer32 } from '@aztec/foundation/buffer';
import { keccak256 } from '@aztec/foundation/crypto';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { unfreeze } from '@aztec/foundation/types';
import type { CommitteeAttestationsAndSigners } from '@aztec/stdlib/block';
import {
  BlockAttestation,
  BlockProposal,
  type BlockProposalOptions,
  ConsensusPayload,
  SignatureDomainSeparator,
} from '@aztec/stdlib/p2p';
import type { CheckpointHeader } from '@aztec/stdlib/rollup';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { StateReference, type Tx } from '@aztec/stdlib/tx';

import type { ValidatorKeyStore } from '../key_store/interface.js';

export class ValidationService {
  constructor(
    private keyStore: ValidatorKeyStore,
    private log = createLogger('validator:validation-service'),
  ) {}

  /**
   * Create a block proposal with the given header, archive, and transactions
   *
   * @param blockNumber - The block number this proposal is for
   * @param header - The block header
   * @param archive - The archive of the current block
   * @param txs - TxHash[] ordered list of transactions
   * @param options - Block proposal options (including broadcastInvalidBlockProposal for testing)
   *
   * @returns A block proposal signing the above information (not the current implementation!!!)
   */
  async createBlockProposal(
    blockNumber: number,
    header: CheckpointHeader,
    archive: Fr,
    stateReference: StateReference,
    txs: Tx[],
    proposerAttesterAddress: EthAddress | undefined,
    options: BlockProposalOptions,
  ): Promise<BlockProposal> {
    let payloadSigner: (payload: Buffer32) => Promise<Signature>;
    if (proposerAttesterAddress !== undefined) {
      payloadSigner = (payload: Buffer32) => this.keyStore.signMessageWithAddress(proposerAttesterAddress, payload);
    } else {
      // if there is no proposer attester address, just use the first signer
      const signer = this.keyStore.getAddress(0);
      payloadSigner = (payload: Buffer32) => this.keyStore.signMessageWithAddress(signer, payload);
    }
    // TODO: check if this is calculated earlier / can not be recomputed
    const txHashes = await Promise.all(txs.map(tx => tx.getTxHash()));

    // For testing: corrupt the state reference to trigger state_mismatch validation failure
    if (options.broadcastInvalidBlockProposal) {
      unfreeze(stateReference.partial).noteHashTree = AppendOnlyTreeSnapshot.random();
      this.log.warn(`Creating INVALID block proposal for block ${blockNumber} at slot ${header.slotNumber.toBigInt()}`);
    }

    return BlockProposal.createProposalFromSigner(
      blockNumber,
      new ConsensusPayload(header, archive, stateReference),
      txHashes,
      options.publishFullTxs ? txs : undefined,
      payloadSigner,
    );
  }

  /**
   * Attest with selection of validators to the given block proposal, constructed by the current sequencer
   *
   * NOTE: This is just a blind signing.
   *       We assume that the proposal is valid and DA guarantees have been checked previously.
   *
   * @param proposal - The proposal to attest to
   * @param attestors - The validators to attest with
   * @returns attestations
   */
  async attestToProposal(proposal: BlockProposal, attestors: EthAddress[]): Promise<BlockAttestation[]> {
    const buf = Buffer32.fromBuffer(
      keccak256(proposal.payload.getPayloadToSign(SignatureDomainSeparator.blockAttestation)),
    );
    const signatures = await Promise.all(
      attestors.map(attestor => this.keyStore.signMessageWithAddress(attestor, buf)),
    );
    //await this.keyStore.signMessage(buf);
    return signatures.map(sig => new BlockAttestation(proposal.blockNumber, proposal.payload, sig));
  }

  async signAttestationsAndSigners(
    attestationsAndSigners: CommitteeAttestationsAndSigners,
    proposer: EthAddress,
  ): Promise<Signature> {
    const buf = Buffer32.fromBuffer(
      keccak256(attestationsAndSigners.getPayloadToSign(SignatureDomainSeparator.attestationsAndSigners)),
    );
    return await this.keyStore.signMessageWithAddress(proposer, buf);
  }
}
