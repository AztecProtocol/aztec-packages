import { type PXE, createDebugLogger } from '@aztec/aztec.js';
import { RunningPromise } from '@aztec/foundation/running-promise';

import { Bot } from './bot.js';
import { type BotConfig } from './config.js';

export class BotRunner {
  private log = createDebugLogger('aztec:bot');
  private bot?: Promise<Bot>;
  private pxe?: PXE;
  private runningPromise: RunningPromise;

  public constructor(private config: BotConfig, dependencies: { pxe?: PXE } = {}) {
    this.pxe = dependencies.pxe;
    this.runningPromise = new RunningPromise(() => this.#safeRun(), config.txIntervalSeconds * 1000);
  }

  /** Initializes the bot if needed. Blocks until the bot setup is finished. */
  public async setup() {
    if (!this.bot) {
      this.log.verbose(`Setting up bot`);
      await this.#createBot();
      this.log.info(`Bot set up completed`);
    }
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
    } catch (err) {
      this.log.error(`Error running bot: ${err}`);
      throw err;
    }
  }

  /** Returns the current configuration for the bot. */
  public getConfig() {
    return this.config;
  }

  async #createBot() {
    try {
      this.bot = Bot.create(this.config, { pxe: this.pxe });
      await this.bot;
    } catch (err) {
      this.log.error(`Error setting up bot: ${err}`);
      throw err;
    }
  }

  async #safeRun() {
    try {
      await this.run();
    } catch (err) {
      // Already logged in run()
    }
  }
}
