import { AesGcmCipher, IdentityCipher, RawKeyProvider } from './cipher.js';

const textEncoder = new TextEncoder();

function encode(s: string): Uint8Array {
  return textEncoder.encode(s);
}

function randomSeed(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(32));
}

describe('IdentityCipher', () => {
  const cipher = new IdentityCipher();

  it('encrypt is a byte-for-byte passthrough', async () => {
    const plaintext = encode('hello world');
    const encrypted = await cipher.encrypt(plaintext);
    expect(encrypted).toEqual(plaintext);
  });

  it('decrypt is a byte-for-byte passthrough', async () => {
    const plaintext = encode('hello world');
    const decrypted = await cipher.decrypt(plaintext);
    expect(decrypted).toEqual(plaintext);
  });

  it('digest is deterministic for the same bytes', async () => {
    const bytes = encode('same input');
    const a = await cipher.digest(bytes);
    const b = await cipher.digest(bytes);
    expect(a).toEqual(b);
  });

  it('digest differs for different bytes', async () => {
    const a = await cipher.digest(encode('alpha'));
    const b = await cipher.digest(encode('beta'));
    expect(a).not.toEqual(b);
  });

  it('reports isNullCipher = true', () => {
    expect(cipher.isNullCipher).toBe(true);
  });

  it('keyDigest throws (opaque-keys requires real cipher)', async () => {
    await expect(cipher.keyDigest(encode('any key'))).rejects.toThrow(/opaque/i);
  });
});

