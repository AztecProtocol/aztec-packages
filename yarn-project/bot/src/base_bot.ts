import {
  AuthWitness,
  FeeJuicePaymentMethod,
  type SendMethodOptions,
  SentTx,
  TxHash,
  TxReceipt,
  type Wallet,
  createLogger,
  waitForProven,
} from '@aztec/aztec.js';
import { Gas } from '@aztec/stdlib/gas';
import type { PXE } from '@aztec/stdlib/interfaces/client';

import type { BotConfig } from './config.js';

export abstract class BaseBot {
  protected log = createLogger('bot');

  protected attempts: number = 0;
  protected successes: number = 0;

  protected constructor(public readonly pxe: PXE, public readonly wallet: Wallet, public config: BotConfig) {}

  public async run(): Promise<TxReceipt | TxHash> {
    this.attempts++;
    const logCtx = { runId: Date.now() * 1000 + Math.floor(Math.random() * 1000) };
    const { followChain, txMinedWaitSeconds } = this.config;

    this.log.verbose(`Creating tx`, logCtx);
    const tx = await this.createAndSendTx(logCtx);

    const txHash = await tx.getTxHash();

    if (followChain === 'NONE') {
      this.log.info(`Transaction ${txHash} sent, not waiting for it to be mined`);
      return txHash;
    }

    this.log.verbose(
      `Awaiting tx ${txHash} to be on the ${followChain} chain (timeout ${txMinedWaitSeconds}s)`,
      logCtx,
    );
    const receipt = await tx.wait({
      timeout: txMinedWaitSeconds,
    });
    if (followChain === 'PROVEN') {
      await waitForProven(this.pxe.node, receipt, { provenTimeout: txMinedWaitSeconds });
    }
    this.successes++;
    this.log.info(
      `Tx #${this.attempts} ${receipt.txHash} successfully mined in block ${receipt.blockNumber} (stats: ${this.successes}/${this.attempts} success)`,
      logCtx,
    );
    return receipt;
  }

  protected abstract createAndSendTx(logCtx: object): Promise<SentTx>;

  protected getSendMethodOpts(...authWitnesses: AuthWitness[]): SendMethodOptions {
    const sender = this.wallet.getAddress();
    const { l2GasLimit, daGasLimit, skipPublicSimulation } = this.config;
    const paymentMethod = new FeeJuicePaymentMethod(sender);

    let gasSettings, estimateGas;
    if (l2GasLimit !== undefined && l2GasLimit > 0 && daGasLimit !== undefined && daGasLimit > 0) {
      gasSettings = { gasLimits: Gas.from({ l2Gas: l2GasLimit, daGas: daGasLimit }) };
      estimateGas = false;
      this.log.verbose(`Using gas limits ${l2GasLimit} L2 gas ${daGasLimit} DA gas`);
    } else {
      estimateGas = true;
      this.log.verbose(`Estimating gas for transaction`);
    }
    const baseFeePadding = 2; // Send 3x the current base fee
    this.log.verbose(skipPublicSimulation ? `Skipping public simulation` : `Simulating public transfers`);
    return { fee: { estimateGas, paymentMethod, gasSettings, baseFeePadding }, skipPublicSimulation, authWitnesses };
  }
}
