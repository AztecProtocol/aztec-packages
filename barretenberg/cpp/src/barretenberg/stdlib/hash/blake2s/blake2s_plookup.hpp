// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "../../primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "../../primitives/field/field.hpp"
#include "barretenberg/numeric/bitop/sparse_form.hpp"
#include "barretenberg/stdlib/primitives/byte_array/byte_array.hpp"

namespace bb::stdlib {

template <typename Builder> class Blake2s {
    using field_ct = field_t<Builder>;
    using byte_array_ct = byte_array<Builder>;

    static constexpr std::array<uint32_t, 8> blake2s_IV{ 0x6A09E667UL, 0xBB67AE85UL, 0x3C6EF372UL, 0xA54FF53AUL,
                                                         0x510E527FUL, 0x9B05688CUL, 0x1F83D9ABUL, 0x5BE0CD19UL };

    static constexpr std::array<uint32_t, 8> initial_H{
        0x6b08e647, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    };

    enum blake2s_constant {
        BLAKE2S_BLOCKBYTES = 64,
        BLAKE2S_OUTBYTES = 32,
        BLAKE2S_KEYBYTES = 32,
        BLAKE2S_SALTBYTES = 8,
        BLAKE2S_PERSONALBYTES = 8
    };

    struct blake2s_state {
        std::array<field_ct, 8> h;
        std::array<field_ct, 2> t;
        std::array<field_ct, 2> f;
    };

    static void increment_counter(blake2s_state& S, const uint32_t inc);
    static void compress(blake2s_state& S, byte_array_ct const& in);
    static void blake2s(blake2s_state& S, byte_array_ct const& in);

  public:
    static byte_array_ct hash(const byte_array_ct& input);
};

} // namespace bb::stdlib
