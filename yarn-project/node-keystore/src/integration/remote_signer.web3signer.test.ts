import { Buffer32 } from '@aztec/foundation/buffer';
import { isoDate } from '@aztec/foundation/string';

import { jest } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import type { TransactionSerializable, TypedDataDefinition } from 'viem';

import { LocalSigner, RemoteSigner } from '../signer.js';

const streamWeb3SignerLogs = false;

const WEB3SIGNER_IMAGE = 'consensys/web3signer:25.3.0';

describe('RemoteSigner integration: Web3Signer', () => {
  jest.setTimeout(180_000);

  const privateKey = `0x${'11'.repeat(32)}` as const;
  const local = new LocalSigner(Buffer32.fromString(privateKey));
  const address = local.address;

  let container: StartedTestContainer;
  let baseUrl: string;

  let workingDir: string;

  let chainId: number;

  beforeAll(async () => {
    // Prepare a temporary key store directory for file-based raw private key configuration.
    workingDir = mkdtempSync(join(tmpdir(), `web3signer-keys-${isoDate()}-`));

    const yaml = `type: file-raw\nkeyType: SECP256K1\nprivateKey: ${privateKey}\n`;
    writeFileSync(join(workingDir, 'key.yaml'), yaml, { encoding: 'utf-8' });

    chainId = 31337;

    container = await new GenericContainer(WEB3SIGNER_IMAGE)
      .withExposedPorts({ container: 9000, host: 0 })
      // copy instead of mounting to avoid issues with permissions
      .withCopyDirectoriesToContainer([{ source: workingDir, target: '/keys' }])
      .withCommand([
        '--http-listen-port=9000',
        '--http-host-allowlist=*',
        '--key-store-path=/keys',
        '--logging=DEBUG',
        'eth1',
        '--chain-id',
        String(chainId),
      ])
      .withWaitStrategy(Wait.forListeningPorts())
      .withLogConsumer(stream => {
        if (streamWeb3SignerLogs) {
          stream.on('data', line => process.stdout.write(line));
          stream.on('err', line => process.stderr.write(line));
        }
      })
      .start();

    const host = container.getHost();
    const port = container.getMappedPort(9000);
    baseUrl = `http://${host}:${port}`;
  });

  afterAll(async () => {
    if (container) {
      await container.stop({ remove: true });
    }

    rmSync(workingDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  // the remote signer ends up calling a client? I'm not sure this is implemented in web3signer
  it.skip('signs EIP-712 typed data and matches r/s with local', async () => {
    const signer = new RemoteSigner(address, baseUrl);

    const typedData: TypedDataDefinition = {
      domain: { name: 'Aztec', version: '1', chainId: 1 },
      types: {
        Mail: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'contents', type: 'string' },
        ],
      },
      primaryType: 'Mail',
      message: {
        from: address.toString(),
        to: address.toString(),
        contents: 'hello',
      },
    };

    const localSig = await local.signTypedData(typedData);
    const remoteSig = await signer.signTypedData(typedData);

    expect(remoteSig.r.toString()).toBe(localSig.r.toString());
    expect(remoteSig.s.toString()).toBe(localSig.s.toString());
    expect([0, 1, 27, 28]).toContain(remoteSig.v);
  });

  it('signs message via eth_sign and matches local', async () => {
    const signer = new RemoteSigner(address, baseUrl);
    const message = Buffer32.fromString('0x' + 'ab'.repeat(32));

    const remoteSig = await signer.signMessage(message);
    const localSig = await local.signMessage(message);

    expect(remoteSig.r.toString()).toBe(localSig.r.toString());
    expect(remoteSig.s.toString()).toBe(localSig.s.toString());
    expect([27, 28]).toContain(remoteSig.v);
  });

  it('signs a EIP-1559 transaction and matches r/s with local', async () => {
    const signer = new RemoteSigner(address, baseUrl);

    const tx: TransactionSerializable = {
      type: 'eip1559',
      chainId,
      nonce: 1,
      gas: 21_000n,
      maxFeePerGas: 100n,
      maxPriorityFeePerGas: 2n,
      to: address.toString(),
      value: 1n,
      data: '0x',
    };

    const remoteSig = await signer.signTransaction(tx);
    const localSig = await local.signTransaction(tx);

    expect(remoteSig.r.toString()).toBe(localSig.r.toString());
    expect(remoteSig.s.toString()).toBe(localSig.s.toString());
    expect([0, 1, 27, 28]).toContain(remoteSig.v);
  });

  it.skip('signs an EIP-4844 blob transaction and matches r/s with local', async () => {
    const signer = new RemoteSigner(address, baseUrl);

    // Dummy blob versioned hash (32 bytes). In practice these are computed from the blob data.
    const blobHash = ('0x01' + 'ab'.repeat(31)) as `0x${string}`;

    const tx: TransactionSerializable = {
      type: 'eip4844',
      chainId,
      nonce: 1,
      gas: 21000n,
      maxFeePerGas: 100n,
      maxPriorityFeePerGas: 2n,
      maxFeePerBlobGas: 1n,
      blobVersionedHashes: [blobHash],
      to: address.toString(),
      value: 2n,
      data: '0x',
    };

    const remoteSig = await signer.signTransaction(tx);
    const localSig = await local.signTransaction(tx);

    expect(remoteSig.r.toString()).toBe(localSig.r.toString());
    expect(remoteSig.s.toString()).toBe(localSig.s.toString());
    expect([0, 1, 27, 28]).toContain(remoteSig.v);
  });
});
