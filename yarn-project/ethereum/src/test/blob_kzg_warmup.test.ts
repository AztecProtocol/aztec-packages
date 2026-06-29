import { Blob, getBytesPerBlob } from '@aztec/blob-lib';
import { createLogger } from '@aztec/foundation/log';

import { foundry } from 'viem/chains';

import { createExtendedL1Client } from '../client.js';
import type { ExtendedViemWalletClient } from '../types.js';
import { warmBlobKzg } from './blob_kzg_warmup.js';
import type { Anvil } from './start_anvil.js';
import { startAnvil } from './start_anvil.js';

const MNEMONIC = 'test test test test test test test test test test test junk';

describe('warmBlobKzg', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let client: ExtendedViemWalletClient;

  const logger = createLogger('ethereum:test:blob_kzg_warmup');

  beforeAll(async () => {
    ({ anvil, rpcUrl } = await startAnvil({ l1BlockTime: 1 }));
    client = createExtendedL1Client([rpcUrl], MNEMONIC, foundry, undefined, 0);
  });

  afterAll(async () => {
    await anvil.stop();
  });

  it('warms KZG and leaves anvil able to accept a real blob tx', async () => {
    await expect(warmBlobKzg({ rpcUrl, chain: foundry, logger })).resolves.toBeUndefined();

    // A real blob tx should be accepted and mined now that anvil's trusted setup is warm. This also proves
    // the fake warm-up tx burned no nonce: the real tx uses a different account (index 0 vs 19), but anvil
    // must have rejected the fake tx without mining a block for the chain to be in a clean state.
    const blobs = [new Uint8Array(getBytesPerBlob()).fill(1)];
    const hash = await client.sendTransaction({
      to: client.account.address,
      blobs,
      kzg: Blob.getViemKzgInstance(),
      maxFeePerBlobGas: BigInt(1e10),
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    expect(receipt.blobGasUsed).toBeGreaterThan(0n);
  }, 30000);
});
