import { type AztecAddress, BatchCall, SentTx, type Wallet } from '@aztec/aztec.js';
import { times } from '@aztec/foundation/collection';
import type { PrivateTokenContract } from '@aztec/noir-contracts.js/PrivateToken';
import type { TokenContract } from '@aztec/noir-contracts.js/Token';
import type { AztecNode, AztecNodeAdmin, PXE } from '@aztec/stdlib/interfaces/client';

import { BaseBot } from './base_bot.js';
import type { BotConfig } from './config.js';
import { BotFactory } from './factory.js';
import { getBalances, getPrivateBalance, isStandardTokenContract } from './utils.js';

const TRANSFER_AMOUNT = 1;

export class Bot extends BaseBot {
  protected constructor(
    node: AztecNode,
    wallet: Wallet,
    defaultAccountAddress: AztecAddress,
    public readonly token: TokenContract | PrivateTokenContract,
    public readonly recipient: AztecAddress,
    config: BotConfig,
  ) {
    super(node, wallet, defaultAccountAddress, config);
  }

  static async create(
    config: BotConfig,
    dependencies: { pxe?: PXE; node?: AztecNode; nodeAdmin?: AztecNodeAdmin },
  ): Promise<Bot> {
    const { node, wallet, defaultAccountAddress, token, recipient } = await new BotFactory(
      config,
      dependencies,
    ).setup();
    return new Bot(node, wallet, defaultAccountAddress, token, recipient, config);
  }

  public updateConfig(config: Partial<BotConfig>) {
    this.log.info(`Updating bot config ${Object.keys(config).join(', ')}`);
    this.config = { ...this.config, ...config };
  }

  protected async createAndSendTx(logCtx: object): Promise<SentTx> {
    const { privateTransfersPerTx, publicTransfersPerTx, feePaymentMethod } = this.config;
    const { token, recipient, wallet } = this;

    this.log.verbose(
      `Preparing tx with ${feePaymentMethod} fee with ${privateTransfersPerTx} private and ${publicTransfersPerTx} public transfers`,
      logCtx,
    );

    const calls = isStandardTokenContract(token)
      ? [
          times(privateTransfersPerTx, () => token.methods.transfer(recipient, TRANSFER_AMOUNT)),
          times(publicTransfersPerTx, () =>
            token.methods.transfer_in_public(this.defaultAccountAddress, recipient, TRANSFER_AMOUNT, 0),
          ),
        ].flat()
      : times(privateTransfersPerTx, () =>
          token.methods.transfer(TRANSFER_AMOUNT, this.defaultAccountAddress, recipient),
        );

    const opts = this.getSendMethodOpts();
    const batch = new BatchCall(wallet, calls);

    this.log.verbose(`Simulating transaction with ${calls.length}`, logCtx);
    await batch.simulate({ from: this.defaultAccountAddress });

    this.log.verbose(`Proving transaction`, logCtx);
    const provenTx = await batch.prove(opts);
    return provenTx.send();
  }

  public async getBalances() {
    if (isStandardTokenContract(this.token)) {
      return {
        sender: await getBalances(this.token, this.defaultAccountAddress),
        recipient: await getBalances(this.token, this.recipient, this.defaultAccountAddress),
      };
    } else {
      return {
        sender: {
          privateBalance: await getPrivateBalance(this.token, this.defaultAccountAddress),
          publicBalance: 0n,
        },
        recipient: {
          privateBalance: await getPrivateBalance(this.token, this.recipient, this.defaultAccountAddress),
          publicBalance: 0n,
        },
      };
    }
  }
}
