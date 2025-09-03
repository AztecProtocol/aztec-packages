// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "blake3s.hpp"
#include "barretenberg/stdlib/primitives/plookup/plookup.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/plookup_tables.hpp"

namespace bb::stdlib {

using namespace blake_util;

/*
 * Core Blake3s functions. These are similar to that of Blake2s except for a few
 * constant parameters and fewer rounds.
 *
 */
template <typename Builder>
void Blake3s<Builder>::compress_pre(field_t<Builder> state[BLAKE3_STATE_SIZE],
                                    const field_t<Builder> cv[8],
                                    const byte_array<Builder>& block,
                                    uint8_t block_len,
                                    uint8_t flags)
{
    field_ct block_words[BLAKE3_STATE_SIZE];
    for (size_t i = 0; i < BLAKE3_STATE_SIZE; ++i) {
        block_words[i] = field_ct(block.slice(i * 4, 4).reverse());
    }

    state[0] = cv[0];
    state[1] = cv[1];
    state[2] = cv[2];
    state[3] = cv[3];
    state[4] = cv[4];
    state[5] = cv[5];
    state[6] = cv[6];
    state[7] = cv[7];
    state[8] = field_ct(block.get_context(), uint256_t(IV[0]));
    state[9] = field_ct(block.get_context(), uint256_t(IV[1]));
    state[10] = field_ct(block.get_context(), uint256_t(IV[2]));
    state[11] = field_ct(block.get_context(), uint256_t(IV[3]));
    state[12] = field_ct(block.get_context(), 0);
    state[13] = field_ct(block.get_context(), 0);
    state[14] = field_ct(block.get_context(), uint256_t(block_len));
    state[15] = field_ct(block.get_context(), uint256_t(flags));

    for (size_t idx = 0; idx < 7; idx++) {
        round_fn(state, block_words, idx, true);
    }
}

template <typename Builder>
void Blake3s<Builder>::compress_in_place(field_t<Builder> cv[8],
                                         const byte_array<Builder>& block,
                                         uint8_t block_len,
                                         uint8_t flags)
{
    field_ct state[BLAKE3_STATE_SIZE];
    compress_pre(state, cv, block, block_len, flags);

    /**
     * At this point in the algorithm, a malicious prover could tweak the add_normalise function in `blake_util.hpp` to
     * create unexpected overflow in the state matrix. At the end of the `compress_pre()` function, there might be
     * overflows in the elements of the first and third rows of the state matrix. But this wouldn't be a problem because
     * in the below loop, while reading from the lookup table, we ensure that the overflow is ignored and the result is
     * contrained to 32 bits.
     */
    for (size_t i = 0; i < (BLAKE3_STATE_SIZE >> 1); i++) {
        const auto lookup = plookup_read<Builder>::get_lookup_accumulators(BLAKE_XOR, state[i], state[i + 8], true);
        cv[i] = lookup[ColumnIdx::C3][0];
    }
}

template <typename Builder>
void Blake3s<Builder>::compress_xof(const field_t<Builder> cv[8],
                                    const byte_array<Builder>& block,
                                    uint8_t block_len,
                                    uint8_t flags,
                                    byte_array<Builder>& out)
{
    field_ct state[BLAKE3_STATE_SIZE];

    compress_pre(state, cv, block, block_len, flags);

    /**
     * The same note as in the above `blake3_compress_in_place()` function. Here too, reading from the lookup table
     * ensures that correct 32-bit inputs are used.
     */
    for (size_t i = 0; i < (BLAKE3_STATE_SIZE >> 1); i++) {
        const auto lookup_1 = plookup_read<Builder>::get_lookup_accumulators(BLAKE_XOR, state[i], state[i + 8], true);
        byte_array<Builder> out_bytes_1(lookup_1[ColumnIdx::C3][0], 4);
        out.write_at(out_bytes_1.reverse(), i * 4);

        const auto lookup_2 = plookup_read<Builder>::get_lookup_accumulators(BLAKE_XOR, state[i + 8], cv[i], true);
        byte_array<Builder> out_bytes_2(lookup_2[ColumnIdx::C3][0], 4);
        out.write_at(out_bytes_2.reverse(), (i + 8) * 4);
    }
}

template <typename Builder>
Blake3s<Builder>::output_t Blake3s<Builder>::make_output(const field_t<Builder> input_cv[8],
                                                         const byte_array<Builder>& block,
                                                         uint8_t block_len,
                                                         uint8_t flags)
{
    output_t ret;
    for (size_t i = 0; i < (BLAKE3_OUT_LEN >> 2); ++i) {
        ret.input_cv[i] = input_cv[i];
    }

    ret.block = byte_array_ct(block.get_context(), BLAKE3_BLOCK_LEN);
    for (size_t i = 0; i < BLAKE3_BLOCK_LEN; i++) {
        ret.block[i] = block[i];
    }
    ret.block_len = block_len;
    ret.flags = flags;
    return ret;
}

/*
 * Blake3s wrapper functions.
 *
 */
template <typename Builder> void Blake3s<Builder>::hasher_init(blake3_hasher* self)
{
    for (size_t i = 0; i < (BLAKE3_KEY_LEN >> 2); ++i) {
        self->key[i] = field_ct(uint256_t(IV[i]));
        self->cv[i] = field_ct(uint256_t(IV[i]));
    }
    self->buf = byte_array_ct(self->context, BLAKE3_BLOCK_LEN);
    for (size_t i = 0; i < BLAKE3_BLOCK_LEN; i++) {
        self->buf[i] = field_t<Builder>(self->context, 0);
    }
    self->buf_len = 0;
    self->blocks_compressed = 0;
    self->flags = 0;
}

template <typename Builder>
void Blake3s<Builder>::hasher_update(blake3_hasher* self, const byte_array<Builder>& input, size_t input_len)
{
    if (input_len == 0) {
        return;
    }

    size_t start_counter = 0;
    while (input_len > BLAKE3_BLOCK_LEN) {
        compress_in_place(self->cv,
                          input.slice(start_counter, BLAKE3_BLOCK_LEN),
                          BLAKE3_BLOCK_LEN,
                          self->flags | maybe_start_flag(self));
        self->blocks_compressed = static_cast<uint8_t>(self->blocks_compressed + 1);
        start_counter += BLAKE3_BLOCK_LEN;
        input_len -= BLAKE3_BLOCK_LEN;
    }

    size_t take = BLAKE3_BLOCK_LEN - ((size_t)self->buf_len);
    if (take > input_len) {
        take = input_len;
    }
    for (size_t i = 0; i < take; i++) {
        self->buf[self->buf_len + i] = input[i + start_counter];
    }

    self->buf_len = static_cast<uint8_t>(self->buf_len + (uint8_t)take);
    input_len -= take;
}

template <typename Builder> void Blake3s<Builder>::hasher_finalize(const blake3_hasher* self, byte_array<Builder>& out)
{
    uint8_t block_flags = self->flags | maybe_start_flag(self) | CHUNK_END;
    output_t output = make_output(self->cv, self->buf, self->buf_len, block_flags);

    byte_array_ct wide_buf(out.get_context(), BLAKE3_BLOCK_LEN);
    compress_xof(output.input_cv, output.block, output.block_len, output.flags | ROOT, wide_buf);
    for (size_t i = 0; i < BLAKE3_OUT_LEN; i++) {
        out[i] = wide_buf[i];
    }
}

template <typename Builder> byte_array<Builder> Blake3s<Builder>::hash(const byte_array<Builder>& input)
{
    ASSERT(input.size() <= BLAKE3_CHUNK_LEN,
           "Barretenberg does not support blake3s with input lengths greater than 1024 bytes.");

    blake3_hasher hasher = {};
    hasher.context = input.get_context();
    hasher_init(&hasher);
    hasher_update(&hasher, input, input.size());
    byte_array_ct result(input.get_context(), BLAKE3_OUT_LEN);
    hasher_finalize(&hasher, result);
    return result;
}

template class Blake3s<UltraCircuitBuilder>;
template class Blake3s<MegaCircuitBuilder>;
} // namespace bb::stdlib
