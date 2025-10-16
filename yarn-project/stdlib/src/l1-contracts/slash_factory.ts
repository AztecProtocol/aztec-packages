import { type L1TxRequest, type ViemClient, tryExtractEvent } from '@aztec/ethereum';
import { maxBigint } from '@aztec/foundation/bigint';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { SlashFactoryAbi } from '@aztec/l1-artifacts/SlashFactoryAbi';

import { type GetContractReturnType, type Hex, type Log, encodeFunctionData, getContract } from 'viem';

import type { L1RollupConstants } from '../epoch-helpers/index.js';
import {
  OffenseToBigInt,
  type SlashPayload,
  type ValidatorSlash,
  type ValidatorSlashOffense,
  bigIntToOffense,
} from '../slashing/index.js';

export class SlashFactoryContract {
  private readonly logger = createLogger('contracts:slash_factory');
  private readonly contract: GetContractReturnType<typeof SlashFactoryAbi, ViemClient>;

  constructor(
    public readonly client: ViemClient,
    address: Hex | EthAddress,
  ) {
    this.contract = getContract({
      address: typeof address === 'string' ? address : address.toString(),
      abi: SlashFactoryAbi,
      client,
    });
  }

  public get address() {
    return EthAddress.fromString(this.contract.address);
  }

  public buildCreatePayloadRequest(slashes: ValidatorSlash[]): L1TxRequest {
    const sorted = this.sortSlashes(slashes);

    return {
      to: this.contract.address,
      data: encodeFunctionData({
        abi: SlashFactoryAbi,
        functionName: 'createSlashPayload',
        args: [
          sorted.map(d => d.validator.toString()),
          sorted.map(d => d.amount),
          sorted.map(d => d.offenses.map(packValidatorSlashOffense)),
        ],
      }),
    };
  }

  /** Tries to extract a SlashPayloadCreated event from the given logs. */
  public tryExtractSlashPayloadCreatedEvent(logs: Log[]) {
    return tryExtractEvent(logs, this.address.toString(), SlashFactoryAbi, 'SlashPayloadCreated');
  }

  public async getSlashPayloadCreatedEvents(): Promise<SlashPayload[]> {
    const events = await this.contract.getEvents.SlashPayloadCreated();
    return Promise.all(
      events.map(async event => {
        const { validators, amounts, offenses } = event.args;
        const slashes: ValidatorSlash[] = validators!.map((validator, i) => ({
          validator: EthAddress.fromString(validator),
          amount: amounts![i],
          offenses: offenses![i].map(unpackValidatorSlashOffense),
        }));

        const block = await this.client.getBlock({ blockNumber: event.blockNumber, includeTransactions: false });
        return { address: EthAddress.fromString(event.args.payloadAddress!), slashes, timestamp: block.timestamp };
      }),
    );
  }

  /**
   * Searches for a slash payload in the events emitted by the contract.
   * This method cannot query for historical payload events, it queries for payloads that have not yet expired.
   * @param payloadAddress The address of the payload to search for.
   * @param constants The L1 rollup constants needed for time calculations.
   */
  public async getSlashPayloadFromEvents(
    payloadAddress: EthAddress,
    settings: {
      logsBatchSize?: number;
      slashingRoundSize: number;
      slashingPayloadLifetimeInRounds: number;
    } & Pick<L1RollupConstants, 'slotDuration' | 'ethereumSlotDuration'>,
  ): Promise<Omit<SlashPayload, 'votes'> | undefined> {
    // We query for the log where the payload was emitted walking backwards until we go past payload expiration time
    // Note that all log queries require a block range, and RPC providers cap the max range (eg quicknode is 10k blocks).
    const { slashingRoundSize, slashingPayloadLifetimeInRounds, slotDuration, ethereumSlotDuration } = settings;
    const currentBlockNumber = await this.client.getBlockNumber({ cacheTime: 0 });

    // Why the +1 below? Just for good measure. Better err on the safe side.
    const earliestBlockNumber = maxBigint(
      0n,
      currentBlockNumber -
        ((BigInt(slashingPayloadLifetimeInRounds) + 1n) * BigInt(slashingRoundSize) * BigInt(slotDuration)) /
          BigInt(ethereumSlotDuration),
    );

    this.logger.trace(
      `Starting search for slash payload ${payloadAddress} from block ${currentBlockNumber} with earliest block ${earliestBlockNumber}`,
    );
    const batchSize = BigInt(settings.logsBatchSize ?? 10000);
    let toBlock = currentBlockNumber;

    do {
      const fromBlock = maxBigint(earliestBlockNumber, toBlock - batchSize);
      this.logger.trace(`Searching for slash payload ${payloadAddress} in blocks ${fromBlock} to ${toBlock}`);
      const logs = await this.contract.getEvents.SlashPayloadCreated(
        { payloadAddress: payloadAddress.toString() },
        { fromBlock, toBlock, strict: true },
      );

      // We found the payload, return it
      if (logs.length > 0) {
        const log = logs[0];
        const { validators, amounts, offenses } = log.args;

        // Convert the data to our internal types
        const slashes: ValidatorSlash[] = validators!.map((validator, i) => ({
          validator: EthAddress.fromString(validator),
          amount: amounts![i],
          offenses: offenses![i].map(unpackValidatorSlashOffense),
        }));

        // Get the timestamp from the block
        const block = await this.client.getBlock({ blockNumber: log.blockNumber, includeTransactions: false });

        return { address: payloadAddress, slashes, timestamp: block.timestamp };
      }

      // If not found, we go back one batch
      toBlock -= batchSize;
    } while (toBlock > earliestBlockNumber);

    return undefined;
  }

  public async getAddressAndIsDeployed(
    slashes: ValidatorSlash[],
  ): Promise<{ address: EthAddress; salt: Hex; isDeployed: boolean }> {
    const sortedSlashes = this.sortSlashes(slashes);
    const [address, salt, isDeployed] = await this.contract.read.getAddressAndIsDeployed([
      sortedSlashes.map(s => s.validator.toString()),
      sortedSlashes.map(s => s.amount),
      sortedSlashes.map(s => s.offenses.map(packValidatorSlashOffense)),
    ]);
    return { address: EthAddress.fromString(address), salt, isDeployed };
  }

  private sortSlashes(slashes: ValidatorSlash[]): ValidatorSlash[] {
    const offenseSorter = (a: ValidatorSlashOffense, b: ValidatorSlashOffense) => {
      return a.epochOrSlot === b.epochOrSlot ? a.offenseType - b.offenseType : Number(a.epochOrSlot - b.epochOrSlot);
    };
    return [...slashes]
      .map(slash => ({ ...slash, offenses: [...slash.offenses].sort(offenseSorter) }))
      .sort((a, b) => a.validator.toString().localeCompare(b.validator.toString()));
  }
}

export function packValidatorSlashOffense(offense: ValidatorSlashOffense): bigint {
  const offenseId = OffenseToBigInt[offense.offenseType];
  if (offenseId > (1 << 8) - 1) {
    throw new Error(`Offense type ${offense.offenseType} cannot be packed into 8 bits`);
  }
  return (offenseId << 120n) + offense.epochOrSlot;
}

export function unpackValidatorSlashOffense(packed: bigint): ValidatorSlashOffense {
  const offenseId = (packed >> 120n) & 0xffn;
  const epochOrSlot = packed & ((1n << 120n) - 1n);
  const offenseType = bigIntToOffense(offenseId);
  return { epochOrSlot, offenseType };
}
