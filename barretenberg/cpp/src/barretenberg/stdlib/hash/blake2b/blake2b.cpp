// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/stdlib/hash/blake2b/blake2b.hpp"
#include "barretenberg/stdlib/hash/blake2s/blake_util.hpp"
#include "barretenberg/stdlib/primitives/plookup/plookup.hpp"

/**
 * Blake2b implementation for circuit constraints
 *
 * Optimizations:
 * 1. Use lookup tables for 64-bit XOR and rotation operations
 * 2. Replace use of uint64 with basic field_t type
 * 3. Constrain 64-bit operations using 11-slice decomposition (10×6 bits + 1×4 bits)
 *
 **/
namespace bb::stdlib {

/**
 * The blake2b_state consists of the following components:
 * h: A 128-byte chain value decomposed as (h_0, h_1, ..., h_7), each h_i is a 64-bit number.
 *    It forms the first two rows of the internal state matrix v of the compression function G.
 *
 * t: It is a counter (t_0 lsb and t_1 msb) used in the initialization of the internal state v.
 *
 * f: f_0 and f_1 are finalization flags used in the initialization of the internal state v.
 *           /  0xfff...ff   if the block processed is the last
 *    f_0 = |
 *           \  0x000...00   otherwise
 *           /  0xfff...ff   if the last node is processed in merkle-tree hashing
 *    f_1 = |
 *           \  0x000...00   otherwise
 *
 * Further, the internal state 4x4 matrix used by the compression function is denoted by v.
 * The input data is stored in the 16-word message m (each word is 64 bits).
 */

template <typename Builder> void Blake2b<Builder>::increment_counter(blake2b_state& S, const uint64_t inc)
{
    field_ct inc_scalar(static_cast<uint256_t>(inc));

    // Note that the initial blake2b_state values are circuit constants.
    S.t[0] = S.t[0] + inc_scalar;

    // Note that although blake2b_state is a circuit constant, we use designated functions such as
    // `ranged_less_than` to enforce constraints as appropriate.
    bool_ct to_inc = S.t[0].template ranged_less_than<64>(inc_scalar);
    S.t[1] = S.t[1] + field_ct(to_inc);
}

template <typename Builder> void Blake2b<Builder>::compress(blake2b_state& S, byte_array_ct const& in)
{
    using plookup::ColumnIdx;
    using namespace blake_util;
    Builder* ctx = in.get_context();
    field_ct m[BLAKE2B_STATE_SIZE];
    field_ct v[BLAKE2B_STATE_SIZE];

    // Extract 64-bit words from byte array (16 words × 8 bytes = 128 bytes)
    for (size_t i = 0; i < BLAKE2B_STATE_SIZE; ++i) {
        // Create byte_array from slice, which adds range constraints for each byte
        byte_array_ct word_bytes = in.slice(i * 8, 8).reverse();
        m[i] = static_cast<field_ct>(word_bytes);
    }

    for (size_t i = 0; i < 8; ++i) {
        v[i] = S.h[i];
    }

    v[8] = field_ct(ctx, uint256_t(blake2b_IV[0]));
    v[9] = field_ct(ctx, uint256_t(blake2b_IV[1]));
    v[10] = field_ct(ctx, uint256_t(blake2b_IV[2]));
    v[11] = field_ct(ctx, uint256_t(blake2b_IV[3]));

    // Use the lookup tables to perform XORs for initialization
    const auto lookup_1 =
        plookup_read<Builder>::get_lookup_accumulators(BLAKE2B_XOR, S.t[0], field_ct(uint256_t(blake2b_IV[4])), true);
    v[12] = lookup_1[ColumnIdx::C3][0];
    const auto lookup_2 =
        plookup_read<Builder>::get_lookup_accumulators(BLAKE2B_XOR, S.t[1], field_ct(uint256_t(blake2b_IV[5])), true);
    v[13] = lookup_2[ColumnIdx::C3][0];
    const auto lookup_3 =
        plookup_read<Builder>::get_lookup_accumulators(BLAKE2B_XOR, S.f[0], field_ct(uint256_t(blake2b_IV[6])), true);
    v[14] = lookup_3[ColumnIdx::C3][0];
    const auto lookup_4 =
        plookup_read<Builder>::get_lookup_accumulators(BLAKE2B_XOR, S.f[1], field_ct(uint256_t(blake2b_IV[7])), true);
    v[15] = lookup_4[ColumnIdx::C3][0];

    // Blake2b uses 12 rounds (vs 10 for Blake2s)
    for (size_t idx = 0; idx < 12; idx++) {
        blake_util::round_fn_blake2b(v, m, idx);
    }

    // At this point in the algorithm, the elements (v0, v1, v2, v3) and (v8, v9, v10, v11) in the state matrix 'v' can
    // be 'overflowed' i.e. contain values > 2^{64}. However we do NOT need to normalize them to be < 2^{64}, the
    // following `get_lookup_accumulators` calls correctly constrain the output to be 64-bits
    for (size_t i = 0; i < 8; ++i) {
        const auto lookup_a = plookup_read<Builder>::get_lookup_accumulators(BLAKE2B_XOR, S.h[i], v[i], true);
        const auto lookup_b =
            plookup_read<Builder>::get_lookup_accumulators(BLAKE2B_XOR, lookup_a[ColumnIdx::C3][0], v[i + 8], true);
        S.h[i] = lookup_b[ColumnIdx::C3][0];
    }
}

template <typename Builder> void Blake2b<Builder>::blake2b(blake2b_state& S, byte_array_ct const& in)
{
    using plookup::ColumnIdx;
    using namespace blake_util;

    size_t offset = 0;
    size_t size = in.size();

    while (size > BLAKE2B_BLOCKBYTES) {
        increment_counter(S, BLAKE2B_BLOCKBYTES);
        compress(S, in.slice(offset, BLAKE2B_BLOCKBYTES));
        offset += BLAKE2B_BLOCKBYTES;
        size -= BLAKE2B_BLOCKBYTES;
    }

    // Set last block.
    Builder* ctx = in.get_context();
    S.f[0] = field_t<Builder>(ctx, uint256_t((uint64_t)-1));

    // Build final block: remaining input + constant padding
    auto remaining = in.slice(offset);

    // Combine remaining bytes and constant padding (no constraints needed for constants)
    byte_array_ct final = remaining; // Copy constrained remaining bytes
    byte_array_ct padding = byte_array_ct::constant_padding(ctx, BLAKE2B_BLOCKBYTES - size);
    final.write(padding);

    increment_counter(S, static_cast<uint64_t>(size));
    compress(S, final);
}

template <typename Builder> byte_array<Builder> Blake2b<Builder>::hash(const byte_array_ct& input)
{
    blake2b_state S;

    Builder* ctx = input.get_context();

    for (size_t i = 0; i < 8; i++) {
        S.h[i] = field_ct(ctx, uint256_t(initial_H[i]));
    }
    S.t[0] = field_ct(ctx, uint256_t(0));
    S.t[1] = field_ct(ctx, uint256_t(0));
    S.f[0] = field_ct(ctx, uint256_t(0));
    S.f[1] = field_ct(ctx, uint256_t(0));

    blake2b(S, input);

    // Build result from state values (8 words × 8 bytes = 64 bytes output)
    byte_array_ct result = byte_array_ct::constant_padding(input.get_context(), 0);
    for (const auto& h : S.h) {
        // byte_array_ct(field, num_bytes) constructor adds range constraints for each byte
        byte_array_ct v(h, 8);
        auto reversed = v.reverse();
        result.write(reversed);
    }
    return result;
}

template class Blake2b<UltraCircuitBuilder>;
template class Blake2b<MegaCircuitBuilder>;

} // namespace bb::stdlib
