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

  it('warms KZG and leaves anvil and the sender able to send a real blob tx', async () => {
    await expect(warmBlobKzg(client, logger)).resolves.toBeUndefined();

    // A real blob tx from the SAME account must now be accepted and mined: anvil's trusted setup is warm,
    // and the rejected warm-up tx burned no nonce (it never entered the pool), so the sender's nonce is
    // still clean.
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
