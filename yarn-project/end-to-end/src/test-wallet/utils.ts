import {
  BatchCall,
  ContractFunctionInteraction,
  DeployMethod,
  type DeployOptions,
  NO_WAIT,
  type NoWait,
  type SendInteractionOptions,
  type WaitOpts,
  toSendOptions,
} from '@aztec/aztec.js/contracts';
import { type AztecNode, waitForTx } from '@aztec/aztec.js/node';
import { SimulationError } from '@aztec/stdlib/errors';
import { type OffchainEffect, type ProvingStats, Tx, TxHash, type TxReceipt } from '@aztec/stdlib/tx';

import { inspect } from 'util';

import type { TestWallet } from './test_wallet.js';

export type ProvenTxSendOpts = {
  wait?: NoWait | WaitOpts;
};

export type ProvenTxSendReturn<T extends NoWait | WaitOpts | undefined> = T extends NoWait ? TxHash : TxReceipt;

export class ProvenTx extends Tx {
  constructor(
    private node: AztecNode,
    tx: Tx,
    public offchainEffects: OffchainEffect[],
    public stats?: ProvingStats,
  ) {
    super(tx.getTxHash(), tx.data, tx.chonkProof, tx.contractClassLogFields, tx.publicFunctionCalldata);
  }

  send(options?: Omit<ProvenTxSendOpts, 'wait'>): Promise<TxReceipt>;
  send<W extends ProvenTxSendOpts['wait']>(options: ProvenTxSendOpts & { wait: W }): Promise<ProvenTxSendReturn<W>>;
  async send(options?: ProvenTxSendOpts): Promise<TxHash | TxReceipt> {
    const txHash = this.getTxHash();
    await this.node.sendTx(this).catch(err => {
      throw this.contextualizeError(err, inspect(this));
    });

    if (options?.wait === NO_WAIT) {
      return txHash;
    }

    const waitOpts = typeof options?.wait === 'object' ? options.wait : undefined;
    return await waitForTx(this.node, txHash, waitOpts);
  }

  private contextualizeError(err: Error, ...context: string[]): Error {
    let contextStr = '';
    if (context.length > 0) {
      contextStr = `\nContext:\n${context.join('\n')}`;
    }
    if (err instanceof SimulationError) {
      err.setAztecContext(contextStr);
    }
    return err;
  }
}

export async function proveInteraction(
  wallet: TestWallet,
  interaction: ContractFunctionInteraction | DeployMethod | BatchCall,
  options: SendInteractionOptions | DeployOptions,
) {
  const execPayload = await interaction.request(options);
  return wallet.proveTx(execPayload, toSendOptions(options));
}

/**
 * Extends AztecNode via declaration merging so instances can be used wherever AztecNode is expected.
 * The actual method forwarding is handled by a Proxy in the class constructor.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AztecNodeProxy extends AztecNode {}

/**
 * Mutable wrapper around an AztecNode that forwards all calls to the current target.
 * Allows swapping the underlying node at runtime via updateTargetNode, which is useful
 * for tests that need to redirect a wallet from one node to another without recreating it.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AztecNodeProxy {
  constructor(private target: AztecNode) {
    return new Proxy(this, {
      get: (obj, prop, receiver) => {
        // Own properties and methods (updateTargetNode, target) are served directly.
        if (Reflect.has(obj, prop)) {
          return Reflect.get(obj, prop, receiver);
        }
        // Everything else is forwarded to the current target node.
        const val = (obj.target as unknown as Record<string | symbol, unknown>)[prop];
        return typeof val === 'function' ? val.bind(obj.target) : val;
      },
    });
  }

  /**
   * Updates the underlying node that this reference points to.
   * @param node - The new node to forward calls to.
   */
  updateTargetNode(node: AztecNode): void {
    this.target = node;
  }
}
