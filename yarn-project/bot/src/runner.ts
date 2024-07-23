import { createDebugLogger } from '@aztec/aztec.js';

import { Bot } from './bot.js';
import { type BotConfig } from './config.js';

export class BotRunner {
  private log = createDebugLogger('aztec:bot');
  private interval?: NodeJS.Timeout;
  private bot: Promise<Bot>;

  protected constructor(private config: BotConfig) {
    this.bot = Bot.create(this.config);
  }

  public async start() {
    if (!this.interval) {
      await this.bot;
      this.log.info(`Starting bot with interval of ${this.config.txIntervalSeconds}s`);
      this.interval = setInterval(() => this.run(), this.config.txIntervalSeconds * 1000);
    }
  }

  public stop() {
    if (this.interval) {
      this.log.info(`Stopping bot`);
      clearInterval(this.interval);
    }
  }

  public isRunning() {
    return !!this.interval;
  }

  public update(config: BotConfig) {
    const wasRunning = this.isRunning();
    if (wasRunning) {
      this.stop();
    }
    this.config = config;
    this.bot = Bot.create(this.config);
    if (wasRunning) {
      void this.start();
    }
  }

  public async run() {
    const bot = await this.bot;
    await bot.run();
  }
}
