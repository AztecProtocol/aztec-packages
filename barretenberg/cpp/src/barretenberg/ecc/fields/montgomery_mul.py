"""
Montgomery multiplication and squaring for 254-bit prime fields (e.g., BN254 Fr/Fq).
Uses 4 x 64-bit limb representation (little-endian).

This implementation uses "coarse representation": field elements are allowed to be
in the range [0, 2p) rather than strictly [0, p). (Note that 2p < 2^256.) This avoids
conditional subtraction after multiplication, since the Montgomery reduction naturally
produces results in [0, 2p) when the inputs are also in [0, 2p).

This corresponds to the small-modulus (254-bit) x64 path in field_impl_generic.hpp,
NOT the montgomery_mul_big path used for 256-bit moduli which requires conditional
subtraction.
"""

LIMB_BITS = 64
LIMB_MASK = (1 << LIMB_BITS) - 1


def mul_wide(a: int, b: int) -> tuple[int, int]:
    """Returns (lo, hi) of a * b as two 64-bit values."""
    res = a * b
    return (res & LIMB_MASK, res >> LIMB_BITS)


def mac(a: int, b: int, c: int, carry_in: int) -> tuple[int, int]:
    """Multiply-accumulate: returns (lo, carry_out) of a + b*c + carry_in."""
    res = a + b * c + carry_in
    return (res & LIMB_MASK, res >> LIMB_BITS)


def mac_mini(a: int, b: int, c: int) -> tuple[int, int]:
    """Multiply-accumulate without carry_in: returns (lo, carry_out) of a + b*c."""
    res = a + b * c
    return (res & LIMB_MASK, res >> LIMB_BITS)


def mac_discard_lo(a: int, b: int, c: int) -> int:
    """Returns high 64 bits of a + b*c."""
    return (a + b * c) >> LIMB_BITS


def montgomery_mul(a: list[int], b: list[int], modulus: list[int], r_inv: int) -> list[int]:
    """
    Montgomery multiplication: computes (a * b * R^-1) mod p
    where R = 2^256 and inputs a, b are in Montgomery form (coarse representation).

    This is an unrolled implementation matching field_impl_generic.hpp's small-modulus path.
    Key insight: for 254-bit moduli with inputs in [0, 2p), the result is automatically
    in [0, 2p) without needing conditional subtraction.

    The algorithm interleaves multiplication and reduction tightly, processing one limb
    of 'a' at a time. For each limb a[i]:
      1. Accumulate a[i] * b[j] into the running total
      2. Compute k = t0 * r_inv (mod 2^64) to make t0 + k*modulus[0] divisible by 2^64
      3. Add k * modulus and shift right by 64 bits (effectively dividing by 2^64)
    """
    # Process a[0]
    t0, c = mul_wide(a[0], b[0])
    k = (t0 * r_inv) & LIMB_MASK
    carry_a = mac_discard_lo(t0, k, modulus[0])

    t1, carry_a = mac_mini(carry_a, a[0], b[1])
    t0, c = mac(t1, k, modulus[1], c)
    t2, carry_a = mac_mini(carry_a, a[0], b[2])
    t1, c = mac(t2, k, modulus[2], c)
    t3, carry_a = mac_mini(carry_a, a[0], b[3])
    t2, c = mac(t3, k, modulus[3], c)
    t3 = c + carry_a

    # Process a[1]
    t0, carry_a = mac_mini(t0, a[1], b[0])
    k = (t0 * r_inv) & LIMB_MASK
    c = mac_discard_lo(t0, k, modulus[0])
    t1, carry_a = mac(t1, a[1], b[1], carry_a)
    t0, c = mac(t1, k, modulus[1], c)
    t2, carry_a = mac(t2, a[1], b[2], carry_a)
    t1, c = mac(t2, k, modulus[2], c)
    t3, carry_a = mac(t3, a[1], b[3], carry_a)
    t2, c = mac(t3, k, modulus[3], c)
    t3 = c + carry_a

    # Process a[2]
    t0, carry_a = mac_mini(t0, a[2], b[0])
    k = (t0 * r_inv) & LIMB_MASK
    c = mac_discard_lo(t0, k, modulus[0])
    t1, carry_a = mac(t1, a[2], b[1], carry_a)
    t0, c = mac(t1, k, modulus[1], c)
    t2, carry_a = mac(t2, a[2], b[2], carry_a)
    t1, c = mac(t2, k, modulus[2], c)
    t3, carry_a = mac(t3, a[2], b[3], carry_a)
    t2, c = mac(t3, k, modulus[3], c)
    t3 = c + carry_a

    # Process a[3]
    t0, carry_a = mac_mini(t0, a[3], b[0])
    k = (t0 * r_inv) & LIMB_MASK
    c = mac_discard_lo(t0, k, modulus[0])
    t1, carry_a = mac(t1, a[3], b[1], carry_a)
    t0, c = mac(t1, k, modulus[1], c)
    t2, carry_a = mac(t2, a[3], b[2], carry_a)
    t1, c = mac(t2, k, modulus[2], c)
    t3, carry_a = mac(t3, a[3], b[3], carry_a)
    t2, c = mac(t3, k, modulus[3], c)
    t3 = c + carry_a

    # No conditional subtraction needed for 254-bit moduli with coarse representation.
    # The result is guaranteed to be in [0, 2p) when inputs are in [0, 2p).
    return [t0, t1, t2, t3]


