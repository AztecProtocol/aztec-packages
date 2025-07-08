import { EthAddress } from '@aztec/foundation/eth-address';
import { BufferReader, numToUInt8, numToUInt32BE, serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type {
  ValidatorStatusHistory,
  ValidatorStatusInSlot,
  ValidatorsEpochPerformance,
} from '@aztec/stdlib/validators';

export class SentinelStore {
  public static readonly SCHEMA_VERSION = 2;

  // a map from validator address to their ValidatorStatusHistory
  private readonly historyMap: AztecAsyncMap<`0x${string}`, Buffer>;

  // a map from validator address to their historical proven epoch performance
  // e.g. { validator: [{ epoch: 1, missed: 1, total: 10 }, { epoch: 2, missed: 3, total: 7 }, ...] }
  private readonly provenMap: AztecAsyncMap<`0x${string}`, Buffer>;

  constructor(private store: AztecAsyncKVStore, private config: { historyLength: number }) {
    this.historyMap = store.openMap('sentinel-validator-status');
    this.provenMap = store.openMap('sentinel-validator-proven');
  }

  public getHistoryLength() {
    return this.config.historyLength;
  }

  public async updateProvenPerformance(epoch: bigint, performance: ValidatorsEpochPerformance) {
    await this.store.transactionAsync(async () => {
      for (const [who, { missed, total }] of Object.entries(performance)) {
        await this.pushValidatorProvenPerformanceForEpoch({ who: EthAddress.fromString(who), missed, total, epoch });
      }
    });
  }

  public async getProvenPerformance(who: EthAddress): Promise<{ missed: number; total: number; epoch: bigint }[]> {
    const currentPerformanceBuffer = await this.provenMap.getAsync(who.toString());
    return currentPerformanceBuffer ? this.deserializePerformance(currentPerformanceBuffer) : [];
  }

  private async pushValidatorProvenPerformanceForEpoch({
    who,
    missed,
    total,
    epoch,
  }: {
    who: EthAddress;
    missed: number;
    total: number;
    epoch: bigint;
  }) {
    const currentPerformance = await this.getProvenPerformance(who);
    const existingIndex = currentPerformance.findIndex(p => p.epoch === epoch);
    if (existingIndex !== -1) {
      currentPerformance[existingIndex] = { missed, total, epoch };
    } else {
      currentPerformance.push({ missed, total, epoch });
    }

    // This should be sorted by epoch, but just in case.
    // Since we keep the size small, this is not a big deal.
    currentPerformance.sort((a, b) => Number(a.epoch - b.epoch));

    // keep the most recent `historyLength` entries.
    const performanceToKeep = currentPerformance.slice(-this.config.historyLength);

    await this.provenMap.set(who.toString(), this.serializePerformance(performanceToKeep));
  }

  public async updateValidators(slot: bigint, statuses: Record<`0x${string}`, ValidatorStatusInSlot | undefined>) {
    await this.store.transactionAsync(async () => {
      for (const [who, status] of Object.entries(statuses)) {
        if (status) {
          await this.pushValidatorStatusForSlot(EthAddress.fromString(who), slot, status);
        }
      }
    });
  }

  private async pushValidatorStatusForSlot(
    who: EthAddress,
    slot: bigint,
    status: 'block-mined' | 'block-proposed' | 'block-missed' | 'attestation-sent' | 'attestation-missed',
  ) {
    await this.store.transactionAsync(async () => {
      const currentHistory = (await this.getHistory(who)) ?? [];
      const newHistory = [...currentHistory, { slot, status }].slice(-this.config.historyLength);
      await this.historyMap.set(who.toString(), this.serializeHistory(newHistory));
    });
  }

  public async getHistories(): Promise<Record<`0x${string}`, ValidatorStatusHistory>> {
    const histories: Record<`0x${string}`, ValidatorStatusHistory> = {};
    for await (const [address, history] of this.historyMap.entriesAsync()) {
      histories[address] = this.deserializeHistory(history);
    }
    return histories;
  }

  private async getHistory(address: EthAddress): Promise<ValidatorStatusHistory | undefined> {
    const data = await this.historyMap.getAsync(address.toString());
    return data && this.deserializeHistory(data);
  }

  private serializePerformance(performance: { missed: number; total: number; epoch: bigint }[]): Buffer {
    return serializeToBuffer(
      performance.map(p => [numToUInt32BE(Number(p.epoch)), numToUInt32BE(p.missed), numToUInt32BE(p.total)]),
    );
  }

  private deserializePerformance(buffer: Buffer): { missed: number; total: number; epoch: bigint }[] {
    const reader = new BufferReader(buffer);
    const performance: { missed: number; total: number; epoch: bigint }[] = [];
    while (!reader.isEmpty()) {
      performance.push({
        epoch: BigInt(reader.readNumber()),
        missed: reader.readNumber(),
        total: reader.readNumber(),
      });
    }
    return performance;
  }

  private serializeHistory(history: ValidatorStatusHistory): Buffer {
    return serializeToBuffer(
      history.map(h => [numToUInt32BE(Number(h.slot)), numToUInt8(this.statusToNumber(h.status))]),
    );
  }

  private deserializeHistory(buffer: Buffer): ValidatorStatusHistory {
    const reader = new BufferReader(buffer);
    const history: ValidatorStatusHistory = [];
    while (!reader.isEmpty()) {
      const slot = BigInt(reader.readNumber());
      const status = this.statusFromNumber(reader.readUInt8());
      history.push({ slot, status });
    }
    return history;
  }

  private statusToNumber(status: ValidatorStatusInSlot): number {
    switch (status) {
      case 'block-mined':
        return 1;
      case 'block-proposed':
        return 2;
      case 'block-missed':
        return 3;
      case 'attestation-sent':
        return 4;
      case 'attestation-missed':
        return 5;
      default: {
        const _exhaustive: never = status;
        throw new Error(`Unknown status: ${status}`);
      }
    }
  }

  private statusFromNumber(status: number): ValidatorStatusInSlot {
    switch (status) {
      case 1:
        return 'block-mined';
      case 2:
        return 'block-proposed';
      case 3:
        return 'block-missed';
      case 4:
        return 'attestation-sent';
      case 5:
        return 'attestation-missed';
      default:
        throw new Error(`Unknown status: ${status}`);
    }
  }
}
