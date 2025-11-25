// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "../../primitives/field/field.hpp"
#include "barretenberg/numeric/bitop/sparse_form.hpp"
#include "barretenberg/stdlib/hash/blake2s/blake_util.hpp"
#include "barretenberg/stdlib/primitives/byte_array/byte_array.hpp"

namespace bb::stdlib {

template <typename Builder> class Blake2b {
    using field_ct = field_t<Builder>;
    using byte_array_ct = byte_array<Builder>;
    using bool_ct = bool_t<Builder>;
    using witness_ct = witness_t<Builder>;

    static constexpr uint64_t blake2b_IV[8] = { 0x6a09e667f3bcc908ULL, 0xbb67ae8584caa73bULL, 0x3c6ef372fe94f82bULL,
                                                0xa54ff53a5f1d36f1ULL, 0x510e527fade682d1ULL, 0x9b05688c2b3e6c1fULL,
                                                0x1f83d9abfb41bd6bULL, 0x5be0cd19137e2179ULL };

    static constexpr uint64_t initial_H[8] = {
        0x6a09e667f2bdc948ULL, 0xbb67ae8584caa73bULL, 0x3c6ef372fe94f82bULL, 0xa54ff53a5f1d36f1ULL,
        0x510e527fade682d1ULL, 0x9b05688c2b3e6c1fULL, 0x1f83d9abfb41bd6bULL, 0x5be0cd19137e2179ULL,
    };

    static constexpr size_t BLAKE2B_STATE_SIZE = stdlib::blake_util::BLAKE_STATE_SIZE;
    static constexpr uint32_t BLAKE2B_BLOCKBYTES = 128;

    struct blake2b_state {
        field_t<Builder> h[8];
        field_t<Builder> t[2];
        field_t<Builder> f[2];
    };

    static void increment_counter(blake2b_state& S, const uint64_t inc);
    static void compress(blake2b_state& S, byte_array_ct const& in);
    static void blake2b(blake2b_state& S, byte_array_ct const& in);

  public:
    static byte_array_ct hash(const byte_array_ct& input);
};

} // namespace bb::stdlib
