import type { AztecNode, AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import type { EmbeddedWallet } from '@aztec/wallets/embedded';

import { type BotConfig, getBotDefaultConfig } from './config.js';
import { CrossChainBot } from './cross_chain_bot.js';
import type { BotStore } from './store/index.js';

describe('CrossChainBot', () => {
  it('rejects followChain=NONE', async () => {
    const config: BotConfig = { ...getBotDefaultConfig(), botMode: 'crosschain', followChain: 'NONE' };
    await expect(
      CrossChainBot.create(config, {} as EmbeddedWallet, {} as AztecNode, {} as AztecNodeAdmin, {} as BotStore),
    ).rejects.toThrow(/followChain/);
  });
});
