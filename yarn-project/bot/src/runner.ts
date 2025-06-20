import { type AztecNode, type PXE, createAztecNodeClient, createLogger } from '@aztec/aztec.js';
import { omit } from '@aztec/foundation/collection';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { type AztecNodeAdmin, createAztecNodeAdminClient } from '@aztec/stdlib/interfaces/client';
import { type TelemetryClient, type Traceable, type Tracer, makeTracedFetch, trackSpan } from '@aztec/telemetry-client';

import { AmmBot } from './amm_bot.js';
import type { BaseBot } from './base_bot.js';
import { Bot } from './bot.js';
import { type BotConfig, getVersions } from './config.js';
import type { BotInfo, BotRunnerApi } from './interface.js';

export class BotRunner implements BotRunnerApi, Traceable {
  private log = createLogger('bot');
  private bot?: Promise<BaseBot>;
  private pxe?: PXE;
  private node: AztecNode;
  private nodeAdmin?: AztecNodeAdmin;
  private runningPromise: RunningPromise;
  private consecutiveErrors = 0;
  private healthy = true;

  public readonly tracer: Tracer;

  public constructor(
    private config: BotConfig,
    dependencies: { pxe?: PXE; node?: AztecNode; nodeAdmin?: AztecNodeAdmin; telemetry: TelemetryClient },
  ) {
    this.tracer = dependencies.telemetry.getTracer('Bot');
    this.pxe = dependencies.pxe;
    if (!dependencies.node && !config.nodeUrl) {
      throw new Error(`Missing node URL in config or dependencies`);
    }
    const versions = getVersions();
    const fetch = makeTracedFetch([1, 2, 3], true);
    this.node = dependencies.node ?? createAztecNodeClient(config.nodeUrl!, versions, fetch);
    this.nodeAdmin =
      dependencies.nodeAdmin ??
      (config.nodeAdminUrl ? createAztecNodeAdminClient(config.nodeAdminUrl, versions, fetch) : undefined);
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
    if (!this.runningPromise.isRunning()) {
      this.log.info(`Starting bot with interval of ${this.config.txIntervalSeconds}s`);
      this.runningPromise.start();
    }
  }

  /**
   * Stops sending txs. Returns once all ongoing txs are finished.
   */
  public async stop() {
    if (this.runningPromise.isRunning()) {
      this.log.verbose(`Stopping bot`);
      await this.runningPromise.stop();
    }
    this.log.info(`Stopped bot`);
  }

  public isHealthy() {
    return this.runningPromise.isRunning() && this.healthy;
  }

  /** Returns whether the bot is running. */
  public isRunning() {
    return this.runningPromise.isRunning();
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
   * Blocks until the run is finished.
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
    const botAddress = await this.bot.then(b => b.wallet.getAddress());
    return { botAddress };
  }

  async #createBot() {
    try {
      this.bot = this.config.ammTxs
        ? AmmBot.create(this.config, { pxe: this.pxe, node: this.node, nodeAdmin: this.nodeAdmin })
        : Bot.create(this.config, { pxe: this.pxe, node: this.node, nodeAdmin: this.nodeAdmin });
      await this.bot;
    } catch (err) {
      this.log.error(`Error setting up bot: ${err}`);
      throw err;
    }
  }

  @trackSpan('Bot.work')
  async #work() {
    if (this.config.maxPendingTxs > 0) {
      const pendingTxCount = await this.node.getPendingTxCount();
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
