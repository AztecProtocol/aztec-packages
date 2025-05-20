import { BufferReader, numToUInt8, numToUInt32BE, serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { ValidatorStatusHistory, ValidatorStatusInSlot } from '@aztec/stdlib/validators';

export class SentinelStore {
  public static readonly SCHEMA_VERSION = 1;

  private readonly map: AztecAsyncMap<`0x${string}`, Buffer>;

  constructor(
    private store: AztecAsyncKVStore,
    private config: { historyLength: number },
  ) {
    this.map = store.openMap('sentinel-validator-status');
  }

  public getHistoryLength() {
    return this.config.historyLength;
  }

  public async updateValidators(slot: bigint, statuses: Record<`0x${string}`, ValidatorStatusInSlot | undefined>) {
    await this.store.transactionAsync(async () => {
      for (const [who, status] of Object.entries(statuses)) {
        if (status) {
          await this.pushValidatorStatusForSlot(who as `0x${string}`, slot, status);
        }
      }
    });
  }

  private async pushValidatorStatusForSlot(
    who: `0x${string}`,
    slot: bigint,
    status: 'block-mined' | 'block-proposed' | 'block-missed' | 'attestation-sent' | 'attestation-missed',
  ) {
    const currentHistory = (await this.getHistory(who)) ?? [];
    const newHistory = [...currentHistory, { slot, status }].slice(-this.config.historyLength);
    await this.map.set(who, this.serializeHistory(newHistory));
  }

  public async getHistories(): Promise<Record<`0x${string}`, ValidatorStatusHistory>> {
    const histories: Record<`0x${string}`, ValidatorStatusHistory> = {};
    for await (const [address, history] of this.map.entriesAsync()) {
      histories[address] = this.deserializeHistory(history);
    }
    return histories;
  }

  private async getHistory(address: `0x${string}`): Promise<ValidatorStatusHistory | undefined> {
    const data = await this.map.getAsync(address);
    return data && this.deserializeHistory(data);
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
