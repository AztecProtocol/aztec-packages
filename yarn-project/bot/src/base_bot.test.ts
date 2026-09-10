import { AmmBot } from './amm_bot.js';
import { type RunnableBot, isBotLifecycle } from './base_bot.js';
import { Bot } from './bot.js';
import { CrossChainBot } from './cross_chain_bot.js';
import { InboxBot } from './inbox_bot.js';

describe('isBotLifecycle', () => {
  const asBot = (prototype: object): RunnableBot => Object.create(prototype) as RunnableBot;

  it('is false for the bots the runner ticks on its own interval', () => {
    for (const prototype of [Bot.prototype, AmmBot.prototype, CrossChainBot.prototype]) {
      expect(isBotLifecycle(asBot(prototype))).toBe(false);
    }
  });

  it('is true for the inbox bot', () => {
    expect(isBotLifecycle(asBot(InboxBot.prototype))).toBe(true);
  });
});
