import { EthAddress } from '@aztec/aztec.js';
import { Buffer32 } from '@aztec/foundation/buffer';
import { LocalSigner, RemoteSigner } from '@aztec/node-keystore';

import { jest } from '@jest/globals';
import type { TransactionSerializable, TypedDataDefinition } from 'viem';
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts';

import {
  createWeb3SignerKeystore,
  getWeb3SignerTestKeystoreDir,
  getWeb3SignerUrl,
  refreshWeb3Signer,
} from '../../fixtures/web3signer.js';

const { L1_CHAIN_ID = '31337' } = process.env;

describe('RemoteSigner integration: Web3Signer (compose)', () => {
  jest.setTimeout(180_000);

  let web3SignerUrl: string;
  let chainId: number;

  let privateKey: Buffer32;
  let address: EthAddress;

  let remoteSigner: RemoteSigner;
  let localSigner: LocalSigner;

  beforeAll(async () => {
    web3SignerUrl = getWeb3SignerUrl();

    privateKey = Buffer32.fromString(generatePrivateKey());
    address = EthAddress.fromString(privateKeyToAddress(privateKey.toString()));

    chainId = parseInt(L1_CHAIN_ID, 10);

    await createWeb3SignerKeystore(getWeb3SignerTestKeystoreDir(), privateKey.toString());
    await refreshWeb3Signer(web3SignerUrl, address.toString());
  });

  beforeEach(() => {
    localSigner = new LocalSigner(privateKey);
    remoteSigner = new RemoteSigner(address, web3SignerUrl);
  });

  it('signs EIP-712 typed data and matches r/s with local', async () => {
    const typedData: TypedDataDefinition = {
      domain: {
        name: 'TallySlashingProposer',
        version: '1',
        chainId,
        verifyingContract: EthAddress.random().toString(),
      },
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        Vote: [
          { name: 'votes', type: 'bytes' },
          { name: 'slot', type: 'uint256' },
        ],
      },
      primaryType: 'Vote',
      message: {
        votes: '0x1234',
        slot: 42n,
      },
    };

    const localSig = await localSigner.signTypedData(typedData);
    const remoteSig = await remoteSigner.signTypedData(typedData);

    expect(remoteSig.r.toString()).toBe(localSig.r.toString());
    expect(remoteSig.s.toString()).toBe(localSig.s.toString());
    expect([0, 1, 27, 28]).toContain(remoteSig.v);
  });

  it('signs message via eth_sign and matches local', async () => {
    const signer = new RemoteSigner(address, web3SignerUrl);
    const message = Buffer32.fromString('0x' + 'ab'.repeat(32));

    const remoteSig = await signer.signMessage(message);
    const localSig = await localSigner.signMessage(message);

    expect(remoteSig.r.toString()).toBe(localSig.r.toString());
    expect(remoteSig.s.toString()).toBe(localSig.s.toString());
    expect([27, 28]).toContain(remoteSig.v);
  });

  it('signs a EIP-1559 transaction and matches r/s with local', async () => {
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

    const remoteSig = await remoteSigner.signTransaction(tx);
    const localSig = await localSigner.signTransaction(tx);

    expect(remoteSig.r.toString()).toBe(localSig.r.toString());
    expect(remoteSig.s.toString()).toBe(localSig.s.toString());
    expect([0, 1, 27, 28]).toContain(remoteSig.v);
  });

  it.skip('signs an EIP-4844 blob transaction and matches r/s with local', async () => {
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

    const remoteSig = await remoteSigner.signTransaction(tx);
    const localSig = await localSigner.signTransaction(tx);

    expect(remoteSig.r.toString()).toBe(localSig.r.toString());
    expect(remoteSig.s.toString()).toBe(localSig.s.toString());
    expect([0, 1, 27, 28]).toContain(remoteSig.v);
  });

  it('validates web3signer accessibility and address availability', async () => {
    // Should succeed with the correct address
    await expect(RemoteSigner.validateAccess(web3SignerUrl, [address.toString()])).resolves.not.toThrow();

    // Should fail with a non-existent address
    const nonExistentAddress = EthAddress.random().toString();
    await expect(RemoteSigner.validateAccess(web3SignerUrl, [nonExistentAddress])).rejects.toThrow(
      `The following addresses are not available in the web3signer: ${nonExistentAddress.toLowerCase()}`,
    );

    // Should succeed when checking multiple addresses where one exists
    await expect(RemoteSigner.validateAccess(web3SignerUrl, [address.toString()])).resolves.not.toThrow();

    // Should fail with an invalid URL
    await expect(RemoteSigner.validateAccess('http://invalid-url:9999', [address.toString()])).rejects.toThrow();
  });
});
