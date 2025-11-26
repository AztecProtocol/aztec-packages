// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/stdlib/primitives/plookup/plookup.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/plookup_tables.hpp"

namespace bb::stdlib::blake_util {

using namespace bb::plookup;

// constants
enum blake_constant { BLAKE_STATE_SIZE = 16 };

constexpr uint8_t MSG_SCHEDULE_BLAKE3[7][16] = {
    { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 }, { 2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8 },
    { 3, 4, 10, 12, 13, 2, 7, 14, 6, 5, 9, 0, 11, 15, 8, 1 }, { 10, 7, 12, 9, 14, 3, 13, 15, 4, 0, 11, 2, 5, 8, 1, 6 },
    { 12, 13, 9, 11, 15, 10, 14, 8, 7, 2, 5, 3, 0, 1, 6, 4 }, { 9, 14, 11, 5, 8, 12, 15, 1, 13, 3, 0, 10, 2, 6, 4, 7 },
    { 11, 15, 5, 0, 1, 9, 8, 6, 14, 10, 2, 12, 3, 4, 7, 13 },
};

constexpr uint8_t MSG_SCHEDULE_BLAKE2[10][16] = {
    { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 }, { 14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3 },
    { 11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4 }, { 7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8 },
    { 9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13 }, { 2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9 },
    { 12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11 }, { 13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10 },
    { 6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5 }, { 10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0 },
};

// Blake2b uses 12 rounds with the same message schedule (cycles every 10 rounds)
constexpr uint8_t MSG_SCHEDULE_BLAKE2B[12][16] = {
    { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 }, { 14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3 },
    { 11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4 }, { 7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8 },
    { 9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13 }, { 2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9 },
    { 12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11 }, { 13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10 },
    { 6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5 }, { 10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0 },
    { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 }, { 14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3 },
};

/**
 * Addition with normalisation (to ensure the addition is in the scalar field.)
 * Given two field_t elements a and b, this function computes ((a + b) % 2^{32}).
 * Additionally, it checks if the overflow of the addition is a maximum of 3 bits.
 * This is to ascertain that the additions of two 32-bit scalars in blake2s and blake3s do not exceed 35 bits.
 */
template <typename Builder> field_t<Builder> add_normalize(const field_t<Builder>& a, const field_t<Builder>& b)
{
    typedef field_t<Builder> field_pt;
    typedef witness_t<Builder> witness_pt;

    Builder* ctx = a.get_context() ? a.get_context() : b.get_context();

    uint256_t sum = a.get_value() + b.get_value();

    uint256_t normalized_sum = static_cast<uint32_t>(sum.data[0]);

    if (a.is_constant() && b.is_constant()) {
        return field_pt(ctx, normalized_sum);
    }

    field_pt overflow = witness_pt(ctx, fr((sum - normalized_sum) >> 32));

    // The overflow here could be of 2 bits because we allow that much overflow in the Blake rounds.
    overflow.create_range_constraint(3);

    // a + b - (overflow * 2^{32})
    field_pt result = a.add_two(b, overflow * field_pt(ctx, -fr((uint64_t)(1ULL << 32ULL))));

    return result;
}

/**
 *
 * Function `G' in the Blake2s and Blake3s algorithm which is the core
 * mixing step with additions, xors and right-rotates. This function is
 * used in  Ultra version (with lookup tables).
 *
 * Inputs: - A pointer to a 16-word `state`,
 *         - indices a, b, c, d,
 *         - addition messages x and y
 *         - boolean `last_update` to make sure addition is normalised only in
 *           last update of the state
 *
 * Gate costs per call to function G in lookup case:
 *
 * Read sequence from table = 6 gates per read => 6 * 4 = 24
 * Addition gates = 4 gates
 * Range gates = 2 gates
 * Addition gate for correct output of XOR rotate 12 = 1 gate
 * Normalizing scaling factors = 2 gates
 *
 * Subtotal = 33 gates
 * Outside rounds, each of Blake2s and Blake3s needs 20 and 24 lookup reads respectively.
 *
 * +-----------+--------------+-----------------------+---------------------------+--------------+
 * |           |  calls to G  | gate count for rounds | gate count outside rounds |    total     |
 * |-----------|--------------|-----------------------|---------------------------|--------------|
 * |  Blake2s  |      80      |        80 * 33        |          20 * 6           |     2760     |
 * |  Blake3s  |      56      |        56 * 33        |          24 * 6           |     1992     |
 * +-----------+--------------+-----------------------+---------------------------+--------------+
 *
 * P.S. This doesn't include some more addition gates required after the rounds.
 *      This cost would be negligible as compared to the above gate counts.
 *
 *
 * NOTE: As a future optimization, the following idea can be used for getting rid of extra addition and multiplication
 * gates by tweaking gate structure. To be implemented later.
 *
 *   q_plookup = 1        | d0 | a0 | d'0 | --  |
 *   q_plookup = 1        | d1 | a1 | d'1 | d2  | <--- set q_arith = 1 and validate d2 - d'5 * scale_factor = 0
 *   q_plookup = 1        | d2 | a2 | d'2 | d'5 |
 *   q_plookup = 1        | d3 | a3 | d'3 | --  |
 *   q_plookup = 1        | d4 | a4 | d'4 | --  |
 *   q_plookup = 1        | d5 | a5 | d'5 | c   |  <---- set q_arith = 1 and validate d'5 * scale_factor + c - c2 =
 * 0. |               | c2  |  <---- this row is start of another lookup table (b ^ c)
 *
 *
 **/
template <typename Builder>
void g(field_t<Builder> state[BLAKE_STATE_SIZE],
       size_t a,
       size_t b,
       size_t c,
       size_t d,
       field_t<Builder> x,
       field_t<Builder> y,
       const bool last_update = false)
{
    typedef field_t<Builder> field_pt;

    // For simplicity, state[a] is written as `a' in comments.
    // a = a + b + x
    state[a] = state[a].add_two(state[b], x);

    // d = (d ^ a).ror(16)
    // Get the lookup accumulator where `lookup_1[ColumnIdx::C3][0]` contains the
    // XORed and rotated (by 16) value scaled by 2^{-16}.
    const auto lookup_1 = plookup_read<Builder>::get_lookup_accumulators(BLAKE_XOR_ROTATE_16, state[d], state[a], true);
    // Compute the scaling factor 2^{32-16} = 2^{16} to get the correct rotated value.
    field_pt scaling_factor_1 = (1 << (32 - 16));
    // Multiply by the scaling factor to get the final rotated value.
    state[d] = lookup_1[ColumnIdx::C3][0] * scaling_factor_1;

    // c = c + d
    state[c] = state[c] + state[d];

    // b = (b ^ c).ror(12)
    // Does not require a special XOR_ROTATE_12 table since we can get the correct value
    // by combining values from BLAKE_XOR table itself.
    // Let u = s_0 + 2^6 * s_1 + 2^{12} * s_2 + 2^{18} * s_3 + 2^{24} * s_4 + 2^{30} * s_5
    // be a 32-bit output of XOR, split into slices s_0, s_1, s_2, s_3, s_4 (6-bits each) and s_5 (5-bit).
    // We want to compute ROTATE_12(u) = s_2 + 2^6 * s_3 + 2^{12} * s_4 + 2^{18} * s_5 + 2^{20} * s_0 + 2^{26} * s_1.
    // The BLAKE_XOR table gives:
    // lookup_2[ColumnIdx::C3][0] = s_0 + 2^6 * s_1 + 2^{12} * s_2 + 2^{18} * s_3 + 2^{24} * s_4 + 2^{30} * s_5 = u.
    // lookup_2[ColumnIdx::C3][2] = s_2 + 2^6 * s_3 + 2^{12} * s_4 + 2^{18} * s_5 (i.e., u without s_0 and s_1).
    // Thus, we can compute ROTATE_12(u) as:
    // ROTATE_12(u) = lookup_2[ColumnIdx::C3][2] + (lookup_2[ColumnIdx::C3][0] - 2^{12} * lookup_2[ColumnIdx::C3][2]) *
    // 2^{20}.

    // Get the lookup accumulator for BLAKE_XOR table where lookup_2[ColumnIdx::C3][0] = u.
    const auto lookup_2 = plookup_read<Builder>::get_lookup_accumulators(BLAKE_XOR, state[b], state[c], true);
    // lookup_2[ColumnIdx::C3][2] = s_2 + 2^6 * s_3 + 2^{12} * s_4 + 2^{18} * s_5 (i.e., u without s_0 and s_1).
    field_pt lookup_output = lookup_2[ColumnIdx::C3][2];
    // Compute 2^{12} * lookup_2[ColumnIdx::C3][2].
    field_pt t2_term = field_pt(1 << 12) * lookup_2[ColumnIdx::C3][2];
    // Compute the final rotated value as described for ROTATE_12(u) above.
    lookup_output += (lookup_2[ColumnIdx::C3][0] - t2_term) * field_pt(1 << 20);
    state[b] = lookup_output;

    // a = a + b + y
    if (!last_update) {
        state[a] = state[a].add_two(state[b], y);
    } else {
        state[a] = add_normalize(state[a], state[b] + y);
    }

    // d = (d ^ a).ror(8)
    // Get the lookup accumulator where `lookup_3[ColumnIdx::C3][0]` contains the
    // XORed and rotated (by 8) value scaled by 2^{-24}.
    const auto lookup_3 = plookup_read<Builder>::get_lookup_accumulators(BLAKE_XOR_ROTATE_8, state[d], state[a], true);
    // Compute the scaling factor 2^{32-8} = 2^{24} to get the correct rotated value.
    field_pt scaling_factor_3 = (1 << (32 - 8));
    // Multiply by the scaling factor to get the final rotated value.
    state[d] = lookup_3[ColumnIdx::C3][0] * scaling_factor_3;

    // c = c + d
    if (!last_update) {
        state[c] = state[c] + state[d];
    } else {
        state[c] = add_normalize(state[c], state[d]);
    }

    // b = (b ^ c).ror(7)
    // Get the lookup accumulator where `lookup_4[ColumnIdx::C3][0]` contains the
    // XORed and rotated (by 7) value scaled by 2^{-25}.
    const auto lookup_4 = plookup_read<Builder>::get_lookup_accumulators(BLAKE_XOR_ROTATE_7, state[b], state[c], true);
    // Compute the scaling factor 2^{32-7} = 2^{25} to get the correct rotated value.
    field_pt scaling_factor_4 = (1 << (32 - 7));
    // Multiply by the scaling factor to get the final rotated value.
    state[b] = lookup_4[ColumnIdx::C3][0] * scaling_factor_4;
}

/*
 * This is the round function used in Blake2s and Blake3s for Ultra.
 * Inputs: - 16-word state
 *         - 16-word msg
 *         - round numbe
 *         - which_blake to choose Blake2 or Blake3 (false -> Blake2)
 */
template <typename Builder>
void round_fn(field_t<Builder> state[BLAKE_STATE_SIZE],
              field_t<Builder> msg[BLAKE_STATE_SIZE],
              size_t round,
              const bool which_blake = false)
{
    // Select the message schedule based on the round.
    const uint8_t* schedule = which_blake ? MSG_SCHEDULE_BLAKE3[round] : MSG_SCHEDULE_BLAKE2[round];

    // Mix the columns.
    g<Builder>(state, 0, 4, 8, 12, msg[schedule[0]], msg[schedule[1]]);
    g<Builder>(state, 1, 5, 9, 13, msg[schedule[2]], msg[schedule[3]]);
    g<Builder>(state, 2, 6, 10, 14, msg[schedule[4]], msg[schedule[5]]);
    g<Builder>(state, 3, 7, 11, 15, msg[schedule[6]], msg[schedule[7]]);

    // Mix the rows.
    g<Builder>(state, 0, 5, 10, 15, msg[schedule[8]], msg[schedule[9]], true);
    g<Builder>(state, 1, 6, 11, 12, msg[schedule[10]], msg[schedule[11]], true);
    g<Builder>(state, 2, 7, 8, 13, msg[schedule[12]], msg[schedule[13]], true);
    g<Builder>(state, 3, 4, 9, 14, msg[schedule[14]], msg[schedule[15]], true);
}

/**
 * Addition with normalisation for 64-bit values (Blake2b)
 * Given two field_t elements a and b, this function computes ((a + b) % 2^{64}).
 * Additionally, it checks if the overflow of the addition is a maximum of 3 bits.
 * This is to ascertain that the additions of two 64-bit scalars in blake2b do not exceed 67 bits.
 */
template <typename Builder> field_t<Builder> add_normalize_64(const field_t<Builder>& a, const field_t<Builder>& b)
{
    typedef field_t<Builder> field_pt;
    typedef witness_t<Builder> witness_pt;

    Builder* ctx = a.get_context() ? a.get_context() : b.get_context();

    uint256_t sum = a.get_value() + b.get_value();

    uint256_t normalized_sum = static_cast<uint64_t>(sum.data[0]);

    if (a.is_constant() && b.is_constant()) {
        return field_pt(ctx, normalized_sum);
    }

    field_pt overflow = witness_pt(ctx, fr((sum - normalized_sum) >> 64));

    // The overflow here could be of 2 bits because we allow that much overflow in the Blake rounds.
    overflow.create_range_constraint(3);

    // a + b - (overflow * 2^{64})
    field_pt result = a.add_two(b, overflow * field_pt(ctx, -fr(uint256_t(1) << 64)));

    return result;
}

/**
 * 64-bit bit-decomposition and XOR+rotate helpers for Blake2b
 *
 * These functions implement the same semantics as the Circom Blake2b gadgets:
 * - Decompose a 64-bit word into bits with constraints.
 * - XOR two 64-bit words bitwise.
 * - Rotate a 64-bit bitvector right by a constant amount.
 * - Compute (a ^ b) >>> R as a circuit operation.
 */

// Decompose a 64-bit-limited field element into bits and recompose it.
// This assumes `x` is already treated as a 64-bit word in the algorithm.
template <typename Builder>
static void decompose_64(const field_t<Builder>& x, std::array<bool_t<Builder>, 64>& bits, field_t<Builder>& recomposed)
{
    Builder* ctx = x.get_context();
    field_t<Builder> sum(ctx, 0);
    const field_t<Builder> one(ctx, 1);
    const uint256_t x_value = uint256_t(x.get_value());

    for (size_t i = 0; i < 64; ++i) {
        // Introduce a witness bit and enforce b * (1 - b) = 0 to keep it boolean.
        witness_t<Builder> b_witness(ctx, x_value.get_bit(i));
        field_t<Builder> b_field(b_witness);
        (b_field * (one - b_field)).assert_is_zero();

        bits[i] = bool_t<Builder>::from_witness_index_unsafe(ctx, b_witness.witness_index);
        sum = sum + field_t<Builder>(ctx, uint256_t(1) << i) * b_field;
    }

    // Constrain x == Σ bits[i] * 2^i
    (x - sum).assert_is_zero();
    recomposed = sum;
}

// XOR two 64-bit bit-vectors bitwise.
template <typename Builder>
static std::array<bool_t<Builder>, 64> xor_bits_64(const std::array<bool_t<Builder>, 64>& a,
                                                   const std::array<bool_t<Builder>, 64>& b)
{
    std::array<bool_t<Builder>, 64> out;
    for (size_t i = 0; i < 64; ++i) {
        out[i] = a[i] ^ b[i];
    }
    return out;
}

// XOR two 64-bit words using the plookup XOR table to avoid double bit decompositions.
template <typename Builder> static field_t<Builder> xor_lookup_64(const field_t<Builder>& a, const field_t<Builder>& b)
{
    using plookup::ColumnIdx;
    const auto lookup = plookup_read<Builder>::get_lookup_accumulators(plookup::MultiTableId::BLAKE2B_XOR, a, b, true);
    return lookup[ColumnIdx::C3][0];
}

// Rotate-right by a compile-time constant R on a 64-bit bit-vector.
template <typename Builder, size_t R>
static std::array<bool_t<Builder>, 64> rotate_right_bits_64(const std::array<bool_t<Builder>, 64>& in)
{
    static_assert(R < 64);
    std::array<bool_t<Builder>, 64> out;
    for (size_t i = 0; i < 64; ++i) {
        out[i] = in[(i + R) % 64];
    }
    return out;
}

// Recompose 64 bits into a 64-bit field element.
template <typename Builder>
static field_t<Builder> bits_to_field_64(Builder* ctx, const std::array<bool_t<Builder>, 64>& bits)
{
    field_t<Builder> acc(ctx, 0);
    for (size_t i = 0; i < 64; ++i) {
        acc = acc + field_t<Builder>(ctx, uint256_t(1) << i) * field_t<Builder>(bits[i]);
    }
    return acc;
}

// Compute (a ^ b) >>> R where a,b are 64-bit words.
// This is the circuit analog of the Circom RotXorWordBits template.
template <typename Builder, size_t R>
static field_t<Builder> xor_and_rotate_right_const_64(const field_t<Builder>& a, const field_t<Builder>& b)
{
    Builder* ctx = a.get_context() ? a.get_context() : b.get_context();

    // XOR via lookup (enforces 64-bit slices), then decompose the result once.
    const field_t<Builder> xor_val = xor_lookup_64(a, b);

    std::array<bool_t<Builder>, 64> x_bits;
    field_t<Builder> x_re;
    decompose_64(xor_val, x_bits, x_re);

    // Rotate right by R in the bit domain.
    auto r_bits = rotate_right_bits_64<Builder, R>(x_bits);

    // Recompose rotated bits into a 64-bit word.
    field_t<Builder> out = bits_to_field_64(ctx, r_bits);

    return out;
}

/**
 * Function `G' for Blake2b algorithm using 64-bit words
 * Blake2b uses rotation amounts: 32, 24, 16, 63 (different from Blake2s: 16, 12, 8, 7)
 *
 * This function is used in Ultra version (with lookup tables) for 64-bit operations.
 *
 * Gate costs per call to function G in lookup case for Blake2b:
 * Similar to Blake2s but with 11 slices instead of 6 slices (64 bits vs 32 bits)
 *
 * Read sequence from table = 6 gates per read => 6 * 4 = 24
 * Addition gates = 4 gates
 * Range gates = 2 gates
 * Addition gate for correct output of XOR rotate = 1 gate
 * Normalizing scaling factors = 2 gates
 *
 * Subtotal = 33 gates (similar to Blake2s)
 * Blake2b uses 12 rounds (vs 10 for Blake2s), with 8 calls to G per round = 96 calls total
 *
 * Gate count: approximately 96 * 33 = 3168 gates for rounds
 * Plus additional gates for XOR operations outside rounds
 */
template <typename Builder>
void g_blake2b(field_t<Builder> state[BLAKE_STATE_SIZE],
               size_t a,
               size_t b,
               size_t c,
               size_t d,
               field_t<Builder> x,
               field_t<Builder> y,
               const bool /*last_update*/ = false)
{
    // a = a + b + x  (mod 2^64, enforced via add_normalize_64)
    state[a] = add_normalize_64(state[a], state[b]);
    state[a] = add_normalize_64(state[a], x);

    // d = (d ^ a) >>> 32
    state[d] = xor_and_rotate_right_const_64<Builder, 32>(state[d], state[a]);

    // c = c + d
    state[c] = add_normalize_64(state[c], state[d]);

    // b = (b ^ c) >>> 24
    state[b] = xor_and_rotate_right_const_64<Builder, 24>(state[b], state[c]);

    // a = a + b + y
    state[a] = add_normalize_64(state[a], state[b]);
    state[a] = add_normalize_64(state[a], y);

    // d = (d ^ a) >>> 16
    state[d] = xor_and_rotate_right_const_64<Builder, 16>(state[d], state[a]);

    // c = c + d
    state[c] = add_normalize_64(state[c], state[d]);

    // b = (b ^ c) >>> 63
    state[b] = xor_and_rotate_right_const_64<Builder, 63>(state[b], state[c]);
}

/*
 * Round function for Blake2b using 64-bit operations
 * Inputs: - 16-word state (each word is 64 bits)
 *         - 16-word msg (each word is 64 bits)
 *         - round number
 */
template <typename Builder>
void round_fn_blake2b(field_t<Builder> state[BLAKE_STATE_SIZE], field_t<Builder> msg[BLAKE_STATE_SIZE], size_t round)
{
    // Select the message schedule based on the round.
    const uint8_t* schedule = MSG_SCHEDULE_BLAKE2B[round];

    // Mix the columns.
    g_blake2b<Builder>(state, 0, 4, 8, 12, msg[schedule[0]], msg[schedule[1]]);
    g_blake2b<Builder>(state, 1, 5, 9, 13, msg[schedule[2]], msg[schedule[3]]);
    g_blake2b<Builder>(state, 2, 6, 10, 14, msg[schedule[4]], msg[schedule[5]]);
    g_blake2b<Builder>(state, 3, 7, 11, 15, msg[schedule[6]], msg[schedule[7]]);

    // Mix the rows.
    g_blake2b<Builder>(state, 0, 5, 10, 15, msg[schedule[8]], msg[schedule[9]], true);
    g_blake2b<Builder>(state, 1, 6, 11, 12, msg[schedule[10]], msg[schedule[11]], true);
    g_blake2b<Builder>(state, 2, 7, 8, 13, msg[schedule[12]], msg[schedule[13]], true);
    g_blake2b<Builder>(state, 3, 4, 9, 14, msg[schedule[14]], msg[schedule[15]], true);
}

} // namespace bb::stdlib::blake_util
