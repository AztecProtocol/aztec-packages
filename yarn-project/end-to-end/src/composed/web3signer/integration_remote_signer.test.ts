import { EthAddress } from '@aztec/aztec.js';
import { Buffer32 } from '@aztec/foundation/buffer';
import { LocalSigner, RemoteSigner } from '@aztec/node-keystore';

import { jest } from '@jest/globals';
import type { TransactionSerializable, TypedDataDefinition } from 'viem';
import { privateKeyToAddress } from 'viem/accounts';

const {
  WEB3_SIGNER_URL = 'http://localhost:9000',
  L1_CHAIN_ID = '31337',
  TEST_PRIVATE_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111',
} = process.env;

describe('RemoteSigner integration: Web3Signer (compose)', () => {
  jest.setTimeout(180_000);

  let chainId: number;
  let web3SignerUrl: string;

  let privateKey: Buffer32;
  let address: EthAddress;

  let remoteSigner: RemoteSigner;
  let localSigner: LocalSigner;

  beforeAll(() => {
    if (!WEB3_SIGNER_URL) {
      throw new Error('Need to set WEB3_SIGNER_URL');
    }

    if (!TEST_PRIVATE_KEY) {
      throw new Error('Need to set WEB3_SIGNER_URL');
    }

    privateKey = Buffer32.fromString(TEST_PRIVATE_KEY);
    address = EthAddress.fromString(privateKeyToAddress(privateKey.toString()));

    chainId = parseInt(L1_CHAIN_ID, 10);
    web3SignerUrl = WEB3_SIGNER_URL;
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
});
