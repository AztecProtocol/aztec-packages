# SHA-256 Native Implementation

## Specification

The implementation follows NIST FIPS 180-4: Secure Hash Standard
https://csrc.nist.gov/publications/detail/fips/180/4/final

## Algorithm Overview

SHA-256 processes input in 512-bit (64-byte) blocks, producing a 256-bit (32-byte) hash.

### Preprocessing

1. **Padding**: Append bit `1`, then zeros, then 64-bit big-endian message length (in bits)
2. Padded message length is a multiple of 512 bits

### Per-Block Processing

Each 512-bit block is processed through 64 rounds:

**Message Schedule (W)**
- W[0..15]: Input block (16 × 32-bit words)
- W[16..63]: Extended via σ₀ and σ₁ functions

**Compression Function**
```
For i = 0 to 63:
    S1 = ROTR⁶(e) ⊕ ROTR¹¹(e) ⊕ ROTR²⁵(e)
    Ch = (e ∧ f) ⊕ (¬e ∧ g)
    temp1 = h + S1 + Ch + K[i] + W[i]

    S0 = ROTR²(a) ⊕ ROTR¹³(a) ⊕ ROTR²²(a)
    Maj = (a ∧ b) ⊕ (a ∧ c) ⊕ (b ∧ c)
    temp2 = S0 + Maj

    (a,b,c,d,e,f,g,h) = (temp1+temp2, a, b, c, d+temp1, e, f, g)
```

**Output**: Add compressed values to running hash state.

### Constants

- **H[0..7]**: Initial hash values (first 32 bits of fractional parts of square roots of first 8 primes)
- **K[0..63]**: Round constants (first 32 bits of fractional parts of cube roots of first 64 primes)

## API

```cpp
// Hash arbitrary input (handles padding)
template <typename T>
Sha256Hash sha256(const T& input);

// Single-block compression function (no padding)
std::array<uint32_t, 8> sha256_block(
    const std::array<uint32_t, 8>& h_init,   // Initial/previous hash state
    const std::array<uint32_t, 16>& input);  // 512-bit message block
```

## Test Vectors

5 NIST test vectors in `sha256.test.cpp`:
- "abc"
- "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"
- Single byte 0xBD
- 4 bytes 0xC98C8E55
- 1000 × 'A'
