import { EthAddress } from '@aztec/foundation/eth-address';
import type { ViemTransactionSignature } from '@aztec/foundation/eth-signature';

import { type TransactionSerializable, type WalletClient, parseTransaction } from 'viem';

import type { SigningCallback } from './types.js';

export function createViemSigner(client: WalletClient) {
  const signer: SigningCallback = async (
    tx: TransactionSerializable,
    _address: EthAddress,
  ): Promise<ViemTransactionSignature> => {
    const signedTx = await client.signTransaction(tx as any);

    const parsed = parseTransaction(signedTx);

    if (!parsed.r || !parsed.s || (parsed.yParity !== 0 && parsed.yParity !== 1)) {
      throw new Error('Failed to extract signature from viem signed transaction');
    }

    return {
      r: parsed.r,
      s: parsed.s,
      yParity: parsed.yParity,
    };
  };
  return signer;
}
