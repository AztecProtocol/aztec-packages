import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall, ContractFunctionInteraction, type SendInteractionOptions } from '@aztec/aztec.js/contracts';
import { createLogger } from '@aztec/aztec.js/log';
import { waitForTx } from '@aztec/aztec.js/node';
import { TxHash, TxReceipt, TxStatus } from '@aztec/aztec.js/tx';
import { Gas } from '@aztec/stdlib/gas';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { EmbeddedWallet } from '@aztec/wallets/embedded';

import type { BotConfig } from './config.js';

export abstract class BaseBot {
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

  protected async getSendMethodOpts(
    interaction: ContractFunctionInteraction | BatchCall,
  ): Promise<SendInteractionOptions> {
    const { l2GasLimit, daGasLimit, minFeePadding } = this.config;

    this.wallet.setMinFeePadding(minFeePadding);

    let gasSettings;
    if (l2GasLimit !== undefined && l2GasLimit > 0 && daGasLimit !== undefined && daGasLimit > 0) {
      gasSettings = { gasLimits: Gas.from({ l2Gas: l2GasLimit, daGas: daGasLimit }) };
      this.log.verbose(`Using gas limits ${l2GasLimit} L2 gas ${daGasLimit} DA gas`);
    } else {
      this.log.verbose(`Estimating gas for transaction`);
      ({ estimatedGas: gasSettings } = await interaction.simulate({
        fee: { estimateGas: true },
        from: this.defaultAccountAddress,
      }));
    }
    return {
      from: this.defaultAccountAddress,
      fee: { gasSettings },
    };
  }
}
