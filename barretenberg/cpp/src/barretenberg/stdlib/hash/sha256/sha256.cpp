// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "sha256.hpp"

#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/plookup/plookup.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/plookup_tables.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/sha256.hpp"

using namespace bb;

namespace bb::stdlib {
using namespace bb::plookup;

constexpr size_t get_num_blocks(const size_t num_bits)
{
    constexpr size_t extra_bits = 65UL;

    return ((num_bits + extra_bits) / 512UL) + ((num_bits + extra_bits) % 512UL > 0);
}

template <typename Builder> void SHA256<Builder>::prepare_constants(std::array<field_t<Builder>, 8>& input)
{
    for (size_t i = 0; i < 8; i++) {
        input[i] = init_constants[i];
    }
}

template <typename Builder>
SHA256<Builder>::sparse_witness_limbs SHA256<Builder>::convert_witness(const field_t<Builder>& w)
{
    typedef field_t<Builder> field_pt;

    sparse_witness_limbs result(w);

    const auto lookup = plookup_read<Builder>::get_lookup_accumulators(MultiTableId::SHA256_WITNESS_INPUT, w);

    result.sparse_limbs = std::array<field_pt, 4>{
        lookup[ColumnIdx::C2][0],
        lookup[ColumnIdx::C2][1],
        lookup[ColumnIdx::C2][2],
        lookup[ColumnIdx::C2][3],
    };
    result.rotated_limbs = std::array<field_pt, 4>{
        lookup[ColumnIdx::C3][0],
        lookup[ColumnIdx::C3][1],
        lookup[ColumnIdx::C3][2],
        lookup[ColumnIdx::C3][3],
    };
    result.has_sparse_limbs = true;

    return result;
}

template <typename Builder>
std::array<field_t<Builder>, 64> SHA256<Builder>::extend_witness(const std::array<field_t<Builder>, 16>& w_in)
{
    typedef field_t<Builder> field_pt;

    Builder* ctx = w_in[0].get_context();

    std::array<SHA256<Builder>::sparse_witness_limbs, 64> w_sparse;
    for (size_t i = 0; i < 16; ++i) {
        w_sparse[i] = SHA256<Builder>::sparse_witness_limbs(w_in[i]);
        if (!ctx && w_in[i].get_context()) {
            ctx = w_in[i].get_context();
        }
    }

    for (size_t i = 16; i < 64; ++i) {
        auto& w_left = w_sparse[i - 15];
        auto& w_right = w_sparse[i - 2];

        if (!w_left.has_sparse_limbs) {
            w_left = convert_witness(w_left.normal);
        }
        if (!w_right.has_sparse_limbs) {
            w_right = convert_witness(w_right.normal);
        }

        std::array<field_pt, 4> left{
            w_left.sparse_limbs[0] * left_multipliers[0],
            w_left.sparse_limbs[1] * left_multipliers[1],
            w_left.sparse_limbs[2] * left_multipliers[2],
            w_left.sparse_limbs[3] * left_multipliers[3],
        };

        std::array<field_pt, 4> right{
            w_right.sparse_limbs[0] * right_multipliers[0],
            w_right.sparse_limbs[1] * right_multipliers[1],
            w_right.sparse_limbs[2] * right_multipliers[2],
            w_right.sparse_limbs[3] * right_multipliers[3],
        };

        const field_pt left_xor_sparse =
            left[0].add_two(left[1], left[2]).add_two(left[3], w_left.rotated_limbs[1]) * fr(4);

        const field_pt xor_result_sparse = right[0]
                                               .add_two(right[1], right[2])
                                               .add_two(right[3], w_right.rotated_limbs[2])
                                               .add_two(w_right.rotated_limbs[3], left_xor_sparse)
                                               .normalize();

        field_pt xor_result = plookup_read<Builder>::read_from_1_to_2_table(SHA256_WITNESS_OUTPUT, xor_result_sparse);

        // TODO NORMALIZE WITH RANGE CHECK

        field_pt w_out_raw = xor_result.add_two(w_sparse[i - 16].normal, w_sparse[i - 7].normal);
        field_pt w_out;
        if (w_out_raw.witness_index == IS_CONSTANT) {
            w_out = field_pt(ctx, fr(w_out_raw.get_value().from_montgomery_form().data[0] & (uint64_t)0xffffffffULL));

        } else {
            w_out = witness_t<Builder>(
                ctx, fr(w_out_raw.get_value().from_montgomery_form().data[0] & (uint64_t)0xffffffffULL));
            static constexpr fr inv_pow_two = fr(2).pow(32).invert();
            // If we multiply the field elements by constants separately and then subtract, then the divisor is
            // going to be in a normalized state right after subtraction and the call to .normalize() won't add
            // gates
            field_pt w_out_raw_inv_pow_two = w_out_raw * inv_pow_two;
            field_pt w_out_inv_pow_two = w_out * inv_pow_two;
            field_pt divisor = (w_out_raw_inv_pow_two - w_out_inv_pow_two).normalize();
            ctx->create_new_range_constraint(divisor.witness_index, 3);
        }

        w_sparse[i] = sparse_witness_limbs(w_out);
    }

    std::array<field_pt, 64> w_extended;

    for (size_t i = 0; i < 64; ++i) {
        w_extended[i] = w_sparse[i].normal;
    }
    return w_extended;
}

template <typename Builder>
SHA256<Builder>::sparse_value SHA256<Builder>::map_into_choose_sparse_form(const field_t<Builder>& e)
{
    sparse_value result;
    result.normal = e;
    result.sparse = plookup_read<Builder>::read_from_1_to_2_table(SHA256_CH_INPUT, e);

    return result;
}

template <typename Builder>
SHA256<Builder>::sparse_value SHA256<Builder>::map_into_maj_sparse_form(const field_t<Builder>& e)
{
    sparse_value result;
    result.normal = e;
    result.sparse = plookup_read<Builder>::read_from_1_to_2_table(SHA256_MAJ_INPUT, e);

    return result;
}

template <typename Builder>
field_t<Builder> SHA256<Builder>::choose(sparse_value& e, const sparse_value& f, const sparse_value& g)
{
    typedef field_t<Builder> field_pt;

    const auto lookup = plookup_read<Builder>::get_lookup_accumulators(SHA256_CH_INPUT, e.normal);
    const auto rotation_coefficients = sha256_tables::get_choose_rotation_multipliers();

    field_pt rotation_result = lookup[ColumnIdx::C3][0];

    e.sparse = lookup[ColumnIdx::C2][0];

    field_pt sparse_limb_3 = lookup[ColumnIdx::C2][2];

    // where is the middle limb used
    field_pt xor_result = (rotation_result * fr(7))
                              .add_two(e.sparse * (rotation_coefficients[0] * fr(7) + fr(1)),
                                       sparse_limb_3 * (rotation_coefficients[2] * fr(7)));

    field_pt choose_result_sparse = xor_result.add_two(f.sparse + f.sparse, g.sparse + g.sparse + g.sparse).normalize();

    field_pt choose_result = plookup_read<Builder>::read_from_1_to_2_table(SHA256_CH_OUTPUT, choose_result_sparse);

    return choose_result;
}

template <typename Builder>
field_t<Builder> SHA256<Builder>::majority(sparse_value& a, const sparse_value& b, const sparse_value& c)
{
    typedef field_t<Builder> field_pt;

    const auto lookup = plookup_read<Builder>::get_lookup_accumulators(SHA256_MAJ_INPUT, a.normal);
    const auto rotation_coefficients = sha256_tables::get_majority_rotation_multipliers();

    field_pt rotation_result =
        lookup[ColumnIdx::C3][0]; // last index of first row gives accumulating sum of "non-trival" wraps
    a.sparse = lookup[ColumnIdx::C2][0];
    // use these values to compute trivial wraps somehow
    field_pt sparse_accumulator_2 = lookup[ColumnIdx::C2][1];

    field_pt xor_result = (rotation_result * fr(4))
                              .add_two(a.sparse * (rotation_coefficients[0] * fr(4) + fr(1)),
                                       sparse_accumulator_2 * (rotation_coefficients[1] * fr(4)));

    field_pt majority_result_sparse = xor_result.add_two(b.sparse, c.sparse).normalize();

    field_pt majority_result = plookup_read<Builder>::read_from_1_to_2_table(SHA256_MAJ_OUTPUT, majority_result_sparse);

    return majority_result;
}

template <typename Builder>
field_t<Builder> SHA256<Builder>::add_normalize(const field_t<Builder>& a, const field_t<Builder>& b)
{
    typedef field_t<Builder> field_pt;
    typedef witness_t<Builder> witness_pt;

    Builder* ctx = a.get_context() ? a.get_context() : b.get_context();

    uint256_t sum = a.get_value() + b.get_value();

    uint256_t normalized_sum = static_cast<uint32_t>(sum.data[0]);

    if (a.witness_index == IS_CONSTANT && b.witness_index == IS_CONSTANT) {
        return field_pt(ctx, normalized_sum);
    }

    field_pt overflow = witness_pt(ctx, fr((sum - normalized_sum) >> 32));

    field_pt result = a.add_two(b, overflow * field_pt(ctx, -fr((uint64_t)(1ULL << 32ULL))));
    // Has to be a byte?
    overflow.create_range_constraint(3);
    return result;
}

template <typename Builder>
std::array<field_t<Builder>, 8> SHA256<Builder>::sha256_block(const std::array<field_t<Builder>, 8>& h_init,
                                                              const std::array<field_t<Builder>, 16>& input)
{
    typedef field_t<Builder> field_pt;
    /**
     * Initialize round variables with previous block output
     **/
    /**
     * We can initialize round variables a and c and put value h_init[0] and
     * h_init[4] in .normal, and don't do lookup for maj_output, because majority and choose
     * functions will do that in the next step
     **/
    sparse_value a = sparse_value(h_init[0]);
    auto b = map_into_maj_sparse_form(h_init[1]);
    auto c = map_into_maj_sparse_form(h_init[2]);
    sparse_value d = sparse_value(h_init[3]);
    sparse_value e = sparse_value(h_init[4]);
    auto f = map_into_choose_sparse_form(h_init[5]);
    auto g = map_into_choose_sparse_form(h_init[6]);
    sparse_value h = sparse_value(h_init[7]);

    /**
     * Extend witness
     **/
    const auto w = extend_witness(input);

    /**
     * Apply SHA-256 compression function to the message schedule
     **/
    // As opposed to standard sha description - Maj and Choose functions also include required rotations for round
    for (size_t i = 0; i < 64; ++i) {
        auto ch = choose(e, f, g);
        auto maj = majority(a, b, c);
        auto temp1 = ch.add_two(h.normal, w[i] + fr(round_constants[i]));

        h = g;
        g = f;
        f = e;
        e.normal = add_normalize(d.normal, temp1);
        d = c;
        c = b;
        b = a;
        a.normal = add_normalize(temp1, maj);
    }

    /**
     * Add into previous block output and return
     **/
    std::array<field_pt, 8> output;
    output[0] = add_normalize(a.normal, h_init[0]);
    output[1] = add_normalize(b.normal, h_init[1]);
    output[2] = add_normalize(c.normal, h_init[2]);
    output[3] = add_normalize(d.normal, h_init[3]);
    output[4] = add_normalize(e.normal, h_init[4]);
    output[5] = add_normalize(f.normal, h_init[5]);
    output[6] = add_normalize(g.normal, h_init[6]);
    output[7] = add_normalize(h.normal, h_init[7]);

    /**
     * At this point, a malicilous prover could tweak the add_normalise function and the result could be
     * 'overflowed'. Thus, we need 32-bit range checks on the outputs. Note that we won't need range checks while
     * applying the SHA-256 compression function because the outputs of the lookup table ensures that the output is
     * contrained to 32 bits.
     */
    for (size_t i = 0; i < 8; i++) {
        output[i].create_range_constraint(32);
    }

    return output;
}

template <typename Builder> byte_array<Builder> SHA256<Builder>::hash(const byte_array_ct& input)
{
    Builder* ctx = input.get_context();
    std::vector<field_ct> message_schedule;
    const size_t message_length_bytes = input.size();

    for (size_t idx = 0; idx < message_length_bytes; idx++) {
        message_schedule.push_back(input[idx]);
    }

    message_schedule.push_back(field_ct(ctx, 128));

    constexpr size_t bytes_per_block = 64;
    // Include message length
    const size_t num_bytes = message_schedule.size() + 8;
    const size_t num_blocks = num_bytes / bytes_per_block + (num_bytes % bytes_per_block != 0);

    const size_t num_total_bytes = num_blocks * bytes_per_block;
    // Pad with zeroes to make the number divisible by 64
    for (size_t i = num_bytes; i < num_total_bytes; ++i) {
        message_schedule.push_back(field_ct(ctx, 0));
    }

    // Append the message length bits represented as a byte array of length 8.
    const size_t message_bits = message_length_bytes * 8;
    byte_array_ct message_length_byte_decomposition(field_ct(message_bits), 8);

    for (size_t idx = 0; idx < 8; idx++) {
        message_schedule.push_back(message_length_byte_decomposition[idx]);
    }

    // Compute 4-byte slices
    std::vector<field_ct> slices;

    for (size_t i = 0; i < message_schedule.size(); i += 4) {
        std::vector<field_ct> chunk;
        for (size_t j = 0; j < 4; ++j) {
            const size_t shift = 8 * (3 - j);
            chunk.push_back(message_schedule[i + j] * field_ct(ctx, uint256_t(1) << shift));
        }
        slices.push_back(field_ct::accumulate(chunk));
    }

    constexpr size_t slices_per_block = 16;

    std::array<field_ct, 8> rolling_hash;
    prepare_constants(rolling_hash);
    for (size_t i = 0; i < num_blocks; ++i) {
        std::array<field_ct, 16> hash_input;
        for (size_t j = 0; j < 16; ++j) {
            hash_input[j] = slices[i * slices_per_block + j];
        }
        rolling_hash = sha256_block(rolling_hash, hash_input);
    }

    std::vector<field_ct> output;
    // Each element of rolling_hash is a 4-byte field_t, decompose rolling hash into bytes.
    for (const auto& word : rolling_hash) {
        // This constructor constrains
        // - word length to be <=4 bytes
        // - the element reconstructed from bytes is equal to the given input.
        // - each entry to be a byte
        byte_array_ct word_byte_decomposition(word, 4);
        for (size_t i = 0; i < 4; i++) {
            output.push_back(word_byte_decomposition[i]);
        }
    }
    //
    return byte_array<Builder>(ctx, output);
}

template class SHA256<bb::UltraCircuitBuilder>;
template class SHA256<bb::MegaCircuitBuilder>;

} // namespace bb::stdlib
