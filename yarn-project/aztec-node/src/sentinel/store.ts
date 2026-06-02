import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { BufferReader, numToUInt8, numToUInt32BE, serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type {
  ValidatorStatusHistory,
  ValidatorStatusInSlot,
  ValidatorsEpochPerformance,
} from '@aztec/stdlib/validators';

export class SentinelStore {
  public static readonly SCHEMA_VERSION = 4;

  // a map from validator address to their ValidatorStatusHistory
  private readonly historyMap: AztecAsyncMap<`0x${string}`, Buffer>;

  // a map from validator address to their historical epoch performance, evaluated at end-of-epoch.
  // e.g. { validator: [{ epoch: 1, missed: 1, total: 10 }, { epoch: 2, missed: 3, total: 7 }, ...] }
  private readonly epochMap: AztecAsyncMap<`0x${string}`, Buffer>;

  constructor(
    private store: AztecAsyncKVStore,
    private config: { historyLength: number; historicEpochPerformanceLength: number },
  ) {
    this.historyMap = store.openMap('sentinel-validator-status');
    this.epochMap = store.openMap('sentinel-validator-epoch');
  }

  public getHistoryLength() {
    return this.config.historyLength;
  }

  public getHistoricEpochPerformanceLength() {
    return this.config.historicEpochPerformanceLength;
  }

  public async updateEpochPerformance(epoch: EpochNumber, performance: ValidatorsEpochPerformance) {
    await this.store.transactionAsync(async () => {
      for (const [who, { missed, total }] of Object.entries(performance)) {
        await this.pushValidatorEpochPerformance({ who: EthAddress.fromString(who), missed, total, epoch });
      }
    });
  }

  public async getEpochPerformance(who: EthAddress): Promise<{ missed: number; total: number; epoch: EpochNumber }[]> {
    const currentPerformanceBuffer = await this.epochMap.getAsync(who.toString());
    return currentPerformanceBuffer ? this.deserializePerformance(currentPerformanceBuffer) : [];
  }

  private async pushValidatorEpochPerformance({
    who,
    missed,
    total,
    epoch,
  }: {
    who: EthAddress;
    missed: number;
    total: number;
    epoch: EpochNumber;
  }) {
    const currentPerformance = await this.getEpochPerformance(who);
    const existingIndex = currentPerformance.findIndex(p => p.epoch === epoch);
    if (existingIndex !== -1) {
      currentPerformance[existingIndex] = { missed, total, epoch };
    } else {
      currentPerformance.push({ missed, total, epoch });
    }

    // This should be sorted by epoch, but just in case.
    // Since we keep the size small, this is not a big deal.
    currentPerformance.sort((a, b) => Number(a.epoch - b.epoch));

    // keep the most recent `historicEpochPerformanceLength` entries.
    const performanceToKeep = currentPerformance.slice(-this.config.historicEpochPerformanceLength);

    await this.epochMap.set(who.toString(), this.serializePerformance(performanceToKeep));
  }

  public async updateValidators(slot: SlotNumber, statuses: Record<`0x${string}`, ValidatorStatusInSlot | undefined>) {
    await this.store.transactionAsync(async () => {
      for (const [who, status] of Object.entries(statuses)) {
        if (status) {
          await this.pushValidatorStatusForSlot(EthAddress.fromString(who), slot, status);
        }
      }
    });
  }

  private async pushValidatorStatusForSlot(who: EthAddress, slot: SlotNumber, status: ValidatorStatusInSlot) {
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

  public async getHistory(address: EthAddress): Promise<ValidatorStatusHistory | undefined> {
    const data = await this.historyMap.getAsync(address.toString());
    return data && this.deserializeHistory(data);
  }

  private serializePerformance(performance: { missed: number; total: number; epoch: EpochNumber }[]): Buffer {
    return serializeToBuffer(
      performance.map(p => [numToUInt32BE(Number(p.epoch)), numToUInt32BE(p.missed), numToUInt32BE(p.total)]),
    );
  }

  private deserializePerformance(buffer: Buffer): { missed: number; total: number; epoch: EpochNumber }[] {
    const reader = new BufferReader(buffer);
    const performance: { missed: number; total: number; epoch: EpochNumber }[] = [];
    while (!reader.isEmpty()) {
      performance.push({
        epoch: EpochNumber(reader.readNumber()),
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
      const slot = SlotNumber(reader.readNumber());
      const status = this.statusFromNumber(reader.readUInt8());
      history.push({ slot, status });
    }
    return history;
  }

  private statusToNumber(status: ValidatorStatusInSlot): number {
    switch (status) {
      case 'checkpoint-mined':
        return 1;
      case 'checkpoint-valid':
        return 2;
      case 'checkpoint-missed':
        return 3;
      case 'attestation-sent':
        return 4;
      case 'attestation-missed':
        return 5;
      case 'blocks-missed':
        return 6;
      case 'checkpoint-invalid':
        return 7;
      case 'checkpoint-unvalidated':
        return 8;
      default: {
        const _exhaustive: never = status;
        throw new Error(`Unknown status: ${status}`);
      }
    }
  }

  private statusFromNumber(status: number): ValidatorStatusInSlot {
    switch (status) {
      case 1:
        return 'checkpoint-mined';
      case 2:
        return 'checkpoint-valid';
      case 3:
        return 'checkpoint-missed';
      case 4:
        return 'attestation-sent';
      case 5:
        return 'attestation-missed';
      case 6:
        return 'blocks-missed';
      case 7:
        return 'checkpoint-invalid';
      case 8:
        return 'checkpoint-unvalidated';
      default:
        throw new Error(`Unknown status: ${status}`);
    }
  }
}
