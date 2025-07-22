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

template <typename Builder> class Blake2s {
    using field_ct = field_t<Builder>;
    using byte_array_ct = byte_array<Builder>;

    static constexpr uint32_t blake2s_IV[8] = { 0x6A09E667UL, 0xBB67AE85UL, 0x3C6EF372UL, 0xA54FF53AUL,
                                                0x510E527FUL, 0x9B05688CUL, 0x1F83D9ABUL, 0x5BE0CD19UL };

    static constexpr uint32_t initial_H[8] = {
        0x6b08e647, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    };

    static constexpr size_t BLAKE2S_STATE_SIZE = stdlib::blake_util::BLAKE_STATE_SIZE;
    static constexpr uint32_t BLAKE2S_BLOCKBYTES = 64;

    struct blake2s_state {
        field_t<Builder> h[8];
        field_t<Builder> t[2];
        field_t<Builder> f[2];
    };

    static void increment_counter(blake2s_state& S, const uint32_t inc);
    static void compress(blake2s_state& S, byte_array_ct const& in);
    static void blake2s(blake2s_state& S, byte_array_ct const& in);

  public:
    static byte_array_ct hash(const byte_array_ct& input);
};

} // namespace bb::stdlib
