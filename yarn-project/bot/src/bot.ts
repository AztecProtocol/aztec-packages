import {
  type AztecAddress,
  BatchCall,
  FeeJuicePaymentMethod,
  NoFeePaymentMethod,
  type SendMethodOptions,
  type Wallet,
  createDebugLogger,
} from '@aztec/aztec.js';
import { type AztecNode, type FunctionCall, type PXE } from '@aztec/circuit-types';
import { Gas } from '@aztec/circuits.js';
import { times } from '@aztec/foundation/collection';
import { type EasyPrivateTokenContract, type TokenContract } from '@aztec/noir-contracts.js';

import { type BotConfig } from './config.js';
import { BotFactory } from './factory.js';
import { getBalances, getPrivateBalance, isStandardTokenContract } from './utils.js';

const TRANSFER_AMOUNT = 1;

export class Bot {
  private log = createDebugLogger('aztec:bot');

  private attempts: number = 0;
  private successes: number = 0;

  protected constructor(
    public readonly wallet: Wallet,
    public readonly token: TokenContract | EasyPrivateTokenContract,
    public readonly recipient: AztecAddress,
    public config: BotConfig,
  ) {}

  static async create(config: BotConfig, dependencies: { pxe?: PXE; node?: AztecNode } = {}): Promise<Bot> {
    const { wallet, token, recipient } = await new BotFactory(config, dependencies).setup();
    return new Bot(wallet, token, recipient, config);
  }

  public updateConfig(config: Partial<BotConfig>) {
    this.log.info(`Updating bot config ${Object.keys(config).join(', ')}`);
    this.config = { ...this.config, ...config };
  }

  public async run() {
    this.attempts++;
    const logCtx = { runId: Date.now() * 1000 + Math.floor(Math.random() * 1000) };
    const { privateTransfersPerTx, publicTransfersPerTx, feePaymentMethod, followChain, txMinedWaitSeconds } =
      this.config;
    const { token, recipient, wallet } = this;
    const sender = wallet.getAddress();

    this.log.verbose(
      `Preparing tx with ${feePaymentMethod} fee with ${privateTransfersPerTx} private and ${publicTransfersPerTx} public transfers`,
      logCtx,
    );

    const calls: FunctionCall[] = [];
    if (isStandardTokenContract(token)) {
      calls.push(
        ...(await Promise.all(
          times(privateTransfersPerTx, () => token.methods.transfer(recipient, TRANSFER_AMOUNT).request()),
        )),
      );
      calls.push(
        ...(await Promise.all(
          times(publicTransfersPerTx, () =>
            token.methods.transfer_in_public(sender, recipient, TRANSFER_AMOUNT, 0).request(),
          ),
        )),
      );
    } else {
      calls.push(
        ...(await Promise.all(
          times(privateTransfersPerTx, () =>
            token.methods.transfer(TRANSFER_AMOUNT, sender, recipient, sender).request(),
          ),
        )),
      );
    }

    const opts = this.getSendMethodOpts();
    const batch = new BatchCall(wallet, calls);

    this.log.verbose(`Simulating transaction with ${calls.length}`, logCtx);
    await batch.simulate();

    this.log.verbose(`Proving transaction`, logCtx);
    const provenTx = await batch.prove(opts);

    this.log.verbose(`Sending tx`, logCtx);
    const tx = provenTx.send();

    const txHash = await tx.getTxHash();

    if (followChain === 'NONE') {
      this.log.info(`Transaction ${txHash} sent, not waiting for it to be mined`);
      return;
    }

    this.log.verbose(
      `Awaiting tx ${txHash} to be on the ${followChain} chain (timeout ${txMinedWaitSeconds}s)`,
      logCtx,
    );
    const receipt = await tx.wait({
      timeout: txMinedWaitSeconds,
      provenTimeout: txMinedWaitSeconds,
      proven: followChain === 'PROVEN',
    });
    this.log.info(
      `Tx #${this.attempts} ${receipt.txHash} successfully mined in block ${receipt.blockNumber} (stats: ${this.successes}/${this.attempts} success)`,
      logCtx,
    );
    this.successes++;
  }

  public async getBalances() {
    if (isStandardTokenContract(this.token)) {
      return {
        sender: await getBalances(this.token, this.wallet.getAddress()),
        recipient: await getBalances(this.token, this.recipient),
      };
    } else {
      return {
        sender: {
          privateBalance: await getPrivateBalance(this.token, this.wallet.getAddress()),
          publicBalance: 0n,
        },
        recipient: {
          privateBalance: await getPrivateBalance(this.token, this.recipient),
          publicBalance: 0n,
        },
      };
    }
  }

  private getSendMethodOpts(): SendMethodOptions {
    const sender = this.wallet.getAddress();
    const { feePaymentMethod, l2GasLimit, daGasLimit, skipPublicSimulation } = this.config;
    const paymentMethod =
      feePaymentMethod === 'fee_juice' ? new FeeJuicePaymentMethod(sender) : new NoFeePaymentMethod();

    let gasSettings, estimateGas;
    if (l2GasLimit !== undefined && l2GasLimit > 0 && daGasLimit !== undefined && daGasLimit > 0) {
      gasSettings = { gasLimits: Gas.from({ l2Gas: l2GasLimit, daGas: daGasLimit }) };
      estimateGas = false;
      this.log.verbose(`Using gas limits ${l2GasLimit} L2 gas ${daGasLimit} DA gas`);
    } else {
      estimateGas = true;
      this.log.verbose(`Estimating gas for transaction`);
    }
    this.log.verbose(skipPublicSimulation ? `Skipping public simulation` : `Simulating public transfers`);
    return { fee: { estimateGas, paymentMethod, gasSettings }, skipPublicSimulation };
  }
}
