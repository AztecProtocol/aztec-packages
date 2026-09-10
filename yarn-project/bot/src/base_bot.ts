import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { SendInteractionOptions } from '@aztec/aztec.js/contracts';
import { createLogger } from '@aztec/aztec.js/log';
import { waitForTx } from '@aztec/aztec.js/node';
import { TxStatus } from '@aztec/aztec.js/tx';
import type { TxHash, TxReceipt } from '@aztec/aztec.js/tx';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { EmbeddedWallet } from '@aztec/wallets/embedded';

import type { BotConfig } from './config.js';
import { getSendInteractionOptions } from './utils.js';

/** The surface `BotRunner` needs from every bot, whichever mode it is running. */
export interface RunnableBot {
  /** Address of the account the bot sends its transactions from. */
  readonly defaultAccountAddress: AztecAddress;
  /** Performs a single unit of bot work. */
  run(): Promise<unknown>;
}

/**
 * A bot that drives its own clock instead of being ticked by the runner's interval. When a bot implements this,
 * `BotRunner` delegates start/stop to it and does not start its own `RunningPromise`.
 */
export interface BotLifecycle extends RunnableBot {
  /** Starts the bot's own scheduling. */
  start(): Promise<void>;
  /** Stops the bot, persisting any recoverable work before returning. */
  stop(): Promise<void>;
  /** Whether the bot considers itself healthy. */
  isHealthy(): boolean;
}

/** Returns whether the bot drives its own clock and should not be ticked by the runner. */
export function isBotLifecycle(bot: RunnableBot): bot is BotLifecycle {
  const candidate = bot as Partial<BotLifecycle>;
  return (
    typeof candidate.start === 'function' &&
    typeof candidate.stop === 'function' &&
    typeof candidate.isHealthy === 'function'
  );
}

export abstract class BaseBot implements RunnableBot {
  protected log = createLogger('bot');

  protected attempts: number = 0;
  protected successes: number = 0;

  protected constructor(
    public readonly node: AztecNode,
    public readonly wallet: EmbeddedWallet,
    public readonly defaultAccountAddress: AztecAddress,
    public config: BotConfig,
  ) {}

  public async run(): Promise<TxReceipt | TxHash> {
    this.attempts++;
    const { followChain, txMinedWaitSeconds } = this.config;
    const logCtx = { runId: Date.now() * 1000 + Math.floor(Math.random() * 1000), followChain, txMinedWaitSeconds };

    this.log.verbose(`Creating tx`, logCtx);
    const txHash = await this.createAndSendTx(logCtx);

    if (followChain === 'NONE') {
      this.log.info(`Transaction ${txHash.toString()} sent, not waiting for it to be mined`);
      return txHash;
    }

    const waitForStatus = TxStatus[followChain];
    this.log.verbose(`Awaiting tx ${txHash.toString()} to be on the ${followChain} chain`, logCtx);
    const receipt = await waitForTx(this.node, txHash, { timeout: txMinedWaitSeconds, waitForStatus });
    this.successes++;
    this.log.info(
      `Tx #${this.attempts} ${receipt.txHash} successfully mined in block ${receipt.blockNumber} (stats: ${this.successes}/${this.attempts} success)`,
      logCtx,
    );

    await this.onTxMined(receipt, logCtx);

    return receipt;
  }

  protected abstract createAndSendTx(logCtx: object): Promise<TxHash>;

  protected onTxMined(_receipt: TxReceipt, _logCtx: object): Promise<void> {
    // no-op
    return Promise.resolve();
  }

  protected getSendMethodOpts(): SendInteractionOptions {
    return getSendInteractionOptions(this.wallet, this.config, this.defaultAccountAddress);
  }
}
