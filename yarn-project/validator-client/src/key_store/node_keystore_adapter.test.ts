import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { beforeEach, describe, expect, it } from '@jest/globals';
import type { TypedDataDefinition } from 'viem';

import { NodeKeystoreAdapter } from './node_keystore_adapter.js';

// ---- Test data --------------------------------------------------------------

const K = {
  ATTESTER_1: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  ATTESTER_3: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  PUBLISHER_1: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  PUBLISHER_2: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  PUBLISHER_3: '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
} as const;

const A = {
  ATTESTER_1: EthAddress.fromString('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'),
  ATTESTER_2: EthAddress.fromString('0xf9095291785af6c8a1225d0f30815b35f37b7732'),
  ATTESTER_3: EthAddress.fromString('0x15d34aaf54267db7d7c367839aaf71a00a2c6a65'),
  ATTESTER_4: EthAddress.fromString('0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f'),
  ATTESTER_5: EthAddress.fromString('0xa0ee7a142d267c1f36714e4a8f75612f20a79720'),
  PUBLISHER_1: EthAddress.fromString('0x70997970c51812dc3a010c7d01b50e0d17dc79c8'),
  PUBLISHER_2: EthAddress.fromString('0x90f79bf6eb2c4f870365e785982e1f101e93b906'),
  PUBLISHER_3: EthAddress.fromString('0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc'),
  COINBASE_1: EthAddress.fromString('0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc'),
  COINBASE_2: EthAddress.fromString('0x90f79bf6eb2c4f870365e785982e1f101e93b906'),
  COINBASE_3: EthAddress.fromString('0x71be63f3384f5fb98995898a86b02fb2426c5788'),
  FEE_1: AztecAddress.fromString('0xbcd4042de499d14e55001ccbb24a551f3b954096000000000000000000000000'),
  FEE_2: AztecAddress.fromString('0x71be63f3384f5fb98995898a86b02fb2426c5788000000000000000000000000'),
  FEE_3: AztecAddress.fromString('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266000000000000000000000000'),
  UNKNOWN: '0x9999999999999999999999999999999999999999',
} as const;

const RS = {
  URL_1: 'https://remote-signer-1.example.com:8443',
  URL_2: 'https://remote-signer-2.example.com:8443',
  CERT_1_PATH: '/path/to/cert1.pem',
  CERT_1_PASS: 'certpass1',
  CERT_DEF_PATH: '/path/to/default/cert.pem',
  CERT_DEF_PASS: 'defaultpass',
} as const;

// ---- Small helpers ----------------------------------------------------------

const addr = (hex: string | EthAddress) => {
  if (typeof hex === 'string') {
    return EthAddress.fromString(hex);
  } else {
    return hex;
  }
};
const lower = (hex: string | EthAddress) => {
  if (typeof hex === 'string') {
    return hex.toLowerCase();
  } else {
    return hex.toString().toLowerCase();
  }
};

function expectEqualAddressSets(actual: EthAddress[], expected: EthAddress[]) {
  const a = new Set(actual.map(a => lower(a.toString())));
  const e = new Set(expected.map(a => lower(a.toString())));
  expect(a).toStrictEqual(e);
}

function mkTypedData(): TypedDataDefinition {
  return {
    domain: { name: 'Test', version: '1', chainId: 1 },
    types: { Message: [{ name: 'data', type: 'string' }] },
    primaryType: 'Message',
    message: { data: 'test message' },
  };
}

function fixedBuffer32(): Buffer32 {
  // deterministic 32 bytes (no randomness in tests)
  return Buffer32.fromString('0x' + '11'.repeat(32));
}

function mkMainConfig() {
  return {
    schemaVersion: 1,
    validators: [
      {
        attester: [K.ATTESTER_1, A.ATTESTER_4, { address: A.ATTESTER_5, remoteSignerUrl: RS.URL_2 }],
        publisher: K.PUBLISHER_1,
        coinbase: A.COINBASE_1,
        feeRecipient: A.FEE_1,
        remoteSigner: RS.URL_1,
      },
      {
        attester: {
          address: A.ATTESTER_2,
          remoteSignerUrl: RS.URL_2,
          certPath: RS.CERT_1_PATH,
          certPass: RS.CERT_1_PASS,
        },
        publisher: K.PUBLISHER_2,
        coinbase: A.COINBASE_2,
        feeRecipient: A.FEE_2,
        remoteSigner: {
          remoteSignerUrl: RS.URL_1,
          certPath: RS.CERT_DEF_PATH,
          certPass: RS.CERT_DEF_PASS,
        },
      },
      {
        attester: K.ATTESTER_3,
        publisher: K.PUBLISHER_3,
        coinbase: A.COINBASE_3,
        feeRecipient: A.FEE_3,
      },
    ],
  };
}

