// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "../../primitives/byte_array/byte_array.hpp"
#include "../../primitives/field/field.hpp"
#include "barretenberg/stdlib/hash/blake2s/blake_util.hpp"

namespace bb::stdlib {
template <typename Builder> class Blake3s {
    using byte_array_ct = byte_array<Builder>;
    using field_ct = field_t<Builder>;

/*
 * Constants and more.
 */
#define BLAKE3_VERSION_STRING "0.3.7"

    // internal flags
    enum blake3_flags {
        CHUNK_START = 1 << 0,
        CHUNK_END = 1 << 1,
        PARENT = 1 << 2,
        ROOT = 1 << 3,
        KEYED_HASH = 1 << 4,
        DERIVE_KEY_CONTEXT = 1 << 5,
        DERIVE_KEY_MATERIAL = 1 << 6,
    };
    static constexpr size_t BLAKE3_STATE_SIZE = stdlib::blake_util::BLAKE_STATE_SIZE;
    // constants
    enum blake3s_constant { BLAKE3_KEY_LEN = 32, BLAKE3_OUT_LEN = 32, BLAKE3_BLOCK_LEN = 64, BLAKE3_CHUNK_LEN = 1024 };

    static constexpr std::array<uint32_t, 8> IV{ 0x6A09E667UL, 0xBB67AE85UL, 0x3C6EF372UL, 0xA54FF53AUL,
                                                 0x510E527FUL, 0x9B05688CUL, 0x1F83D9ABUL, 0x5BE0CD19UL };

    struct blake3_hasher {
        field_t<Builder> key[8];
        field_t<Builder> cv[8];
        byte_array<Builder> buf;
        uint8_t buf_len;
        uint8_t blocks_compressed;
        uint8_t flags;
        Builder* context;
    };

    struct output_t {
        field_t<Builder> input_cv[8];
        byte_array<Builder> block;
        uint8_t block_len;
        uint8_t flags;
    };
    static void compress_pre(field_t<Builder> state[BLAKE3_STATE_SIZE],
                             const field_t<Builder> cv[8],
                             const byte_array_ct& block,
                             uint8_t block_len,
                             uint8_t flags);

    static void compress_in_place(field_t<Builder> cv[8], const byte_array_ct& block, uint8_t block_len, uint8_t flags);

    static void compress_xof(
        const field_t<Builder> cv[8], const byte_array_ct& block, uint8_t block_len, uint8_t flags, byte_array_ct& out);

    /*
     * Blake3s helper functions.
     *
     */
    static uint8_t maybe_start_flag(const blake3_hasher* self)
    {
        if (self->blocks_compressed == 0) {
            return CHUNK_START;
        } else {
            return 0;
        }
    }
    static output_t make_output(const field_t<Builder> input_cv[8],
                                const byte_array_ct& block,
                                uint8_t block_len,
                                uint8_t flags);

    static void hasher_init(blake3_hasher* self);

    static void hasher_update(blake3_hasher* self, const byte_array_ct& input, size_t input_len);

    static void hasher_finalize(const blake3_hasher* self, byte_array_ct& out);

  public:
    static byte_array_ct hash(const byte_array_ct& input);
};

} // namespace bb::stdlib
