import { Fr } from '@aztec/foundation/fields';
import { toArray } from '@aztec/foundation/iterable';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap, AztecAsyncSingleton } from '@aztec/kv-store';
import { BlockAttestation } from '@aztec/stdlib/p2p';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { PoolInstrumentation, PoolName, type PoolStatsCallback } from '../instrumentation.js';
import type { AttestationPool } from './attestation_pool.js';

export class KvAttestationPool implements AttestationPool {
  private metrics: PoolInstrumentation<BlockAttestation>;

  private attestations: AztecAsyncMap<string, Buffer>;
  private attestationCount: AztecAsyncSingleton<number>;
  private proposalsForSlot: AztecAsyncMultiMap<string, string>;
  private attestationsForProposal: AztecAsyncMultiMap<string, string>;

  constructor(
    private store: AztecAsyncKVStore,
    telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('aztec:attestation_pool'),
  ) {
    this.attestations = store.openMap('attestations');
    this.attestationCount = store.openSingleton('attestations_count');
    this.proposalsForSlot = store.openMultiMap('proposals_for_slot');
    this.attestationsForProposal = store.openMultiMap('attestations_for_proposal');

    this.metrics = new PoolInstrumentation(telemetry, PoolName.ATTESTATION_POOL, this.poolStats);
  }

  private poolStats: PoolStatsCallback = async () => {
    return {
      itemCount: (await this.attestationCount.getAsync()) ?? 0,
    };
  };

  public async isEmpty(): Promise<boolean> {
    for await (const _ of this.attestations.entriesAsync()) {
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

  public async addAttestations(attestations: BlockAttestation[]): Promise<void> {
    await this.store.transactionAsync(async () => {
      for (const attestation of attestations) {
        const slotNumber = attestation.payload.header.slotNumber;
        const proposalId = attestation.archive;
        const address = attestation.getSender().toString();

        await this.attestations.set(this.getAttestationKey(slotNumber, proposalId, address), attestation.toBuffer());

        await this.proposalsForSlot.set(slotNumber.toString(), proposalId.toString());
        await this.attestationsForProposal.set(
          this.getProposalKey(slotNumber, proposalId),
          this.getAttestationKey(slotNumber, proposalId, address),
        );

        this.log.verbose(`Added attestation for slot ${slotNumber.toBigInt()} from ${address}`, {
          signature: attestation.signature.toString(),
          slotNumber,
          address,
          proposalId,
        });
      }

      await this.incAttestionCount(attestations.length);
    });
  }

  public async getAttestationsForSlot(slot: bigint): Promise<BlockAttestation[]> {
    const slotFr = new Fr(slot);
    const proposalIds = await toArray(this.proposalsForSlot.getValuesAsync(slotFr.toString()));
    const attestations: BlockAttestation[] = [];

    for (const proposalId of proposalIds) {
      attestations.push(...(await this.getAttestationsForSlotAndProposal(slot, proposalId)));
    }

    return attestations;
  }

  public async getAttestationsForSlotAndProposal(slot: bigint, proposalId: string): Promise<BlockAttestation[]> {
    const attestationIds = await toArray(
      this.attestationsForProposal.getValuesAsync(this.getProposalKey(slot, proposalId)),
    );
    const attestations: BlockAttestation[] = [];

    // alternatively iterate this.attestaions starting from slot-proposal-EthAddress.zero
    for (const id of attestationIds) {
      const buf = await this.attestations.getAsync(id);

      if (!buf) {
        // this should not happen unless we lost writes
        throw new Error('Attestation not found ' + id);
      }

      const attestation = BlockAttestation.fromBuffer(buf);
      attestations.push(attestation);
    }

    return attestations;
  }

  public async deleteAttestationsOlderThan(oldestSlot: bigint): Promise<void> {
    const olderThan = await toArray(this.proposalsForSlot.keysAsync({ end: new Fr(oldestSlot).toString() }));
    for (const oldSlot of olderThan) {
      await this.deleteAttestationsForSlot(BigInt(oldSlot));
    }
  }

  public async deleteAttestationsForSlot(slot: bigint): Promise<void> {
    const slotFr = new Fr(slot);
    let numberOfAttestations = 0;
    await this.store.transactionAsync(async () => {
      const proposalIds = await toArray(this.proposalsForSlot.getValuesAsync(slotFr.toString()));
      for (const proposalId of proposalIds) {
        const attestations = await toArray(
          this.attestationsForProposal.getValuesAsync(this.getProposalKey(slotFr, proposalId)),
        );

        numberOfAttestations += attestations.length;
        for (const attestation of attestations) {
          await this.attestations.delete(attestation);
        }

        await this.attestationsForProposal.delete(this.getProposalKey(slotFr, proposalId));
      }

      this.log.verbose(`Removed ${numberOfAttestations} attestations for slot ${slot}`);
      await this.incAttestionCount(-1 * numberOfAttestations);
    });
  }

  public async deleteAttestationsForSlotAndProposal(slot: bigint, proposalId: string): Promise<void> {
    let numberOfAttestations = 0;
    await this.store.transactionAsync(async () => {
      const slotString = new Fr(slot).toString();
      const attestations = await toArray(
        this.attestationsForProposal.getValuesAsync(this.getProposalKey(slot, proposalId)),
      );

      numberOfAttestations += attestations.length;
      for (const attestation of attestations) {
        await this.attestations.delete(attestation);
      }

      await this.proposalsForSlot.deleteValue(slotString, proposalId);
      await this.attestationsForProposal.delete(this.getProposalKey(slotString, proposalId));

      this.log.verbose(`Removed ${numberOfAttestations} attestations for slot ${slot} and proposal ${proposalId}`);
      await this.incAttestionCount(-1 * numberOfAttestations);
    });
  }

  public async deleteAttestations(attestations: BlockAttestation[]): Promise<void> {
    await this.store.transactionAsync(async () => {
      let deletionCount = 0;
      for (const attestation of attestations) {
        const slotNumber = attestation.payload.header.slotNumber;
        const proposalId = attestation.archive;
        const address = attestation.getSender().toString();
        const key = this.getAttestationKey(slotNumber, proposalId, address);

        if (await this.attestations.hasAsync(key)) {
          deletionCount++;
          await this.attestations.delete(key);
        }

        await this.attestationsForProposal.deleteValue(
          this.getProposalKey(slotNumber, proposalId),
          this.getAttestationKey(slotNumber, proposalId, address),
        );

        this.log.debug(`Deleted attestation for slot ${slotNumber} from ${address}`);
      }

      await this.incAttestionCount(-1 * deletionCount);
    });
  }

  private incAttestionCount(delta: number): Promise<void> {
    return this.store.transactionAsync(async () => {
      const count = (await this.attestationCount.getAsync()) ?? 0;
      await this.attestationCount.set(count + delta);
    });
  }
}
