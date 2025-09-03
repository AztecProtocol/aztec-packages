// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "blake_util.hpp"

#include "barretenberg/stdlib/hash/blake2s/blake2s.hpp"
#include "barretenberg/stdlib/primitives/plookup/plookup.hpp"

/**
 * Optimizations:
 *
 * 1. use lookup tables for basic XOR operations
 * 2. replace use of uint32 with basic field_t type
 *
 **/
namespace bb::stdlib {

/**
 * The blake2s_state consists of the following components:
 * h: A 64-byte chain value denoted decomposed as (h_0, h_1, ..., h_7), each h_i is a 32-bit number.
 *    It form the first two rows on the internal state matrix v of the compression function G.
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
 * The input data is stored in the 16-word message m.
 */

template <typename Builder> void Blake2s<Builder>::increment_counter(blake2s_state& S, const uint32_t inc)
{
    field_ct inc_scalar(static_cast<uint256_t>(inc));
    S.t[0] = S.t[0] + inc_scalar;
    // TODO: Secure!? Think so as inc is known at "compile" time as it's derived from the msg length.
    const bool to_inc = uint32_t(uint256_t(S.t[0].get_value())) < inc;
    S.t[1] = S.t[1] + (to_inc ? field_ct(1) : field_ct(0));
}

template <typename Builder> void Blake2s<Builder>::compress(blake2s_state& S, byte_array_ct const& in)
{
    using plookup::ColumnIdx;
    using namespace blake_util;
    field_ct m[BLAKE2S_STATE_SIZE];
    field_ct v[BLAKE2S_STATE_SIZE];

    for (size_t i = 0; i < BLAKE2S_STATE_SIZE; ++i) {
        m[i] = static_cast<field_ct>(in.slice(i * 4, 4).reverse());
    }

    for (size_t i = 0; i < 8; ++i) {
        v[i] = S.h[i];
    }

    v[8] = field_ct(uint256_t(blake2s_IV[0]));
    v[9] = field_ct(uint256_t(blake2s_IV[1]));
    v[10] = field_ct(uint256_t(blake2s_IV[2]));
    v[11] = field_ct(uint256_t(blake2s_IV[3]));

    // Use the lookup tables to perform XORs
    const auto lookup_1 =
        plookup_read<Builder>::get_lookup_accumulators(BLAKE_XOR, S.t[0], field_ct(uint256_t(blake2s_IV[4])), true);
    v[12] = lookup_1[ColumnIdx::C3][0];
    const auto lookup_2 =
        plookup_read<Builder>::get_lookup_accumulators(BLAKE_XOR, S.t[1], field_ct(uint256_t(blake2s_IV[5])), true);
    v[13] = lookup_2[ColumnIdx::C3][0];
    const auto lookup_3 =
        plookup_read<Builder>::get_lookup_accumulators(BLAKE_XOR, S.f[0], field_ct(uint256_t(blake2s_IV[6])), true);
    v[14] = lookup_3[ColumnIdx::C3][0];
    const auto lookup_4 =
        plookup_read<Builder>::get_lookup_accumulators(BLAKE_XOR, S.f[1], field_ct(uint256_t(blake2s_IV[7])), true);
    v[15] = lookup_4[ColumnIdx::C3][0];

    for (size_t idx = 0; idx < 10; idx++) {
        blake_util::round_fn(v, m, idx);
    }

    // At this point in the algorithm, the elements (v0, v1, v2, v3) and (v8, v9, v10, v11) in the state matrix 'v' can
    // be 'overflowed' i.e. contain values > 2^{32}. However we do NOT need to normalize them to be < 2^{32}, the
    // following `read_sequence_from_table` calls correctly constrain the output to be 32-bits
    for (size_t i = 0; i < 8; ++i) {
        const auto lookup_a = plookup_read<Builder>::get_lookup_accumulators(BLAKE_XOR, S.h[i], v[i], true);
        const auto lookup_b =
            plookup_read<Builder>::get_lookup_accumulators(BLAKE_XOR, lookup_a[ColumnIdx::C3][0], v[i + 8], true);
        S.h[i] = lookup_b[ColumnIdx::C3][0];
    }
}

template <typename Builder> void Blake2s<Builder>::blake2s(blake2s_state& S, byte_array_ct const& in)
{
    using plookup::ColumnIdx;
    using namespace blake_util;

    size_t offset = 0;
    size_t size = in.size();

    while (size > BLAKE2S_BLOCKBYTES) {
        increment_counter(S, BLAKE2S_BLOCKBYTES);
        compress(S, in.slice(offset, BLAKE2S_BLOCKBYTES));
        offset += BLAKE2S_BLOCKBYTES;
        size -= BLAKE2S_BLOCKBYTES;
    }

    // Set last block.
    S.f[0] = field_t<Builder>(uint256_t((uint32_t)-1));

    byte_array_ct final(in.get_context());
    final.write(in.slice(offset)).write(byte_array_ct(in.get_context(), BLAKE2S_BLOCKBYTES - size));
    increment_counter(S, static_cast<uint32_t>(size));
    compress(S, final);
}

template <typename Builder> byte_array<Builder> Blake2s<Builder>::hash(const byte_array_ct& input)
{
    blake2s_state S;

    for (size_t i = 0; i < 8; i++) {
        S.h[i] = field_ct(uint256_t(initial_H[i]));
    }

    blake2s(S, input);

    byte_array_ct result(input.get_context());
    for (auto h : S.h) {
        byte_array_ct v(h, 4);
        result.write(v.reverse());
    }
    return result;
}

template class Blake2s<UltraCircuitBuilder>;
template class Blake2s<MegaCircuitBuilder>;

} // namespace bb::stdlib
