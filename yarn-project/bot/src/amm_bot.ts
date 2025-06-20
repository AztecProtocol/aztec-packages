import { AztecAddress, Fr, SentTx, TxReceipt, type Wallet } from '@aztec/aztec.js';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import type { AMMContract } from '@aztec/noir-contracts.js/AMM';
import type { TokenContract } from '@aztec/noir-contracts.js/Token';
import type { AztecNode, AztecNodeAdmin, PXE } from '@aztec/stdlib/interfaces/client';

import { BaseBot } from './base_bot.js';
import type { BotConfig } from './config.js';
import { BotFactory } from './factory.js';

const TRANSFER_BASE_AMOUNT = 1_000;
const TRANSFER_VARIANCE = 200;

type Balances = { token0: bigint; token1: bigint };

export class AmmBot extends BaseBot {
  protected constructor(
    pxe: PXE,
    wallet: Wallet,
    public readonly amm: AMMContract,
    public readonly token0: TokenContract,
    public readonly token1: TokenContract,
    config: BotConfig,
  ) {
    super(pxe, wallet, config);
  }

  static async create(
    config: BotConfig,
    dependencies: { pxe?: PXE; node?: AztecNode; nodeAdmin?: AztecNodeAdmin },
  ): Promise<AmmBot> {
    const { pxe, wallet, token0, token1, amm } = await new BotFactory(config, dependencies).setupAmm();
    return new AmmBot(pxe, wallet, amm, token0, token1, config);
  }

  protected async createAndSendTx(logCtx: object): Promise<SentTx> {
    const { feePaymentMethod } = this.config;
    const { wallet, amm, token0, token1 } = this;

    const balances = this.getBalances();
    this.log.info(`Preparing tx with ${feePaymentMethod} fee to swap tokens. Balances: ${jsonStringify(balances)}`, {
      ...logCtx,
      balances,
    });

    // 1000 ± 200
    const amountIn = Math.floor(TRANSFER_BASE_AMOUNT + (Math.random() - 0.5) * TRANSFER_VARIANCE);
    const authwitNonce = Fr.random();

    const [tokenIn, tokenOut] = Math.random() < 0.5 ? [token0, token1] : [token1, token0];

    const swapAuthwit = await wallet.createAuthWit({
      caller: amm.address,
      action: tokenIn.methods.transfer_to_public(wallet.getAddress(), amm.address, amountIn, authwitNonce),
    });

    const amountOutMin = await amm.methods
      .get_amount_out_for_exact_in(
        await tokenIn.methods.balance_of_public(amm.address).simulate(),
        await tokenOut.methods.balance_of_public(amm.address).simulate(),
        amountIn,
      )
      .simulate();

    const swapExactTokensInteraction = amm.methods.swap_exact_tokens_for_tokens(
      tokenIn.address,
      tokenOut.address,
      amountIn,
      amountOutMin,
      authwitNonce,
    );

    const opts = this.getSendMethodOpts(swapAuthwit);

    this.log.verbose(`Proving transaction`, logCtx);
    const tx = await swapExactTokensInteraction.prove(opts);

    this.log.info(`Tx. Balances: ${jsonStringify(balances)}`, { ...logCtx, balances });

    return tx.send();
  }

  protected override async onTxMined(receipt: TxReceipt, logCtx: object): Promise<void> {
    const balances = await this.getBalances();
    this.log.info(`Balances after swap in tx ${receipt.txHash}: ${jsonStringify(balances)}`, { ...logCtx, balances });
  }

  public getAmmBalances(): Promise<Balances> {
    return this.getPublicBalanceFor(this.amm.address);
  }

  public async getBalances(): Promise<{ senderPublic: Balances; senderPrivate: Balances; amm: Balances }> {
    return {
      senderPublic: await this.getPublicBalanceFor(this.wallet.getAddress()),
      senderPrivate: await this.getPrivateBalanceFor(this.wallet.getAddress()),
      amm: await this.getPublicBalanceFor(this.amm.address),
    };
  }

  private async getPublicBalanceFor(address: AztecAddress): Promise<Balances> {
    return {
      token0: await this.token0.methods.balance_of_public(address).simulate(),
      token1: await this.token1.methods.balance_of_public(address).simulate(),
    };
  }
  private async getPrivateBalanceFor(address: AztecAddress): Promise<Balances> {
    return {
      token0: await this.token0.methods.balance_of_private(address).simulate(),
      token1: await this.token1.methods.balance_of_private(address).simulate(),
    };
  }
}