describe('AesGcmCipher', () => {
  let cipher: AesGcmCipher;
  let seed: Uint8Array;

  beforeAll(async () => {
    seed = randomSeed();
    cipher = await AesGcmCipher.create(new RawKeyProvider(seed));
  });

  it('round-trips an arbitrary byte string', async () => {
    const plaintext = encode('the quick brown fox jumps over the lazy dog');
    const ciphertext = await cipher.encrypt(plaintext);
    const roundTripped = await cipher.decrypt(ciphertext);
    expect(roundTripped).toEqual(plaintext);
  });

  it('ciphertext differs from plaintext', async () => {
    const plaintext = encode('not the same bytes');
    const ciphertext = await cipher.encrypt(plaintext);
    expect(ciphertext).not.toEqual(plaintext);
  });

  it('is non-deterministic (fresh IV per encryption)', async () => {
    const plaintext = encode('same plaintext twice');
    const a = await cipher.encrypt(plaintext);
    const b = await cipher.encrypt(plaintext);
    expect(a).not.toEqual(b);
    // But both still decrypt to the original.
    expect(await cipher.decrypt(a)).toEqual(plaintext);
    expect(await cipher.decrypt(b)).toEqual(plaintext);
  });

  it('uses the 0x01 version prefix so msgpack plaintext is distinguishable', async () => {
    const ciphertext = await cipher.encrypt(encode('payload'));
    expect(ciphertext[0]).toBe(0x01);
  });

  it('rejects tampered ciphertext (AES-GCM auth tag)', async () => {
    const ciphertext = await cipher.encrypt(encode('payload'));
    // Flip a bit in the middle of the ciphertext body.
    const tampered = new Uint8Array(ciphertext);
    tampered[tampered.length - 5] ^= 0x01;
    await expect(cipher.decrypt(tampered)).rejects.toThrow();
  });

  it('rejects ciphertext with the wrong version byte', async () => {
    const fakeCiphertext = new Uint8Array(20);
    fakeCiphertext[0] = 0x99;
    await expect(cipher.decrypt(fakeCiphertext)).rejects.toThrow(/version/i);
  });

  it('digest is deterministic for the same plaintext', async () => {
    const bytes = encode('multimap dedup input');
    const a = await cipher.digest(bytes);
    const b = await cipher.digest(bytes);
    expect(a).toEqual(b);
  });

  it('digest differs for different plaintexts', async () => {
    const a = await cipher.digest(encode('alpha'));
    const b = await cipher.digest(encode('beta'));
    expect(a).not.toEqual(b);
  });

  it('digest is unguessable without the key (different seed → different digest)', async () => {
    const other = await AesGcmCipher.create(new RawKeyProvider(randomSeed()));
    const sameInput = encode('same input');
    const a = await cipher.digest(sameInput);
    const b = await other.digest(sameInput);
    expect(a).not.toEqual(b);
  });

  it('keyDigest is deterministic for the same encoded key', async () => {
    const key = encode('container:notes:slot:0x1234');
    const a = await cipher.keyDigest(key);
    const b = await cipher.keyDigest(key);
    expect(a).toEqual(b);
  });

  it('keyDigest differs across keys', async () => {
    const a = await cipher.keyDigest(encode('one'));
    const b = await cipher.keyDigest(encode('two'));
    expect(a).not.toEqual(b);
  });

  it('keyDigest uses a different sub-key than digest (cross-context independence)', async () => {
    const sameBytes = encode('collision probe');
    const valueDigest = await cipher.digest(sameBytes);
    const keyDigest = await cipher.keyDigest(sameBytes);
    // digest returns base64 string; keyDigest returns bytes. Normalize and compare.
    const keyDigestB64 = btoa(String.fromCharCode(...keyDigest));
    expect(valueDigest).not.toEqual(keyDigestB64);
  });

  it('reports isNullCipher = false', () => {
    expect(cipher.isNullCipher).toBe(false);
  });

  it('decrypt fails with a cipher instantiated from a different seed', async () => {
    const other = await AesGcmCipher.create(new RawKeyProvider(randomSeed()));
    const ciphertext = await cipher.encrypt(encode('secret'));
    await expect(other.decrypt(ciphertext)).rejects.toThrow();
  });

  it('two ciphers from the same seed agree on encrypt/decrypt/digest', async () => {
    const twin = await AesGcmCipher.create(new RawKeyProvider(seed));
    const plaintext = encode('shared key test');
    const ciphertext = await cipher.encrypt(plaintext);
    expect(await twin.decrypt(ciphertext)).toEqual(plaintext);
    expect(await twin.digest(plaintext)).toEqual(await cipher.digest(plaintext));
    expect(await twin.keyDigest(plaintext)).toEqual(await cipher.keyDigest(plaintext));
  });

  describe('AAD (row-binding)', () => {
    it('round-trips when the same AAD is supplied on decrypt', async () => {
      const plaintext = encode('payload');
      const aad = encode('container:notes:slot:deadbeef:0');
      const ciphertext = await cipher.encrypt(plaintext, aad);
      expect(await cipher.decrypt(ciphertext, aad)).toEqual(plaintext);
    });

    it('rejects decryption when AAD differs', async () => {
      const plaintext = encode('payload');
      const aad = encode('slot-A');
      const ciphertext = await cipher.encrypt(plaintext, aad);
      await expect(cipher.decrypt(ciphertext, encode('slot-B'))).rejects.toThrow();
    });

    it('rejects decryption when AAD is omitted but was present on encrypt', async () => {
      const plaintext = encode('payload');
      const ciphertext = await cipher.encrypt(plaintext, encode('slot'));
      await expect(cipher.decrypt(ciphertext)).rejects.toThrow();
    });

    it('rejects decryption when AAD is present but encrypt had none', async () => {
      const plaintext = encode('payload');
      const ciphertext = await cipher.encrypt(plaintext);
      await expect(cipher.decrypt(ciphertext, encode('slot'))).rejects.toThrow();
    });
  });
});

describe('RawKeyProvider', () => {
  it('accepts a 32-byte seed', async () => {
    const provider = new RawKeyProvider(randomSeed());
    await expect(provider.getMasterKey()).resolves.toBeDefined();
  });

  it('rejects a seed of the wrong length', () => {
    expect(() => new RawKeyProvider(new Uint8Array(16))).toThrow(/32/);
  });
});
