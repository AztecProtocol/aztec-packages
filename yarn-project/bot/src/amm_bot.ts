import { AztecAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { TxHash, TxReceipt } from '@aztec/aztec.js/tx';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import type { AMMContract } from '@aztec/noir-contracts.js/AMM';
import type { TokenContract } from '@aztec/noir-contracts.js/Token';
import type { BlockTag } from '@aztec/stdlib/block';
import type { AztecNode, AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import type { EmbeddedWallet } from '@aztec/wallets/embedded';

import { BaseBot } from './base_bot.js';
import type { BotConfig } from './config.js';
import { BotFactory } from './factory.js';
import type { BotStore } from './store/index.js';

const TRANSFER_BASE_AMOUNT = 1_000;
const TRANSFER_VARIANCE = 200;

type Balances = { token0: bigint; token1: bigint };

export class AmmBot extends BaseBot {
  protected constructor(
    node: AztecNode,
    wallet: EmbeddedWallet,
    defaultAccountAddress: AztecAddress,
    public readonly amm: AMMContract,
    public readonly token0: TokenContract,
    public readonly token1: TokenContract,
    config: BotConfig,
  ) {
    super(node, wallet, defaultAccountAddress, config);
  }

  static async create(
    config: BotConfig,
    wallet: EmbeddedWallet,
    aztecNode: AztecNode,
    aztecNodeAdmin: AztecNodeAdmin | undefined,
    store: BotStore,
    pxeSyncChainTip?: BlockTag,
  ): Promise<AmmBot> {
    const { defaultAccountAddress, token0, token1, amm } = await new BotFactory(
      config,
      wallet,
      store,
      aztecNode,
      aztecNodeAdmin,
      pxeSyncChainTip,
    ).setupAmm();
    return new AmmBot(aztecNode, wallet, defaultAccountAddress, amm, token0, token1, config);
  }

  protected async createAndSendTx(logCtx: object): Promise<TxHash> {
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

    const swapAuthwit = await wallet.createAuthWit(this.defaultAccountAddress, {
      caller: amm.address,
      call: await tokenIn.methods
        .transfer_to_public(this.defaultAccountAddress, amm.address, amountIn, authwitNonce)
        .getFunctionCall(),
    });

    const { result: tokenInBalance } = await tokenIn.methods
      .balance_of_public(amm.address)
      .simulate({ from: this.defaultAccountAddress });
    const { result: tokenOutBalance } = await tokenOut.methods
      .balance_of_public(amm.address)
      .simulate({ from: this.defaultAccountAddress });
    const { result: amountOutMin } = await amm.methods
      .get_amount_out_for_exact_in(tokenInBalance, tokenOutBalance, amountIn)
      .simulate({ from: this.defaultAccountAddress });

    const swapExactTokensInteraction = amm.methods
      .swap_exact_tokens_for_tokens(tokenIn.address, tokenOut.address, amountIn, amountOutMin, authwitNonce)
      .with({
        authWitnesses: [swapAuthwit],
      });

    const opts = this.getSendMethodOpts();

    this.log.verbose(`Sending transaction`, logCtx);
    this.log.info(`Tx. Balances: ${jsonStringify(balances)}`, { ...logCtx, balances });
    const { txHash } = await swapExactTokensInteraction.send({ ...opts, wait: NO_WAIT });
    return txHash;
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
      senderPublic: await this.getPublicBalanceFor(this.defaultAccountAddress),
      senderPrivate: await this.getPrivateBalanceFor(this.defaultAccountAddress),
      amm: await this.getPublicBalanceFor(this.amm.address, this.defaultAccountAddress),
    };
  }

  private async getPublicBalanceFor(address: AztecAddress, from?: AztecAddress): Promise<Balances> {
    const { result: token0 } = await this.token0.methods.balance_of_public(address).simulate({ from: from ?? address });
    const { result: token1 } = await this.token1.methods.balance_of_public(address).simulate({ from: from ?? address });
    return { token0, token1 };
  }
  private async getPrivateBalanceFor(address: AztecAddress, from?: AztecAddress): Promise<Balances> {
    const { result: token0 } = await this.token0.methods
      .balance_of_private(address)
      .simulate({ from: from ?? address });
    const { result: token1 } = await this.token1.methods
      .balance_of_private(address)
      .simulate({ from: from ?? address });
    return { token0, token1 };
  }
}
