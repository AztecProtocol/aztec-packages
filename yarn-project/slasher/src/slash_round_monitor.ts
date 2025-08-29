import { createLogger } from '@aztec/foundation/log';
import type { DateProvider } from '@aztec/foundation/timer';
import type { Prettify } from '@aztec/foundation/types';
import { type L1RollupConstants, getSlotAtTimestamp } from '@aztec/stdlib/epoch-helpers';
import { getRoundForSlot } from '@aztec/stdlib/slashing';

export type SlashRoundMonitorSettings = Prettify<
  Pick<L1RollupConstants, 'epochDuration' | 'l1GenesisTime' | 'slotDuration'> & { slashingRoundSize: number }
>;

export class SlashRoundMonitor {
  private currentRound: bigint = 0n;
  private intervalId: NodeJS.Timeout | undefined = undefined;
  private handler: ((round: bigint) => Promise<void>) | undefined = undefined;

  constructor(
    private settings: SlashRoundMonitorSettings,
    private dateProvider: DateProvider,
    private log = createLogger('slasher:round-monitor'),
  ) {}

  public start() {
    // Check for round changes
    this.currentRound = this.getCurrentRound().round;
    this.intervalId = setInterval(() => {
      const round = this.getCurrentRound().round;
      if (round !== this.currentRound) {
        this.currentRound = round;
        if (this.handler) {
          void this.handler(round).catch(err => this.log.error('Error handling new round', err));
        }
      }
    }, 500);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  public listenToNewRound(handler: (round: bigint) => Promise<void>): () => void {
    this.handler = handler;
    return () => {
      this.handler = undefined;
    };
  }

  /** Returns the slashing round number and the voting slot within the round based on the L2 chain slot */
  public getRoundForSlot(slotNumber: bigint): { round: bigint; votingSlot: bigint } {
    return getRoundForSlot(slotNumber, this.settings);
  }

  /** Returns the current slashing round and voting slot within the round */
  public getCurrentRound(): { round: bigint; votingSlot: bigint } {
    const now = this.dateProvider.nowInSeconds();
    const currentSlot = getSlotAtTimestamp(BigInt(now), this.settings);
    return this.getRoundForSlot(currentSlot);
  }
}