// ---- Tests ------------------------------------------------------------------

describe('NodeKeystoreAdapter', () => {
  let adapter: NodeKeystoreAdapter;
  let cfg: any;

  beforeEach(() => {
    cfg = mkMainConfig();
    adapter = NodeKeystoreAdapter.fromKeystoreConfig(cfg);
  });

  describe('getAddresses / getAttesterAddresses', () => {
    it('returns all attester addresses (order-agnostic)', () => {
      const got = adapter.getAddresses();
      const expected = [
        addr(A.ATTESTER_1),
        addr(A.ATTESTER_4),
        addr(A.ATTESTER_5),
        addr(A.ATTESTER_2),
        addr(A.ATTESTER_3),
      ];
      expectEqualAddressSets(got, expected);
    });

    it('getAttesterAddresses mirrors getAddresses', () => {
      expect(adapter.getAttesterAddresses()).toEqual(adapter.getAddresses());
    });

    it('bounds check for getAddress', () => {
      expect(() => adapter.getAddress(999)).toThrow();
    });
  });

  describe('validator lookups', () => {
    it.each([
      [A.ATTESTER_1, A.COINBASE_1],
      [A.ATTESTER_4, A.COINBASE_1],
      [A.ATTESTER_5, A.COINBASE_1],
      [A.ATTESTER_2, A.COINBASE_2],
      [A.ATTESTER_3, A.COINBASE_3],
    ])('coinbase(%s) -> %s', (att, coinbase) => {
      expect(adapter.getCoinbaseAddress(addr(att)).equals(addr(coinbase))).toBe(true);
    });

    it('unknown attester -> error', () => {
      expect(() => adapter.getCoinbaseAddress(addr(A.UNKNOWN))).toThrow(
        `Attester address ${lower(A.UNKNOWN)} not found in any validator configuration`,
      );
    });

    it.each([
      [A.ATTESTER_1, [A.PUBLISHER_1]],
      [A.ATTESTER_2, [A.PUBLISHER_2]],
      [A.ATTESTER_3, [A.PUBLISHER_3]],
    ])('publisher addresses for %s', (att, pubs) => {
      const got = adapter.getPublisherAddresses(addr(att));
      const expected = pubs.map(addr);
      expectEqualAddressSets(got, expected);
    });

    it.each([
      [A.ATTESTER_1, A.FEE_1],
      [A.ATTESTER_2, A.FEE_2],
      [A.ATTESTER_3, A.FEE_3],
    ])('fee recipient for %s', (att, fee) => {
      const got = adapter.getFeeRecipient(addr(att));
      expect(got).toBeInstanceOf(AztecAddress);
      expect(got.equals(fee)).toBeTruthy();
    });
  });

  describe('remote signer config', () => {
    it('validator-level and attester-level override shape', () => {
      const v1 = cfg.validators[0];
      expect(v1.remoteSigner).toBe(RS.URL_1);
      expect(v1.attester).toHaveLength(3);
      expect(v1.attester[0]).toBe(K.ATTESTER_1);
      expect(v1.attester[1]).toBe(A.ATTESTER_4);
      expect(v1.attester[2]).toEqual({ address: A.ATTESTER_5, remoteSignerUrl: RS.URL_2 });

      const v2 = cfg.validators[1];
      expect(v2.remoteSigner).toEqual({
        remoteSignerUrl: RS.URL_1,
        certPath: RS.CERT_DEF_PATH,
        certPass: RS.CERT_DEF_PASS,
      });
      expect(v2.attester).toEqual({
        address: A.ATTESTER_2,
        remoteSignerUrl: RS.URL_2,
        certPath: RS.CERT_1_PATH,
        certPass: RS.CERT_1_PASS,
      });

      const v3 = cfg.validators[2];
      expect(v3.remoteSigner).toBeUndefined();
      expect(v3.attester).toBe(K.ATTESTER_3);
    });
  });

  describe('fallbacks (publisher/coinbase default to attester)', () => {
    it('falls back properly', () => {
      const fallback = NodeKeystoreAdapter.fromKeystoreConfig({
        schemaVersion: 1,
        validators: [{ attester: K.ATTESTER_1, feeRecipient: A.FEE_1 }],
      });
      const a = addr(A.ATTESTER_1);
      const pubs = fallback.getPublisherAddresses(a);
      expect(pubs).toHaveLength(1);
      expect(lower(pubs[0].toString())).toBe(lower(a.toString()));
      expect(lower(fallback.getCoinbaseAddress(a).toString())).toBe(lower(a.toString()));
    });
  });

  describe('uniqueness validation integration', () => {
    it('attester addresses are unique', () => {
      const addrs = adapter.getAddresses().map(x => lower(x.toString()));
      expect(new Set(addrs).size).toBe(addrs.length);
    });

    it('duplicate attester across validators -> throws', () => {
      const dup = {
        schemaVersion: 1,
        validators: [
          { attester: K.ATTESTER_1, publisher: K.ATTESTER_1, coinbase: A.ATTESTER_1, feeRecipient: A.FEE_1 },
          { attester: K.ATTESTER_1, publisher: K.ATTESTER_1, coinbase: A.ATTESTER_1, feeRecipient: A.FEE_2 },
        ],
      };
      expect(() => NodeKeystoreAdapter.fromKeystoreConfig(dup)).toThrow(
        `Duplicate attester address found: ${lower(A.ATTESTER_1)}. An attester address may only appear once across all configuration blocks.`,
      );
    });

    it('case-insensitive duplicate detection example', () => {
      const seen = new Set<string>();
      const items = ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', '0xF39FD6E51AAD88F6F4CE6AB8827279CFFFB92266'];
      let dup = false;
      for (const x of items) {
        const k = lower(x);
        if (seen.has(k)) {
          dup = true;
          break;
        }
        seen.add(k);
      }
      expect(dup).toBe(true);
    });
  });

  describe('signing (private key only)', () => {
    const pkOnlyCfg = {
      schemaVersion: 1,
      validators: [
        { attester: K.ATTESTER_1, publisher: K.PUBLISHER_1, coinbase: A.COINBASE_1, feeRecipient: A.FEE_1 },
        { attester: K.ATTESTER_3, publisher: K.PUBLISHER_3, coinbase: A.COINBASE_3, feeRecipient: A.FEE_3 },
      ],
    };

    it('signTypedData across attesters', async () => {
      const ad = NodeKeystoreAdapter.fromKeystoreConfig(pkOnlyCfg);
      const sigs = await ad.signTypedData(mkTypedData());
      expect(sigs).toHaveLength(2);
      expect(new Set(sigs.map(s => s.toString())).size).toBe(2);
    });

    it('signTypedDataWithAddress (different keys -> different sigs)', async () => {
      const adaptor = NodeKeystoreAdapter.fromKeystoreConfig(pkOnlyCfg);
      const td = mkTypedData();
      const s1 = await adaptor.signTypedDataWithAddress(addr(A.ATTESTER_1), td);
      const s3 = await adaptor.signTypedDataWithAddress(addr(A.ATTESTER_3), td);
      expect(s1.toString()).not.toBe(s3.toString());
    });

    it('signMessage + signMessageWithAddress', async () => {
      const adaptor = NodeKeystoreAdapter.fromKeystoreConfig(pkOnlyCfg);
      const msg = fixedBuffer32();
      const sigs = await adaptor.signMessage(msg);
      expect(sigs).toHaveLength(2);
      const s1 = await adaptor.signMessageWithAddress(addr(A.ATTESTER_1), msg);
      expect(s1).toBeDefined();
    });

    it('unknown address -> rejects', async () => {
      const adaptor = NodeKeystoreAdapter.fromKeystoreConfig(pkOnlyCfg);
      await expect(adaptor.signTypedDataWithAddress(addr(A.UNKNOWN), mkTypedData())).rejects.toThrow(
        `No signer found for address ${lower(A.UNKNOWN)}`,
      );
      await expect(adaptor.signMessageWithAddress(addr(A.UNKNOWN), fixedBuffer32())).rejects.toThrow(
        `No signer found for address ${lower(A.UNKNOWN)}`,
      );
    });
  });
});