def square_accumulate(a: int, b: int, c: int, carry_in_lo: int, carry_in_hi: int) -> tuple[int, int, int]:
    """
    Computes a + 2*b*c + carry_in_lo + 2^64 * carry_in_hi.
    Returns (out, carry_lo, carry_hi).

    This is used for squaring optimization: off-diagonal terms a[i]*a[j] (i != j)
    appear twice in the full expansion, so we compute them once and double.

    carry_lo holds bits 64-127 of the running total, carry_hi holds bits 128-191.
    carry_hi is always in {0, 1, 2}.
    """
    r0 = (b * c) & LIMB_MASK
    r1 = (b * c) >> LIMB_BITS

    out = (r0 + r0) & LIMB_MASK
    carry_lo = 1 if (r0 + r0) >> LIMB_BITS else 0

    out_new = (out + a) & LIMB_MASK
    carry_lo += 1 if (out + a) >> LIMB_BITS else 0

    out = out_new
    out_new = (out + carry_in_lo) & LIMB_MASK
    carry_lo += 1 if (out + carry_in_lo) >> LIMB_BITS else 0

    out = out_new
    carry_lo_new = (carry_lo + r1) & LIMB_MASK
    carry_hi = 1 if (carry_lo + r1) >> LIMB_BITS else 0

    carry_lo = carry_lo_new
    carry_lo_new = (carry_lo + r1) & LIMB_MASK
    carry_hi += 1 if (carry_lo + r1) >> LIMB_BITS else 0

    carry_lo = carry_lo_new
    carry_lo_new = (carry_lo + carry_in_hi) & LIMB_MASK
    carry_hi += 1 if (carry_lo + carry_in_hi) >> LIMB_BITS else 0

    return (out, carry_lo_new, carry_hi)


def montgomery_square(a: list[int], modulus: list[int], r_inv: int) -> list[int]:
    """
    Montgomery squaring: computes (a^2 * R^-1) mod p.

    Optimized to compute off-diagonal products once and double them, using
    square_accumulate for the 2*a[i]*a[j] terms.

    Structure: for each "round" i, we add the diagonal term a[i]^2 and all
    off-diagonal terms 2*a[i]*a[j] for j > i, then perform Montgomery reduction.

    Like montgomery_mul, no conditional subtraction is needed for 254-bit moduli.
    """
    carry_hi = 0

    # Round 0: a[0]^2 and 2*a[0]*a[j] for j > 0
    t0, carry_lo = mul_wide(a[0], a[0])
    t1, carry_lo, carry_hi = square_accumulate(0, a[1], a[0], carry_lo, carry_hi)
    t2, carry_lo, carry_hi = square_accumulate(0, a[2], a[0], carry_lo, carry_hi)
    t3, carry_lo, carry_hi = square_accumulate(0, a[3], a[0], carry_lo, carry_hi)

    round_carry = carry_lo
    k = (t0 * r_inv) & LIMB_MASK
    c = mac_discard_lo(t0, k, modulus[0])
    t0, c = mac(t1, k, modulus[1], c)
    t1, c = mac(t2, k, modulus[2], c)
    t2, c = mac(t3, k, modulus[3], c)
    t3 = (c + round_carry) & LIMB_MASK

    # Round 1: a[1]^2 and 2*a[1]*a[j] for j > 1
    t1, carry_lo = mac_mini(t1, a[1], a[1])
    carry_hi = 0
    t2, carry_lo, carry_hi = square_accumulate(t2, a[2], a[1], carry_lo, carry_hi)
    t3, carry_lo, carry_hi = square_accumulate(t3, a[3], a[1], carry_lo, carry_hi)

    round_carry = carry_lo
    k = (t0 * r_inv) & LIMB_MASK
    c = mac_discard_lo(t0, k, modulus[0])
    t0, c = mac(t1, k, modulus[1], c)
    t1, c = mac(t2, k, modulus[2], c)
    t2, c = mac(t3, k, modulus[3], c)
    t3 = (c + round_carry) & LIMB_MASK

    # Round 2: a[2]^2 and 2*a[2]*a[3]
    t2, carry_lo = mac_mini(t2, a[2], a[2])
    carry_hi = 0
    t3, carry_lo, carry_hi = square_accumulate(t3, a[3], a[2], carry_lo, carry_hi)

    round_carry = carry_lo
    k = (t0 * r_inv) & LIMB_MASK
    c = mac_discard_lo(t0, k, modulus[0])
    t0, c = mac(t1, k, modulus[1], c)
    t1, c = mac(t2, k, modulus[2], c)
    t2, c = mac(t3, k, modulus[3], c)
    t3 = (c + round_carry) & LIMB_MASK

    # Round 3: a[3]^2 only (no off-diagonal terms left)
    t3, carry_lo = mac_mini(t3, a[3], a[3])
    k = (t0 * r_inv) & LIMB_MASK
    round_carry = carry_lo
    c = mac_discard_lo(t0, k, modulus[0])
    t0, c = mac(t1, k, modulus[1], c)
    t1, c = mac(t2, k, modulus[2], c)
    t2, c = mac(t3, k, modulus[3], c)
    t3 = (c + round_carry) & LIMB_MASK

    # No conditional subtraction needed for 254-bit moduli with coarse representation.
    return [t0, t1, t2, t3]


