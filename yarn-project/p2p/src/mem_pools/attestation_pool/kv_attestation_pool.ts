import { SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { toArray } from '@aztec/foundation/iterable';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import {
  BlockProposal,
  CheckpointAttestation,
  CheckpointProposal,
  type CheckpointProposalCore,
} from '@aztec/stdlib/p2p';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { ProposalSlotCapExceededError } from '../../errors/attestation-pool.error.js';
import { PoolInstrumentation, PoolName, type PoolStatsCallback } from '../instrumentation.js';
import type { AttestationPool } from './attestation_pool.js';

export const MAX_PROPOSALS_PER_SLOT = 5;
export const ATTESTATION_CAP_BUFFER = 10;

export class KvAttestationPool implements AttestationPool {
  private metrics: PoolInstrumentation<CheckpointAttestation>;

  private proposals: AztecAsyncMap<
    /*  proposal.payload.archive  */ string,
    /* buffer representation of proposal */ Buffer
  >;

  // Checkpoint attestation storage
  private checkpointAttestations: AztecAsyncMap<string, Buffer>;
  private checkpointProposals: AztecAsyncMap<string, Buffer>;
  private checkpointProposalsForSlot: AztecAsyncMultiMap<number, string>;
  private checkpointAttestationsForProposal: AztecAsyncMultiMap<string, string>;

  constructor(
    private store: AztecAsyncKVStore,
    telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('aztec:attestation_pool'),
  ) {
    this.proposals = store.openMap('proposals');

    // Initialize checkpoint attestation storage
    this.checkpointAttestations = store.openMap('checkpoint_attestations');
    this.checkpointProposals = store.openMap('checkpoint_proposals');
    this.checkpointProposalsForSlot = store.openMultiMap('checkpoint_proposals_for_slot');
    this.checkpointAttestationsForProposal = store.openMultiMap('checkpoint_attestations_for_proposal');

    this.metrics = new PoolInstrumentation(telemetry, PoolName.ATTESTATION_POOL, this.poolStats);
  }

  private poolStats: PoolStatsCallback = async () => {
    return {
      itemCount: await this.checkpointAttestations.sizeAsync(),
    };
  };

  public async isEmpty(): Promise<boolean> {
    for await (const _ of this.checkpointAttestations.entriesAsync()) {
      return false;
    }
    for await (const _ of this.proposals.entriesAsync()) {
      return false;
    }
    return true;
  }

  private getProposalKey(slot: number | bigint | Fr | string, proposalId: Fr | string | Buffer): string {
    const slotStr = typeof slot === 'string' ? slot : new Fr(slot).toString();
    const proposalIdStr =
      typeof proposalId === 'string'
        ? proposalId
        : Buffer.isBuffer(proposalId)
          ? Fr.fromBuffer(proposalId).toString()
          : proposalId.toString();

    return `${slotStr}-${proposalIdStr}`;
  }

  private getAttestationKey(slot: number | bigint | Fr | string, proposalId: Fr | string, address: string): string {
    return `${this.getProposalKey(slot, proposalId)}-${address}`;
  }

  public async addBlockProposal(blockProposal: BlockProposal): Promise<void> {
    await this.store.transactionAsync(async () => {
      const proposalId = blockProposal.archive.toString();
      // Strip signedTxs before storing to avoid persisting full tx data
      await this.proposals.set(proposalId, blockProposal.withoutSignedTxs().toBuffer());
    });
  }

  public async getBlockProposal(id: string): Promise<BlockProposal | undefined> {
    const buffer = await this.proposals.getAsync(id);
    try {
      if (buffer && buffer.length > 0) {
        return BlockProposal.fromBuffer(buffer);
      }
    } catch {
      return Promise.resolve(undefined);
    }

    return Promise.resolve(undefined);
  }

  public async hasBlockProposal(idOrProposal: string | BlockProposal): Promise<boolean> {
    const id = typeof idOrProposal === 'string' ? idOrProposal : idOrProposal.archive.toString();
    return await this.proposals.hasAsync(id);
  }

  public async addCheckpointProposal(proposal: CheckpointProposal): Promise<void> {
    if (!(await this.canAddCheckpointProposal(proposal))) {
      throw new ProposalSlotCapExceededError(
        `Maximum checkpoint proposals per slot reached: slot=${proposal.slotNumber} cap=${MAX_PROPOSALS_PER_SLOT} proposal=${proposal.archive.toString()}`,
      );
    }

    // Extract and validate the block proposal if present
    const blockProposal = proposal.getBlockProposal();
    if (blockProposal && !(await this.canAddProposal(blockProposal))) {
      throw new ProposalSlotCapExceededError(
        `Maximum block proposals per slot reached when extracting from checkpoint: slot=${proposal.slotNumber} proposal=${blockProposal.archive.toString()}`,
      );
    }

    await this.store.transactionAsync(async () => {
      const slotKey = proposal.slotNumber;
      const proposalId = proposal.archive.toString();

      await this.checkpointProposalsForSlot.set(slotKey, proposalId);
      // Store the checkpoint proposal as core (without lastBlock) to avoid duplication
      await this.checkpointProposals.set(proposalId, proposal.toCore().toBuffer());

      // Store the extracted block proposal separately
      if (blockProposal) {
        await this.proposals.set(blockProposal.archive.toString(), blockProposal.withoutSignedTxs().toBuffer());
      }
    });
  }

  public async getCheckpointProposal(id: string): Promise<CheckpointProposalCore | undefined> {
    const buffer = await this.checkpointProposals.getAsync(id);
    try {
      if (buffer && buffer.length > 0) {
        return CheckpointProposal.fromBuffer(buffer);
      }
    } catch {
      return Promise.resolve(undefined);
    }

    return Promise.resolve(undefined);
  }

  public async hasCheckpointProposal(idOrProposal: string | CheckpointProposal): Promise<boolean> {
    const id = typeof idOrProposal === 'string' ? idOrProposal : idOrProposal.archive.toString();
    return await this.checkpointProposals.hasAsync(id);
  }

  public async addCheckpointAttestations(attestations: CheckpointAttestation[]): Promise<void> {
    await this.store.transactionAsync(async () => {
      for (const attestation of attestations) {
        const slotNumber = attestation.payload.header.slotNumber;
        const proposalId = attestation.archive;
        const sender = attestation.getSender();

        // Skip attestations with invalid signatures
        if (!sender) {
          this.log.warn(`Skipping checkpoint attestation with invalid signature for slot ${slotNumber}`, {
            signature: attestation.signature.toString(),
            slotNumber,
            proposalId,
          });
          continue;
        }

        const address = sender.toString();

        await this.checkpointAttestations.set(
          this.getAttestationKey(slotNumber, proposalId, address),
          attestation.toBuffer(),
        );

        await this.checkpointProposalsForSlot.set(slotNumber, proposalId.toString());
        await this.checkpointAttestationsForProposal.set(
          this.getProposalKey(slotNumber, proposalId),
          this.getAttestationKey(slotNumber, proposalId, address),
        );

        this.log.verbose(`Added checkpoint attestation for slot ${slotNumber} from ${address}`, {
          signature: attestation.signature.toString(),
          slotNumber,
          address,
          proposalId,
        });
      }
    });
  }

  public async getCheckpointAttestationsForSlot(slot: SlotNumber): Promise<CheckpointAttestation[]> {
    const proposalIds = await toArray(this.checkpointProposalsForSlot.getValuesAsync(slot));
    const attestations: CheckpointAttestation[] = [];

    for (const proposalId of proposalIds) {
      attestations.push(...(await this.getCheckpointAttestationsForSlotAndProposal(slot, proposalId)));
    }

    return attestations;
  }

  public async getCheckpointAttestationsForSlotAndProposal(
    slot: SlotNumber,
    proposalId: string,
  ): Promise<CheckpointAttestation[]> {
    const attestationIds = await toArray(
      this.checkpointAttestationsForProposal.getValuesAsync(this.getProposalKey(slot, proposalId)),
    );
    const attestations: CheckpointAttestation[] = [];

    for (const id of attestationIds) {
      const buf = await this.checkpointAttestations.getAsync(id);

      if (!buf) {
        throw new Error('Checkpoint attestation not found ' + id);
      }

      const attestation = CheckpointAttestation.fromBuffer(buf);
      attestations.push(attestation);
    }

    return attestations;
  }

  public async deleteCheckpointAttestationsOlderThan(oldestSlot: SlotNumber): Promise<void> {
    const olderThan = await toArray(this.checkpointProposalsForSlot.keysAsync({ end: oldestSlot }));
    for (const oldSlot of olderThan) {
      await this.deleteCheckpointAttestationsForSlot(SlotNumber(oldSlot));
    }
  }

  private async deleteCheckpointAttestationsForSlot(slot: SlotNumber): Promise<void> {
    let numberOfAttestations = 0;
    await this.store.transactionAsync(async () => {
      const proposalIds = await toArray(this.checkpointProposalsForSlot.getValuesAsync(slot));
      for (const proposalId of proposalIds) {
        const attestations = await toArray(
          this.checkpointAttestationsForProposal.getValuesAsync(this.getProposalKey(slot, proposalId)),
        );

        numberOfAttestations += attestations.length;
        for (const attestation of attestations) {
          await this.checkpointAttestations.delete(attestation);
        }

        await this.checkpointProposals.delete(proposalId);
        await this.checkpointAttestationsForProposal.delete(this.getProposalKey(slot, proposalId));
      }

      await this.checkpointProposalsForSlot.delete(slot);

      this.log.verbose(`Removed ${numberOfAttestations} checkpoint attestations for slot ${slot}`);
    });
  }

  public async hasCheckpointAttestation(attestation: CheckpointAttestation): Promise<boolean> {
    const slotNumber = attestation.payload.header.slotNumber;
    const proposalId = attestation.archive;
    const sender = attestation.getSender();

    // Attestations with invalid signatures are never in the pool
    if (!sender) {
      return false;
    }

    const address = sender.toString();
    const key = this.getAttestationKey(slotNumber, proposalId, address);

    return await this.checkpointAttestations.hasAsync(key);
  }

  public canAddProposal(_block: BlockProposal): Promise<boolean> {
    // TODO(palla/mbps): implement proposal cap logic
    return Promise.resolve(true);
  }

  public async canAddCheckpointProposal(proposal: CheckpointProposal): Promise<boolean> {
    // TODO(palla/mbps): Adjust checkpoint proposal limit to 1. Also connect to slashing condition in the caller.
    return (
      (await this.checkpointProposals.hasAsync(proposal.archive.toString())) ||
      !(await this.hasReachedCheckpointProposalCap(proposal.slotNumber))
    );
  }

  public async canAddCheckpointAttestation(
    attestation: CheckpointAttestation,
    committeeSize: number,
  ): Promise<boolean> {
    return (
      (await this.hasCheckpointAttestation(attestation)) ||
      !(await this.hasReachedCheckpointAttestationCap(
        attestation.payload.header.slotNumber,
        attestation.archive.toString(),
        committeeSize,
      ))
    );
  }

  public async hasReachedCheckpointProposalCap(slot: SlotNumber): Promise<boolean> {
    const uniqueProposalCount = await this.checkpointProposalsForSlot.getValueCountAsync(slot);
    return uniqueProposalCount >= MAX_PROPOSALS_PER_SLOT;
  }

  public async hasReachedCheckpointAttestationCap(
    slot: SlotNumber,
    proposalId: string,
    committeeSize: number,
  ): Promise<boolean> {
    const limit = committeeSize + ATTESTATION_CAP_BUFFER;
    return (
      (await this.checkpointAttestationsForProposal.getValueCountAsync(this.getProposalKey(slot, proposalId))) >= limit
    );
  }
}
