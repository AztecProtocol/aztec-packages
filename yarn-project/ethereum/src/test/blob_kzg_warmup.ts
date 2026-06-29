import { getBytesPerBlob, getBytesPerCommitment, getKzg } from '@aztec/blob-lib';
import type { Logger } from '@aztec/foundation/log';

import type { Chain } from 'viem';

import { createExtendedL1Client } from '../client.js';

// Standard anvil dev mnemonic. A high address index keeps the warm-up account distinct from the
// publisher/sequencer/prover accounts so a rejected warm-up tx cannot touch their nonces.
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
const WARMUP_ADDRESS_INDEX = 19;

/**
 * Warms both KZG trusted setups in parallel for tests against a local anvil:
 *   - anvil's own setup, loaded lazily when it first validates a blob sidecar in `eth_sendRawTransaction`
 *   - our `@crate-crypto/node-eth-kzg` singleton (`getKzg()`, a ~2.2s synchronous precomp build)
 *
 * Without this, the first checkpoint publish pays both serially (~4.4s). The recipe does all RPC round
 * trips up front, fires a single bare raw send carrying a fake (garbage) blob sidecar that anvil rejects
 * after loading its trusted setup (no block mined, no nonce burned), yields once to flush the socket write,
 * then synchronously builds our own precomp tables while anvil warms in parallel.
 *
 * Best-effort: any failure is debug-logged and swallowed, leaving lazy init as the fallback. Never throws.
 */
export async function warmBlobKzg(opts: { rpcUrl: string; chain: Chain; logger?: Logger }): Promise<void> {
  const { rpcUrl, chain, logger } = opts;
  try {
    // A pure-JS fake kzg: returns deterministic garbage of the correct lengths (commitment and proof are
    // both 48 bytes). It makes viem build a syntactically valid sidecar without initializing any native
    // module, so anvil loads its trusted setup to validate the (invalid) proof and then rejects the tx.
    const fakeKzg = {
      blobToKzgCommitment: () => {
        const commitment = new Uint8Array(getBytesPerCommitment());
        commitment.fill(0xab);
        commitment[0] = 0xc0;
        return commitment;
      },
      computeBlobKzgProof: () => {
        const proof = new Uint8Array(getBytesPerCommitment());
        proof.fill(0xcd);
        proof[0] = 0xc0;
        return proof;
      },
    };

    const client = createExtendedL1Client([rpcUrl], ANVIL_MNEMONIC, chain, undefined, WARMUP_ADDRESS_INDEX);

    // All RPC round trips (nonce, fees, gas) happen here, so only a single socket write remains to flush.
    const prepared = await client.prepareTransactionRequest({
      blobs: [new Uint8Array(getBytesPerBlob())],
      kzg: fakeKzg,
      to: '0x0000000000000000000000000000000000000000',
      value: 0n,
      maxFeePerBlobGas: 1_000_000_000_000n,
    });
    const serialized = await client.signTransaction(prepared);

    // Fire the raw send without awaiting and swallow the expected rejection.
    const sent = client.request({ method: 'eth_sendRawTransaction', params: [serialized] }).catch(() => {});

    // Flush the single socket write so anvil receives the tx and starts loading its trusted setup in its
    // own process before we block the event loop below.
    await new Promise(resolve => setImmediate(resolve));

    // Synchronously build our precomp tables (~2.2s, event-loop-blocking); anvil warms in parallel.
    getKzg();

    await sent;
  } catch (err) {
    logger?.debug('Failed to warm blob KZG; falling back to lazy init', { err });
  }
}