# === Helpers for testing ===


def limbs_to_int(limbs: list[int]) -> int:
    """Convert 4 x 64-bit limbs (little-endian) to integer."""
    return sum(limb << (64 * i) for i, limb in enumerate(limbs))


def int_to_limbs(x: int) -> list[int]:
    """Convert integer to 4 x 64-bit limbs (little-endian)."""
    return [(x >> (64 * i)) & LIMB_MASK for i in range(4)]


def to_montgomery(x: int, modulus_int: int) -> int:
    """Convert x to Montgomery form: x * R mod p, where R = 2^256."""
    R = 1 << 256
    return (x * R) % modulus_int


def from_montgomery(x_mont: int, modulus_int: int, r_inv_full: int) -> int:
    """Convert from Montgomery form: x_mont * R^-1 mod p."""
    return (x_mont * r_inv_full) % modulus_int


# BN254 Fq (base field) parameters
fq_modulus = [
    0x3C208C16D87CFD47,
    0x97816A916871CA8D,
    0xB85045B68181585D,
    0x30644E72E131A029,
]
fq_r_inv = 0x87D20782E4866389  # -fq_modulus^(-1) mod 2^64

# BN254 Fr (scalar field) parameters
fr_modulus = [
    0x43E1F593F0000001,
    0x2833E84879B97091,
    0xB85045B68181585D,
    0x30644E72E131A029,
]
fr_r_inv = 0xC2E1F593EFFFFFFF  # -fr_modulus^(-1) mod 2^64


def test_field(name: str, modulus: list[int], r_inv: int):
    modulus_int = limbs_to_int(modulus)

    a_int = 12345678901234567890
    b_int = 98765432109876543210

    a_mont = to_montgomery(a_int, modulus_int)
    b_mont = to_montgomery(b_int, modulus_int)

    a_limbs = int_to_limbs(a_mont)
    b_limbs = int_to_limbs(b_mont)

    result_limbs = montgomery_mul(a_limbs, b_limbs, modulus, r_inv)
    result_int = limbs_to_int(result_limbs)

    R = 1 << 256
    r_inv_full = pow(R, -1, modulus_int)
    result_plain = from_montgomery(result_int, modulus_int, r_inv_full)

    expected = (a_int * b_int) % modulus_int

    print(f"=== {name} ===")
    print(f"a = {a_int}")
    print(f"b = {b_int}")
    print(f"a * b mod p = {expected}")
    print(f"montgomery_mul result = {result_plain}")
    print(f"mul match: {result_plain == expected}")

    square_limbs = montgomery_square(a_limbs, modulus, r_inv)
    square_int = limbs_to_int(square_limbs)
    square_plain = from_montgomery(square_int, modulus_int, r_inv_full)
    expected_square = (a_int * a_int) % modulus_int

    print(f"a^2 mod p = {expected_square}")
    print(f"montgomery_square result = {square_plain}")
    print(f"square match: {square_plain == expected_square}")
    print()


if __name__ == "__main__":
    test_field("Fq (base field)", fq_modulus, fq_r_inv)
    test_field("Fr (scalar field)", fr_modulus, fr_r_inv)
