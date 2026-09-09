import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { createLogger } from '@aztec/aztec.js/log';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { BlockTag } from '@aztec/stdlib/block';
import type { AztecNode, AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import type { TelemetryClient } from '@aztec/telemetry-client';
import type { EmbeddedWallet } from '@aztec/wallets/embedded';

import type { BotLifecycle } from './base_bot.js';
import { type BotConfig, applyInboxModeDefaults, assertValidInboxConfig } from './config.js';
import { BotFactory } from './factory.js';
import type { BotStore } from './store/index.js';

/**
 * Bot that exercises the Fast Inbox: it produces atomic batches of L1→L2 messages on its own clock and follows
 * each message through to consumption on L2, checking the node's messaging API along the way.
 *
 * It drives its own scheduling rather than being ticked by `BotRunner`'s interval, because production and
 * consumption run on two independent clocks and a tick does not map to a single L2 transaction.
 *
 * Production and consumption are not implemented yet: this class currently only starts and stops cleanly.
 */
export class InboxBot implements BotLifecycle {
  protected log = createLogger('bot:inbox');

  private running = false;

  protected constructor(
    public readonly node: AztecNode,
    public readonly wallet: EmbeddedWallet,
    public readonly defaultAccountAddress: AztecAddress,
    private readonly contract: TestContract,
    private readonly l1Client: ExtendedViemWalletClient,
    private readonly inboxAddress: EthAddress,
    private readonly rollupVersion: bigint,
    private readonly store: BotStore,
    private readonly telemetry: TelemetryClient,
    public config: BotConfig,
    private readonly syncChainTip?: BlockTag,
  ) {}

  /**
   * Sets up the bot's account, L1 client and TestContract. Unlike the other bots this also takes the telemetry
   * client, since the inbox bot owns its own instruments rather than reporting through the runner.
   */
  static async create(
    config: BotConfig,
    wallet: EmbeddedWallet,
    aztecNode: AztecNode,
    aztecNodeAdmin: AztecNodeAdmin | undefined,
    store: BotStore,
    telemetry: TelemetryClient,
    syncChainTip?: BlockTag,
  ): Promise<InboxBot> {
    const effectiveConfig = applyInboxModeDefaults(config);
    assertValidInboxConfig(effectiveConfig);

    const factory = new BotFactory(effectiveConfig, wallet, store, aztecNode, aztecNodeAdmin, syncChainTip);
    const { defaultAccountAddress, contract, l1Client, rollupVersion } = await factory.setupCrossChain({
      seedMessages: false,
    });
    const { l1ContractAddresses } = await aztecNode.getNodeInfo();
    const inboxAddress = EthAddress.fromString(l1ContractAddresses.inboxAddress.toString());

    return new InboxBot(
      aztecNode,
      wallet,
      defaultAccountAddress,
      contract,
      l1Client,
      inboxAddress,
      rollupVersion,
      store,
      telemetry,
      effectiveConfig,
      syncChainTip,
    );
  }

  public start(): Promise<void> {
    if (this.running) {
      return Promise.resolve();
    }
    this.running = true;
    this.log.info(`Started inbox bot`, {
      messagesPerBatch: this.config.inboxMessagesPerBatch,
      consumeMode: this.config.inboxConsumeMode,
      saturationIntervalSeconds: this.config.inboxSaturationIntervalSeconds,
      outstandingMessageCap: this.config.l1ToL2SeedCount,
    });
    return Promise.resolve();
  }

  public stop(): Promise<void> {
    if (!this.running) {
      return Promise.resolve();
    }
    this.running = false;
    this.log.info(`Stopped inbox bot`);
    return Promise.resolve();
  }

  /** Triggers a single production step. Production is not implemented yet, so this is currently a no-op. */
  public run(): Promise<unknown> {
    this.log.debug(`Inbox bot production step requested`, { running: this.running });
    return Promise.resolve(undefined);
  }

  public isHealthy(): boolean {
    return this.running;
  }
}
