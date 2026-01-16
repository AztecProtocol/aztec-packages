# Keccak Circuit Implementation

## Specification
- NIST FIPS 202: defines Keccak-f[1600] (as KECCAK-p[1600,24]) and the sponge construction.
  - https://nvlpubs.nist.gov/nistpubs/fips/nist.fips.202.pdf

## Overview
Circuit-friendly implementation of **Keccak-f[1600]** permutation using lookup tables and sparse form arithmetic.

Keccak-f[1600] (`keccakf1600(internal)`) operates on a 1600-bit state arranged as 25 lanes of 64 bits in 24 rounds. Each round applies:
1. θ (THETA): column parity mixing
2. ρ (RHO): lane rotations
3. π (PI): lane permutation
4. χ (CHI): non-linear step
5. ι (IOTA): XOR a round constant into lane 0

The implementation uses sparse base-11 representation to implement Keccak’s bitwise logic using cheaper arithmetic operations on digits without generating carries. Instead of representing a 64-bit lane as a binary integer $\sum_{i=0}^{63} b_i \cdot 2^i$, it is represented in a sparse base-11 form as $\sum_{i=0}^{63} b_i \cdot 11^i$. Choosing 11 ensures that when we implement Keccak’s bitwise logic using small arithmetic expressions on digits, the digits don’t produce carries into neighboring positions. During these equivalent sparse form computations, each digit can temporarily take a small value (${0,\dots,10}$), and is then normalized back to ${0,1}$ digitwise using lookup tables.

### Bitwise operations
- XOR can be computed by first adding sparse integers, and then normalizing each digit back to $0/1$ using lookups (even maps to $0$, odd maps to $1$).

    IOTA round XORs a round constant into lane 0 using this sparse base-11 representation.


- CHI round involves the non-linear operation `A XOR (~B AND C)`. In base-11 representation we can perform an equivalent linear operation `1 + 2A - B + C`. The output values will range between $0-4$, and are mapped back into $0-1$ via the `KECCAK_CHI_OUTPUT` lookup table.

### Rotations
- RHO round requires rotating each 64-bit lane by a lane-specific offset. The helper `normalize_and_rotate<lane_index>()` does both by
    - slicing the base-11 integer into chunks,
    - using a RHO lookup to:
        - normalize each chunk, and
        - reorder chunks to get the effect of rotation.

    It also extracts the most significant bit (MSB) of the normalized lane which is used later. This is implemented via the `KECCAK_NORMALIZE_AND_ROTATE` lookup table.
- THETA round involves performing `XOR(A, ROTL(B,1))`-style operations. Instead of using a rotate-by-1, the implementation uses a twisted representation, where $\text{twisted-limb} = (b_{63}) + \sum_{i=0}^{63} b_i * 11^{i + 1}$. For example, if limb's bit ordering is

    [0, b63, ..., b1, b0 ] then, the twisted limb bit ordering is

    [b63, b62, ..., b0, b63].

    Thus, the equivalent of `XOR(A, ROTL(B,1))` in base-11 world is twisted_A * 2 + twisted_B.
    The output of this operation resides in bit-slices 1, ..., 63 which can be extracted by removing the least and most significant slices of the output.
    The THETA round also requires normalization of intermediate values which is performed using the `KECCAK_THETA_OUTPUT` lookup table.


PI round is a pure rearrangement of the 25 lanes and does not add any constraints.




## API
The following is the permutation opcode interface.
```cpp
permutation_opcode(
    std::array<field_ct, NUM_KECCAK_LANES> state, Builder* ctx)
```
Inputs:
- `state`: an array of 25 field elements (`NUM_KECCAK_LANES` = 25), each representing a 64-bit lane of the Keccak state
- `ctx`: the circuit builder context

Outputs:
- Returns an array of 25 field elements, representing the Keccak-f[1600] permuted state in the 64-bit-lane representation.

It does the following.
1. Format input:
Each 64-bit lane is converted into sparse base-11 representation using the `KECCAK_FORMAT_INPUT` lookup table, also producing its MSB.
2. Compute twisted state:
Precompute twisted lanes for THETA.
3. Run `keccakf1600(internal)`: which applies 24 rounds of THETA, RHO, PI, CHI, IOTA.
4. Format output:
Convert sparse lanes back to standard 64-bit-lane values using `KECCAK_FORMAT_OUTPUT`.
