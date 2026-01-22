import type { SlotNumber } from '@aztec/foundation/branded-types';
import type { Logger } from '@aztec/foundation/log';
import type {
  BlockProposal,
  CheckpointAttestation,
  CheckpointProposal,
  CheckpointProposalCore,
} from '@aztec/stdlib/p2p';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { ProposalSlotCapExceededError } from '../../errors/attestation-pool.error.js';
import { PoolInstrumentation, PoolName, type PoolStatsCallback } from '../instrumentation.js';
import type { AttestationPool } from './attestation_pool.js';
import { ATTESTATION_CAP_BUFFER, MAX_PROPOSALS_PER_SLOT } from './kv_attestation_pool.js';

export class InMemoryAttestationPool implements AttestationPool {
  private metrics: PoolInstrumentation<CheckpointAttestation>;

  private proposals: Map<string, BlockProposal>;

  // Checkpoint attestations
  // eslint-disable-next-line aztec-custom/no-non-primitive-in-collections
  private checkpointAttestations: Map<
    /*slot=*/ SlotNumber,
    Map</*proposalId*/ string, Map</*address=*/ string, CheckpointAttestation>>
  >;
  private checkpointProposals: Map<string, CheckpointProposalCore>;

  constructor(
    private log: Logger,
    telemetry: TelemetryClient = getTelemetryClient(),
  ) {
    this.proposals = new Map();
    this.checkpointAttestations = new Map();
    this.checkpointProposals = new Map();
    this.metrics = new PoolInstrumentation(telemetry, PoolName.ATTESTATION_POOL, this.poolStats);
  }

  private poolStats: PoolStatsCallback = () => {
    return Promise.resolve({
      itemCount: this.checkpointAttestations.size,
    });
  };

  public isEmpty(): Promise<boolean> {
    return Promise.resolve(this.checkpointAttestations.size === 0 && this.proposals.size === 0);
  }

  public addBlockProposal(blockProposal: BlockProposal): Promise<void> {
    // Strip signedTxs before storing to avoid holding full tx data in memory
    this.proposals.set(blockProposal.archive.toString(), blockProposal.withoutSignedTxs());
    return Promise.resolve();
  }

  public getBlockProposal(id: string): Promise<BlockProposal | undefined> {
    return Promise.resolve(this.proposals.get(id));
  }

  public hasBlockProposal(idOrProposal: string | BlockProposal): Promise<boolean> {
    const id = typeof idOrProposal === 'string' ? idOrProposal : idOrProposal.archive.toString();
    return Promise.resolve(this.proposals.has(id));
  }

  public canAddProposal(_block: BlockProposal): Promise<boolean> {
    // TODO(palla/mbps): See when to allow
    return Promise.resolve(true);
  }

  // Checkpoint attestation methods

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

    const slotProposalMapping = getCheckpointSlotOrDefault(this.checkpointAttestations, proposal.slotNumber);
    slotProposalMapping.set(proposal.archive.toString(), new Map<string, CheckpointAttestation>());

    // Store the checkpoint proposal as core (without lastBlock) to avoid duplication
    this.checkpointProposals.set(proposal.archive.toString(), proposal.toCore());

    // Store the extracted block proposal separately
    if (blockProposal) {
      this.proposals.set(blockProposal.archive.toString(), blockProposal.withoutSignedTxs());
    }

