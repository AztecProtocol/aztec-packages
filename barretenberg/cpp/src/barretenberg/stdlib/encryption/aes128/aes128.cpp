// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Khashayar], commit: 21476601b111f046f023474465598843e4cfd8ac}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "./aes128.hpp"

#include "barretenberg/crypto/aes128/aes128.hpp"
#include "barretenberg/numeric/bitop/sparse_form.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/plookup/plookup.hpp"

#include <span>

using namespace bb::crypto;

namespace bb::stdlib::aes128 {

template <typename Builder> using byte_pair = std::pair<field_t<Builder>, field_t<Builder>>;
template <typename Builder> using state_span = std::span<byte_pair<Builder>, BLOCK_SIZE>;
template <typename Builder> using column_span = std::span<byte_pair<Builder>, COLUMN_SIZE>;
template <typename Builder> using key_span = std::span<field_t<Builder>, EXTENDED_KEY_LENGTH>;
template <typename Builder> using block_span = std::span<field_t<Builder>, BLOCK_SIZE>;
using namespace bb::plookup;

template <typename Builder> field_t<Builder> normalize_sparse_form(Builder*, field_t<Builder>& byte)
{
    auto result = plookup_read<Builder>::read_from_1_to_2_table(AES_NORMALIZE, byte);
    return result;
}

template <typename Builder> byte_pair<Builder> apply_aes_sbox_map(Builder*, field_t<Builder>& input)
{
    return plookup_read<Builder>::read_pair_from_table(AES_SBOX, input);
}

template <typename Builder>
std::array<field_t<Builder>, 16> convert_into_sparse_bytes(Builder* ctx, const field_t<Builder>& block_data)
{
    std::array<field_t<Builder>, 16> sparse_bytes;
    auto block_data_copy = block_data;
    if (block_data.is_constant()) {
        // The algorithm expects that the sparse bytes are witnesses, so the block_data_copy must be a witness
        block_data_copy.convert_constant_to_fixed_witness(ctx);
    }
    // Convert block data into sparse bytes using the AES_INPUT lookup table
    auto lookup = plookup_read<Builder>::get_lookup_accumulators(AES_INPUT, block_data_copy);
    for (size_t i = 0; i < 16; ++i) {
        sparse_bytes[15 - i] = lookup[ColumnIdx::C2][i];
    }
    return sparse_bytes;
}

template <typename Builder> field_t<Builder> convert_from_sparse_bytes(Builder* ctx, block_span<Builder> sparse_bytes)
{
    uint256_t accumulator = 0;
    for (size_t i = 0; i < BLOCK_SIZE; ++i) {
        uint64_t sparse_byte = uint256_t(sparse_bytes[i].get_value()).data[0];
        uint256_t byte = numeric::map_from_sparse_form<AES128_BASE>(sparse_byte);
        accumulator <<= 8;
        accumulator += (byte);
    }

    field_t<Builder> result = witness_t(ctx, fr(accumulator));

    const auto lookup = plookup_read<Builder>::get_lookup_accumulators(AES_INPUT, result);

    for (size_t i = 0; i < BLOCK_SIZE; ++i) {
        sparse_bytes[BLOCK_SIZE - 1 - i].assert_equal(lookup[ColumnIdx::C2][i]);
    }

    return result;
}

/**
 * @brief Expands a 128-bit AES key into the full key schedule (EXTENDED_KEY_LENGTH bytes / 11 round keys).
 *
 * Implements the AES-128 key expansion algorithm (FIPS 197, Section 5.2) in-circuit.
 * The key schedule derives 11 round keys (each 16 bytes) from the original 128-bit key:
 *   - Round key 0: The original key (used before round 1)
 *   - Round keys 1-10: Derived keys for each encryption round
 *
 * Algorithm per word i (where each word is 4 bytes):
 *   - If i % 4 == 0: Apply RotWord (rotate left), SubWord (S-box), and XOR with Rcon[i/4]
 *   - XOR with word[i-4] to produce word[i]
 *
 * The function uses sparse form representation (base-9 digits) for efficient S-box lookups
 * via plookup tables. Sparse form allows the S-box to be computed as a sequence of
 * additions rather than bit manipulations.
 *
 * Normalization: The `add_counts` array tracks how many additions have been accumulated
 * in each sparse byte. When the count exceeds a threshold (3), or when the byte will be
 * used as input to the S-box (indices where (j & 12) == 12), the value is normalized
 * via a plookup to prevent overflow in the sparse representation.
 *
 * @tparam Builder
 * @param ctx Pointer to the circuit builder context
 * @param key The 128-bit encryption key packed into a field element (16 bytes, big-endian)
 * @return std::array<field_t<Builder>, EXTENDED_KEY_LENGTH> The expanded key schedule as EXTENDED_KEY_LENGTH
 * sparse-form bytes
 *
 * @note Round constants array is 0-indexed with a placeholder at index 0 (0x8d = 2^{-1} in GF(2^8))
 *       so that round_constants[i] corresponds to Rcon[i] from FIPS 197.
 */
template <typename Builder>
std::array<field_t<Builder>, EXTENDED_KEY_LENGTH> expand_key(Builder* ctx, const field_t<Builder>& key)
{
    // Round constants (Rcon) from FIPS 197. Index 0 is a placeholder (never used);
    // indices 1-10 are Rcon[1] through Rcon[10] = {0x01, 0x02, 0x04, ..., 0x36}.
    // These are powers of 2 in GF(2^8): Rcon[i] = 2^(i-1) mod P(x).
    constexpr std::array<uint8_t, 11> round_constants = { 0x8d, 0x01, 0x02, 0x04, 0x08, 0x10,
                                                          0x20, 0x40, 0x80, 0x1b, 0x36 };
    const auto sparse_round_constants = [&]() {
        std::array<field_t<Builder>, 11> result;
        for (size_t i = 0; i < 11; ++i) {
            result[i] = field_t<Builder>(ctx, fr(numeric::map_into_sparse_form<AES128_BASE>(round_constants[i])));
        }
        return result;
    }();

    std::array<field_t<Builder>, EXTENDED_KEY_LENGTH> round_key{};
    const auto sparse_key = convert_into_sparse_bytes(ctx, key);

    std::array<field_t<Builder>, 4> temp{};
    std::array<uint64_t, 4> temp_add_counts{};
    // Track the number of additions in each byte to normalize to prevent overflow in the sparse representation
    std::array<uint64_t, EXTENDED_KEY_LENGTH> add_counts{};
    for (size_t i = 0; i < EXTENDED_KEY_LENGTH; ++i) {
        add_counts[i] = 1;
    }

    // For the first round (first 16 bytes of the expanded key), the round key is the same as the original key
    for (size_t i = 0; i < 16; ++i) {
        round_key[i] = sparse_key[i];
    }

    // Ittereate over the 40 words (4 words per round for 10 rounds)
    for (size_t i = 4; i < 44; ++i) {
        size_t k = (i - 1) * 4;
        // Each word is 4 bytes, hence all the operations are done on 4 bytes at a time
        temp_add_counts[0] = add_counts[k + 0];
        temp_add_counts[1] = add_counts[k + 1];
        temp_add_counts[2] = add_counts[k + 2];
        temp_add_counts[3] = add_counts[k + 3];

        temp[0] = round_key[k];
        temp[1] = round_key[k + 1];
        temp[2] = round_key[k + 2];
        temp[3] = round_key[k + 3];

        // If the word index is a multiple of 4, then we need to apply the RotWord and SubWord operations
        if ((i & 0x03) == 0) {
            // Apply the RotWord operation to the 4 bytes
            const auto t = temp[0];
            temp[0] = temp[1];
            temp[1] = temp[2];
            temp[2] = temp[3];
            temp[3] = t;

            // Apply the SubWord operation to the 4 bytes by looking up the S-box value in the AES_SBOX lookup table
            temp[0] = apply_aes_sbox_map(ctx, temp[0]).first;
            temp[1] = apply_aes_sbox_map(ctx, temp[1]).first;
            temp[2] = apply_aes_sbox_map(ctx, temp[2]).first;
            temp[3] = apply_aes_sbox_map(ctx, temp[3]).first;

            // Add the round constant to the word. Since the round constants are 1 byte long we can just add them to the
            // first byte of the word
            temp[0] = temp[0] + sparse_round_constants[i >> 2];
            ++temp_add_counts[0];
        }

        // The index of the expanded key bytes that need to be updated
        size_t j = i * 4;
        // The index if the key bytes corresponding to the previous word
        k = (i - 4) * 4;
        round_key[j] = round_key[k] + temp[0];
        round_key[j + 1] = round_key[k + 1] + temp[1];
        round_key[j + 2] = round_key[k + 2] + temp[2];
        round_key[j + 3] = round_key[k + 3] + temp[3];

        add_counts[j] = add_counts[k] + temp_add_counts[0];
        add_counts[j + 1] = add_counts[k + 1] + temp_add_counts[1];
        add_counts[j + 2] = add_counts[k + 2] + temp_add_counts[2];
        add_counts[j + 3] = add_counts[k + 3] + temp_add_counts[3];

        // Number of additions before we need to normalize the sparse form
        constexpr uint64_t target = 3;
        for (size_t k = 0; k < 4; ++k) {
            // If the number of additions exceeds the target or the byte corresponds to a word index that is a multiple
            // of 4 (i.e. the byte is used as input to the S-box) we normalize the sparse form
            size_t byte_index = j + k;
            if (add_counts[byte_index] > target || (add_counts[byte_index] > 1 && (byte_index & 12) == 12)) {
                round_key[byte_index] = normalize_sparse_form(ctx, round_key[byte_index]);
                // Reset the addition counter
                add_counts[byte_index] = 1;
            }
        }
    }

    return round_key;
}

/**
 * @brief The SHIFTROW() operation as in FIPS 197, Section 5.1.2
 * @details the 16 byte state is seen as a 4x4 matrix of bytes. The operation performs a circular right shift of
 * elements of row i by i positions.
 * @tparam Builder
 * @param state The 16-byte state to shift (modified in place)
 */
template <typename Builder> void shift_rows(state_span<Builder> state)
{
    byte_pair<Builder> temp = state[1];
    state[1] = state[5];
    state[5] = state[9];
    state[9] = state[13];
    state[13] = temp;

    temp = state[2];
    state[2] = state[10];
    state[10] = temp;
    temp = state[6];
    state[6] = state[14];
    state[14] = temp;

    temp = state[3];
    state[3] = state[15];
    state[15] = state[11];
    state[11] = state[7];
    state[7] = temp;
}

/**
 * @brief Performs MixColumns on a single column and adds the round key (FIPS 197, Sections 5.1.3 & 5.1.4).
 *
 * @details MixColumns treats each column as a polynomial over GF(2^8) and multiplies it by a fixed matrix:
 *
 *          | r0 |   | 2  3  1  1 |   | s0 |
 *          | r1 | = | 1  2  3  1 | × | s1 |
 *          | r2 |   | 1  1  2  3 |   | s2 |
 *          | r3 |   | 3  1  1  2 |   | s3 |
 *
 *          In GF(2^8), multiplication by 2 is the "xtime" operation, and multiplication by 3 is xtime(x) ⊕ x.
 *
 *          The byte_pair structure from the S-box lookup contains:
 *            - `.first`  = S(x)                         (the S-box output, i.e., "×1")
 *            - `.second` = S(x) ⊕ xtime(S(x)) = 3·S(x)  (precomputed "×3" value)
 *
 *          To get "×2": Since 3·x = 2·x ⊕ x, we have 2·x = 3·x ⊕ x = `.second` ⊕ `.first`.
 *          In sparse form, ⊕ is represented by addition, so adding `.first` + `.second` and normalizing gives 2·x.
 *
 *          The formulas below use this identity. For example:
 *            r0 = 2·s0 ⊕ 3·s1 ⊕ s2 ⊕ s3
 *               = (s0 ⊕ 3·s0) ⊕ 3·s1 ⊕ s2 ⊕ s3       (since x ⊕ 3x = 2x in GF(2^8))
 *               = s0.first + s0.second + s1.second + s2.first + s3.first
 *
 * @tparam Builder The circuit builder type
 * @param column_pairs Span of 4 byte_pairs representing one column of the state after SubBytes
 * @param round_key The expanded key schedule (EXTENDED_KEY_LENGTH bytes in sparse form)
 * @param round The current round number (1-10), used to index into round_key
 * @param column The column index (0-3), used to offset into round_key
 */
template <typename Builder>
void mix_column_and_add_round_key(column_span<Builder> column_pairs,
                                  key_span<Builder> round_key,
                                  size_t round,
                                  size_t column)
{
    // Intermediate values to reduce the number of additions (optimization)
    // t0 = s0 + s3 + 3·s1
    auto t0 = column_pairs[0].first.add_two(column_pairs[3].first, column_pairs[1].second);
    // t1 = s1 + s2 + 3·s3
    auto t1 = column_pairs[1].first.add_two(column_pairs[2].first, column_pairs[3].second);

    // r0 = 2·s0 ⊕ 3·s1 ⊕ s2 ⊕ s3 = t0 + s2 + 3·s0 = (s0 + 3·s0) + 3·s1 + s2 + s3
    auto r0 = t0.add_two(column_pairs[2].first, column_pairs[0].second);
    // r1 = s0 ⊕ 2·s1 ⊕ 3·s2 ⊕ s3 = t0 + s1 + 3·s2 = s0 + (s1 + 3·s1) + 3·s2 + s3
    auto r1 = t0.add_two(column_pairs[1].first, column_pairs[2].second);
    // r2 = s0 ⊕ s1 ⊕ 2·s2 ⊕ 3·s3 = t1 + s0 + 3·s2 = s0 + s1 + (s2 + 3·s2) + 3·s3
    auto r2 = t1.add_two(column_pairs[0].first, column_pairs[2].second);
    // r3 = 3·s0 ⊕ s1 ⊕ s2 ⊕ 2·s3 = t1 + 3·s0 + s3 = 3·s0 + s1 + s2 + (s3 + 3·s3)
    auto r3 = t1.add_two(column_pairs[0].second, column_pairs[3].first);

    // Round key offset: round * 16 (bytes per round) + column * 4 (bytes per column)
    const size_t key_offset = round * BLOCK_SIZE + column * COLUMN_SIZE;

    // Add round key and store result back (only .first is updated; .second will be recomputed by next SubBytes)
    column_pairs[0].first = r0 + round_key[key_offset];
    column_pairs[1].first = r1 + round_key[key_offset + 1];
    column_pairs[2].first = r2 + round_key[key_offset + 2];
    column_pairs[3].first = r3 + round_key[key_offset + 3];
}

template <typename Builder>
void mix_columns_and_add_round_key(state_span<Builder> state_pairs, key_span<Builder> round_key, size_t round)
{
    mix_column_and_add_round_key<Builder>(state_pairs.template subspan<0, COLUMN_SIZE>(), round_key, round, 0);
    mix_column_and_add_round_key<Builder>(state_pairs.template subspan<4, COLUMN_SIZE>(), round_key, round, 1);
    mix_column_and_add_round_key<Builder>(state_pairs.template subspan<8, COLUMN_SIZE>(), round_key, round, 2);
    mix_column_and_add_round_key<Builder>(state_pairs.template subspan<12, COLUMN_SIZE>(), round_key, round, 3);
}

template <typename Builder> void sub_bytes(Builder* ctx, state_span<Builder> state_pairs)
{
    for (size_t i = 0; i < BLOCK_SIZE; ++i) {
        state_pairs[i] = apply_aes_sbox_map(ctx, state_pairs[i].first);
    }
}

template <typename Builder>
void add_round_key(state_span<Builder> sparse_state, key_span<Builder> sparse_round_key, size_t round)
{
    const size_t key_offset = round * BLOCK_SIZE;
    for (size_t i = 0; i < BLOCK_SIZE; i += COLUMN_SIZE) {
        for (size_t j = 0; j < COLUMN_SIZE; ++j) {
            sparse_state[i + j].first += sparse_round_key[key_offset + i + j];
        }
    }
}

template <typename Builder> void xor_with_iv(state_span<Builder> state, block_span<Builder> iv)
{
    for (size_t i = 0; i < BLOCK_SIZE; ++i) {
        state[i].first += iv[i];
    }
}

template <typename Builder>
void aes128_cipher(Builder* ctx, state_span<Builder> state, key_span<Builder> sparse_round_key)
{
    add_round_key<Builder>(state, sparse_round_key, 0);
    for (size_t i = 0; i < BLOCK_SIZE; ++i) {
        state[i].first = normalize_sparse_form(ctx, state[i].first);
    }

    for (size_t round = 1; round < NUM_ROUNDS; ++round) {
        sub_bytes(ctx, state);
        shift_rows<Builder>(state);
        mix_columns_and_add_round_key<Builder>(state, sparse_round_key, round);
        for (size_t i = 0; i < BLOCK_SIZE; ++i) {
            state[i].first = normalize_sparse_form(ctx, state[i].first);
        }
    }

    sub_bytes(ctx, state);
    shift_rows<Builder>(state);
    add_round_key<Builder>(state, sparse_round_key, NUM_ROUNDS);
}

template <typename Builder>
std::vector<field_t<Builder>> encrypt_buffer_cbc(const std::vector<field_t<Builder>>& input,
                                                 const field_t<Builder>& iv,
                                                 const field_t<Builder>& key)
{
    // Check if all inputs are constants
    bool all_constants = key.is_constant() && iv.is_constant();
    for (const auto& input_block : input) {
        if (!input_block.is_constant()) {
            all_constants = false;
            break;
        }
    }

    if (all_constants) {
        // Compute result directly using native crypto implementation
        std::vector<field_t<Builder>> result;
        std::vector<uint8_t> key_bytes(16);
        std::vector<uint8_t> iv_bytes(16);
        std::vector<uint8_t> input_bytes(input.size() * 16);

        // Convert key to bytes
        uint256_t key_value = key.get_value();
        for (size_t i = 0; i < 16; ++i) {
            key_bytes[15 - i] = static_cast<uint8_t>((key_value >> (i * 8)) & 0xFF);
        }

        // Convert IV to bytes
        uint256_t iv_value = iv.get_value();
        for (size_t i = 0; i < 16; ++i) {
            iv_bytes[15 - i] = static_cast<uint8_t>((iv_value >> (i * 8)) & 0xFF);
        }

        // Convert input blocks to bytes
        for (size_t block_idx = 0; block_idx < input.size(); ++block_idx) {
            uint256_t block_value = input[block_idx].get_value();
            for (size_t i = 0; i < 16; ++i) {
                input_bytes[block_idx * 16 + 15 - i] = static_cast<uint8_t>((block_value >> (i * 8)) & 0xFF);
            }
        }

        // Run native AES encryption
        crypto::aes128_encrypt_buffer_cbc(input_bytes.data(), iv_bytes.data(), key_bytes.data(), input_bytes.size());

        // Convert result back to field elements
        for (size_t block_idx = 0; block_idx < input.size(); ++block_idx) {
            uint256_t result_value = 0;
            for (size_t i = 0; i < 16; ++i) {
                result_value <<= 8;
                result_value += input_bytes[block_idx * 16 + i];
            }
            result.push_back(field_t<Builder>(result_value));
        }

        return result;
    }

    // Find a valid context from any of the inputs
    Builder* ctx = nullptr;
    if (!key.is_constant()) {
        ctx = key.get_context();
    } else if (!iv.is_constant()) {
        ctx = iv.get_context();
    } else {
        for (const auto& input_block : input) {
            if (!input_block.is_constant()) {
                ctx = input_block.get_context();
                break;
            }
        }
    }

    BB_ASSERT(ctx);

    auto round_key = expand_key(ctx, key);
    key_span<Builder> round_key_span{ round_key };

    const size_t num_blocks = input.size();

    std::vector<byte_pair<Builder>> sparse_state;
    for (size_t i = 0; i < num_blocks; ++i) {
        auto bytes = convert_into_sparse_bytes(ctx, input[i]);
        for (const auto& byte : bytes) {
            sparse_state.push_back({ byte, field_t(ctx, fr(0)) });
        }
    }

    auto sparse_iv = convert_into_sparse_bytes(ctx, iv);
    block_span<Builder> sparse_iv_span{ sparse_iv };

    for (size_t i = 0; i < num_blocks; ++i) {
        state_span<Builder> round_state{ &sparse_state[i * BLOCK_SIZE], BLOCK_SIZE };
        xor_with_iv<Builder>(round_state, sparse_iv_span);
        aes128_cipher(ctx, round_state, round_key_span);

        for (size_t j = 0; j < BLOCK_SIZE; ++j) {
            sparse_iv[j] = round_state[j].first;
        }
    }

    std::vector<field_t<Builder>> sparse_output;
    for (auto& element : sparse_state) {
        sparse_output.push_back(normalize_sparse_form(ctx, element.first));
    }

    std::vector<field_t<Builder>> output;
    for (size_t i = 0; i < num_blocks; ++i) {
        block_span<Builder> output_span{ &sparse_output[i * BLOCK_SIZE], BLOCK_SIZE };
        output.push_back(convert_from_sparse_bytes(ctx, output_span));
    }
    return output;
}
// Explicit template instantiations
#define INSTANTIATE_AES128_TEMPLATES(Builder)                                                                          \
    template std::vector<field_t<Builder>> encrypt_buffer_cbc<Builder>(                                                \
        const std::vector<field_t<Builder>>&, const field_t<Builder>&, const field_t<Builder>&);                       \
    template std::array<field_t<Builder>, BLOCK_SIZE> convert_into_sparse_bytes<Builder>(Builder*,                     \
                                                                                         const field_t<Builder>&);     \
    template field_t<Builder> convert_from_sparse_bytes<Builder>(Builder*, std::span<field_t<Builder>, BLOCK_SIZE>)

INSTANTIATE_AES128_TEMPLATES(bb::UltraCircuitBuilder);
INSTANTIATE_AES128_TEMPLATES(bb::MegaCircuitBuilder);

} // namespace bb::stdlib::aes128
