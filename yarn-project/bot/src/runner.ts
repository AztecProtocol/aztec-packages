import { createLogger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { omit } from '@aztec/foundation/collection';
import { RunningPromise } from '@aztec/foundation/running-promise';
import type { BlockTag } from '@aztec/stdlib/block';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import { type TelemetryClient, type Traceable, type Tracer, trackSpan } from '@aztec/telemetry-client';
import type { EmbeddedWallet } from '@aztec/wallets/embedded';

import { AmmBot } from './amm_bot.js';
import { type BotLifecycle, type RunnableBot, isBotLifecycle } from './base_bot.js';
import { Bot } from './bot.js';
import type { BotConfig } from './config.js';
import { CrossChainBot } from './cross_chain_bot.js';
import { InboxBot } from './inbox_bot.js';
import type { BotInfo, BotRunnerApi } from './interface.js';
import { BotStore } from './store/index.js';

export class BotRunner implements BotRunnerApi, Traceable {
  private log = createLogger('bot');
  private bot?: Promise<RunnableBot>;
  private lifecycleBot?: BotLifecycle;
  private lifecycleRunning = false;
  private runningPromise: RunningPromise;
  private consecutiveErrors = 0;
  private healthy = true;

  public readonly tracer: Tracer;

  public constructor(
    private config: BotConfig,
    private readonly wallet: EmbeddedWallet,
    private readonly aztecNode: AztecNode,
    private readonly telemetry: TelemetryClient,
    private readonly aztecNodeAdmin: AztecNodeAdmin | undefined,
    private readonly store: BotStore,
    private readonly syncChainTip?: BlockTag,
  ) {
    this.tracer = telemetry.getTracer('Bot');

    this.runningPromise = new RunningPromise(() => this.#work(), this.log, config.txIntervalSeconds * 1000);
  }

  /** Initializes the bot if needed. Blocks until the bot setup is finished. */
  public async setup() {
    if (!this.bot) {
      await this.doSetup();
    }
  }

  @trackSpan('Bot.setup')
  private async doSetup() {
    this.log.verbose(`Setting up bot`);
    await this.#createBot();
    this.log.info(`Bot set up completed`);
  }

  /**
   * Initializes the bot if needed and starts sending txs at regular intervals.
   * Blocks until the bot setup is finished.
   */
  public async start() {
    await this.setup();
    if (this.lifecycleBot) {
      if (!this.lifecycleRunning) {
        this.log.info(`Starting bot on its own schedule`);
        await this.lifecycleBot.start();
        this.lifecycleRunning = true;
      }
      return;
    }
    if (!this.runningPromise.isRunning()) {
      this.log.info(`Starting bot with interval of ${this.config.txIntervalSeconds}s`);
      this.runningPromise.start();
    }
  }

  /**
   * Stops sending txs. Returns once all ongoing txs are finished. A bot that owns its schedule is stopped
   * before the store is closed, so that it can persist any recoverable work.
   */
  public async stop() {
    if (this.lifecycleBot && this.lifecycleRunning) {
      this.log.verbose(`Stopping bot`);
      await this.lifecycleBot.stop();
      this.lifecycleRunning = false;
    } else if (this.runningPromise.isRunning()) {
      this.log.verbose(`Stopping bot`);
      await this.runningPromise.stop();
    }
    await this.store.close();
    this.log.info(`Stopped bot`);
  }

  public isHealthy() {
    if (this.lifecycleBot) {
      return this.lifecycleRunning && this.healthy && this.lifecycleBot.isHealthy();
    }
    return this.runningPromise.isRunning() && this.healthy;
  }

  /** Returns whether the bot is running. */
  public isRunning() {
    return this.lifecycleBot ? this.lifecycleRunning : this.runningPromise.isRunning();
  }

  /**
   * Updates the bot config and recreates the bot. Will stop and restart the bot automatically if it was
   * running when this method was called. Blocks until the new bot is set up.
   */
  public async update(config: BotConfig) {
    this.log.verbose(`Updating bot config`);
    const wasRunning = this.isRunning();
    if (wasRunning) {
      await this.stop();
    }
    this.config = { ...this.config, ...config };
    this.runningPromise.setPollingIntervalMS(this.config.txIntervalSeconds * 1000);
    await this.#createBot();
    this.log.info(`Bot config updated`);
    if (wasRunning) {
      await this.start();
    }
  }

  /**
   * Triggers a single iteration of the bot. Requires the bot to be initialized.
   * Blocks until the run is finished. For a bot that owns its schedule this triggers a single production step
   * rather than a full tick of its pipeline.
   */
  public async run() {
    if (!this.bot) {
      this.log.error(`Trying to run with uninitialized bot`);
      throw new Error(`Bot is not initialized`);
    }

    let bot;
    try {
      bot = await this.bot;
    } catch (err) {
      this.log.error(`Error awaiting bot set up: ${err}`);
      throw err;
    }

    try {
      await bot.run();
      this.consecutiveErrors = 0;
    } catch (err) {
      this.consecutiveErrors += 1;
      this.log.error(`Error running bot consecutiveCount=${this.consecutiveErrors}: ${err}`);
      throw err;
    }
  }

  /** Returns the current configuration for the bot. */
  public getConfig() {
    const redacted = omit(this.config, 'l1Mnemonic', 'l1PrivateKey', 'senderPrivateKey');
    return Promise.resolve(redacted as BotConfig);
  }

  /** Returns the bot sender address. */
  public async getInfo(): Promise<BotInfo> {
    if (!this.bot) {
      throw new Error(`Bot is not initialized`);
    }
    const botAddress = await this.bot.then(b => b.defaultAccountAddress);
    return { botAddress };
  }

  async #createBot() {
    try {
      switch (this.config.botMode) {
        case 'crosschain':
          this.bot = CrossChainBot.create(
            this.config,
            this.wallet,
            this.aztecNode,
            this.aztecNodeAdmin,
            this.store,
            this.syncChainTip,
          );
          break;
        case 'amm':
          this.bot = AmmBot.create(
            this.config,
            this.wallet,
            this.aztecNode,
            this.aztecNodeAdmin,
            this.store,
            this.syncChainTip,
          );
          break;
        case 'transfer':
          this.bot = Bot.create(
            this.config,
            this.wallet,
            this.aztecNode,
            this.aztecNodeAdmin,
            this.store,
            this.syncChainTip,
          );
          break;
        case 'inbox':
          this.bot = InboxBot.create(
            this.config,
            this.wallet,
            this.aztecNode,
            this.aztecNodeAdmin,
            this.store,
            this.telemetry,
            this.syncChainTip,
          );
          break;
        default: {
          const _exhaustive: never = this.config.botMode;
          throw new Error(`Unsupported bot mode: [${_exhaustive}]`);
        }
      }
      const bot = await this.bot;
      this.lifecycleBot = isBotLifecycle(bot) ? bot : undefined;
    } catch (err) {
      this.log.error(`Error setting up bot: ${err}`);
      throw err;
    }
  }

  @trackSpan('Bot.work')
  async #work() {
    if (this.config.maxPendingTxs > 0) {
      const pendingTxCount = await this.aztecNode.getPendingTxCount();
      if (pendingTxCount >= this.config.maxPendingTxs) {
        this.log.verbose(`Not sending bot tx since node has ${pendingTxCount} pending txs`);
        return;
      }
    }

    try {
      await this.run();
    } catch {
      // Already logged in run()
      if (this.config.maxConsecutiveErrors > 0 && this.consecutiveErrors >= this.config.maxConsecutiveErrors) {
        this.log.error(`Too many errors bot is unhealthy`);
        this.healthy = false;
      }
    }

    if (!this.healthy && this.config.stopWhenUnhealthy) {
      this.log.fatal(`Stopping bot due to errors`);
      process.exit(1); // workaround docker not restarting the container if its unhealthy. We have to exit instead
    }
  }
}