    return Promise.resolve();
  }

  public getCheckpointProposal(id: string): Promise<CheckpointProposalCore | undefined> {
    return Promise.resolve(this.checkpointProposals.get(id));
  }

  public hasCheckpointProposal(idOrProposal: string | CheckpointProposal): Promise<boolean> {
    const id = typeof idOrProposal === 'string' ? idOrProposal : idOrProposal.archive.toString();
    return Promise.resolve(this.checkpointProposals.has(id));
  }

  public addCheckpointAttestations(attestations: CheckpointAttestation[]): Promise<void> {
    for (const attestation of attestations) {
      const slotNumber = attestation.payload.header.slotNumber;
      const proposalId = attestation.archive.toString();
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

      const slotAttestationMap = getCheckpointSlotOrDefault(this.checkpointAttestations, slotNumber);
      const proposalAttestationMap = getCheckpointProposalOrDefault(slotAttestationMap, proposalId);
      proposalAttestationMap.set(sender.toString(), attestation);

      this.log.verbose(`Added checkpoint attestation for slot ${slotNumber} from ${sender}`, {
        signature: attestation.signature.toString(),
        slotNumber,
        address: sender,
        proposalId,
      });
    }

    return Promise.resolve();
  }

  public getCheckpointAttestationsForSlot(slot: SlotNumber): Promise<CheckpointAttestation[]> {
    return Promise.resolve(
      Array.from(this.checkpointAttestations.get(slot)?.values() ?? []).flatMap(proposalAttestationMap =>
        Array.from(proposalAttestationMap.values()),
      ),
    );
  }

  public getCheckpointAttestationsForSlotAndProposal(
    slot: SlotNumber,
    proposalId: string,
  ): Promise<CheckpointAttestation[]> {
    const slotAttestationMap = this.checkpointAttestations.get(slot);
    if (slotAttestationMap) {
      const proposalAttestationMap = slotAttestationMap.get(proposalId);
      if (proposalAttestationMap) {
        return Promise.resolve(Array.from(proposalAttestationMap.values()));
      }
    }
    return Promise.resolve([]);
  }

  public deleteCheckpointAttestationsOlderThan(oldestSlot: SlotNumber): Promise<void> {
    const olderThan = [];

    const slots = this.checkpointAttestations.keys();
    for (const slot of slots) {
      if (slot < oldestSlot) {
        olderThan.push(slot);
      } else {
        break;
      }
    }

    for (const oldSlot of olderThan) {
      const proposalIds = this.checkpointAttestations.get(oldSlot)?.keys();
      proposalIds?.forEach(proposalId => this.checkpointProposals.delete(proposalId));
      this.checkpointAttestations.delete(oldSlot);
    }
    return Promise.resolve();
  }

  public hasReachedCheckpointProposalCap(slot: SlotNumber): Promise<boolean> {
    const slotAttestationMap = this.checkpointAttestations.get(slot);
    const proposalCount = slotAttestationMap?.size ?? 0;
    return Promise.resolve(proposalCount >= MAX_PROPOSALS_PER_SLOT);
  }

  public hasReachedCheckpointAttestationCap(
    slot: SlotNumber,
    proposalId: string,
    committeeSize: number,
  ): Promise<boolean> {
    const limit = committeeSize + ATTESTATION_CAP_BUFFER;
    const count = this.checkpointAttestations.get(slot)?.get(proposalId)?.size ?? 0;
    return Promise.resolve(limit <= 0 || count >= limit);
  }

  public async canAddCheckpointProposal(proposal: CheckpointProposal): Promise<boolean> {
    return (
      this.checkpointProposals.has(proposal.archive.toString()) ||
      !(await this.hasReachedCheckpointProposalCap(proposal.slotNumber))
    );
  }

  public async canAddCheckpointAttestation(
    attestation: CheckpointAttestation,
    committeeSize: number,
  ): Promise<boolean> {
    const sender = attestation.getSender();
    const slot = attestation.payload.header.slotNumber;
    const pid = attestation.archive.toString();
    return (
      !!sender &&
      ((this.checkpointAttestations.get(slot)?.get(pid)?.has(sender.toString()) ?? false) ||
        !(await this.hasReachedCheckpointAttestationCap(slot, pid, committeeSize)))
    );
  }

  public hasCheckpointAttestation(attestation: CheckpointAttestation): Promise<boolean> {
    const slotNumber = attestation.payload.header.slotNumber;
    const proposalId = attestation.archive.toString();
    const sender = attestation.getSender();

    // Attestations with invalid signatures are never in the pool
    if (!sender) {
      return Promise.resolve(false);
    }

    const slotAttestationMap = this.checkpointAttestations.get(slotNumber);
    if (!slotAttestationMap) {
      return Promise.resolve(false);
    }

    const proposalAttestationMap = slotAttestationMap.get(proposalId);
    if (!proposalAttestationMap) {
      return Promise.resolve(false);
    }

    return Promise.resolve(proposalAttestationMap.has(sender.toString()));
  }
}

// Checkpoint attestation helper functions

function getCheckpointSlotOrDefault(
  // eslint-disable-next-line aztec-custom/no-non-primitive-in-collections
  map: Map<SlotNumber, Map<string, Map<string, CheckpointAttestation>>>,
  slot: SlotNumber,
): Map<string, Map<string, CheckpointAttestation>> {
  if (!map.has(slot)) {
    map.set(slot, new Map<string, Map<string, CheckpointAttestation>>());
  }
  return map.get(slot)!;
}

function getCheckpointProposalOrDefault(
  map: Map<string, Map<string, CheckpointAttestation>>,
  proposalId: string,
): Map<string, CheckpointAttestation> {
  if (!map.has(proposalId)) {
    map.set(proposalId, new Map<string, CheckpointAttestation>());
  }
  return map.get(proposalId)!;
}
