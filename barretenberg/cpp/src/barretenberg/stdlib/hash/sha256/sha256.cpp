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

/**
 * @brief Convert a 32-bit witness value to sparse limbs form for message schedule extension
 *
 * This function decomposes a 32-bit value into base-16 sparse limbs and pre-computes
 * rotation offsets needed for the σ₀ and σ₁ functions in SHA-256 message schedule extension:
 *   σ₀(x) = (x >>> 7) ⊕ (x >>> 18) ⊕ (x >> 3)
 *   σ₁(x) = (x >>> 17) ⊕ (x >>> 19) ⊕ (x >> 10)
 *
 * SHA256_WITNESS_INPUT Lookup Table Structure:
 * - Decomposes 32-bit input into 4 slices: [3, 7, 8, 14] bits (total 32 bits)
 * - Column 1 (C1): Accumulates normal form reconstruction (coefficients: 1, 2³, 2¹⁰, 2¹⁸)
 * - Column 2 (C2): Sparse limbs in base-16 (4 limbs covering the 32 bits)
 * - Column 3 (C3): Pre-rotated limbs for efficient rotation computation
 *
 * Limb Structure (base-16):
 * - Each limb represents multiple bits from the original value
 * - Limbs are sized to align with rotation boundaries where possible
 * - The specific slice sizes (3, 7, 8, 14) optimize for the rotation patterns in σ₀ and σ₁
 *
 * @param input The 32-bit field element to convert (typically W[i-15] or W[i-2])
 * @return sparse_witness_limbs
 */
template <typename Builder>
SHA256<Builder>::sparse_witness_limbs SHA256<Builder>::convert_witness(const field_t<Builder>& input)
{
    using field_pt = field_t<Builder>;

    sparse_witness_limbs result(input);
    const auto lookup = plookup_read<Builder>::get_lookup_accumulators(MultiTableId::SHA256_WITNESS_INPUT, input);

    result.sparse_limbs = std::array<field_pt, 4>{
        lookup[ColumnIdx::C2][0],
        lookup[ColumnIdx::C2][1],
        lookup[ColumnIdx::C2][2],
        lookup[ColumnIdx::C2][3],
    };
    result.rotated_limb_corrections = std::array<field_pt, 4>{
        lookup[ColumnIdx::C3][0],
        lookup[ColumnIdx::C3][1],
        lookup[ColumnIdx::C3][2],
        lookup[ColumnIdx::C3][3],
    };
    result.has_sparse_limbs = true;

    return result;
}

/**
 * @brief Extend the 16-word message block to 64 words per SHA-256 specification
 *
 * SHA-256 Spec (FIPS 180-4, Section 6.2.2):
 *   For i = 16 to 63:
 *       W[i] = σ₁(W[i-2]) + W[i-7] + σ₀(W[i-15]) + W[i-16]  (mod 2³²)
 *
 *   where:
 *       σ₀(x) = ROTR⁷(x) ⊕ ROTR¹⁸(x) ⊕ SHR³(x)
 *       σ₁(x) = ROTR¹⁷(x) ⊕ ROTR¹⁹(x) ⊕ SHR¹⁰(x)
 *
 * Circuit Implementation Strategy:
 *   Rather than computing rotations and XORs directly (expensive), we use base-16 sparse form with lookup tables:
 *
 *   1. For W[i-15] and W[i-2], use SHA256_WITNESS_INPUT lookup table to extract:
 *      - Decomposition of 32-bit value into 4 sparse limbs
 *      - Rotated limb correction terms (used in conjunction with rotation multipliers)
 *
 *   2. Compute σ₀ + σ₁ in sparse form:
 *      - Scale σ₀ contribution by 4 (shifts it to upper 2 bits of each base-16 digit)
 *      - Add σ₁ contribution (occupies lower 2 bits of each digit)
 *      - Each digit becomes: 4*σ₀_bit + σ₁_bit ∈ {0,1,...,15}
 *
 *   3. Normalize via SHA256_WITNESS_OUTPUT table: Maps sparse sum to σ₀ + σ₁
 *
 *   4. Add σ₀(W[i-15]) + σ₁(W[i-2]) + W[i-7] + W[i-16] and reduce mod 2³²
 *
 * @param w_in The 16 input message words (512 bits total)
 * @return 64 extended message schedule words
 */
template <typename Builder>
std::array<field_t<Builder>, 64> SHA256<Builder>::extend_witness(const std::array<field_t<Builder>, 16>& w_in)
{
    using field_pt = field_t<Builder>;

    Builder* ctx = w_in[0].get_context();

    std::array<SHA256<Builder>::sparse_witness_limbs, 64> w_sparse;

    // Populate initial 16 words in sparse form from input
    for (size_t i = 0; i < 16; ++i) {
        w_sparse[i] = SHA256<Builder>::sparse_witness_limbs(w_in[i]);
        if ((ctx == nullptr) && w_in[i].get_context()) {
            ctx = w_in[i].get_context();
        }
    }

    // Compute extended words W[16..63]
    for (size_t i = 16; i < 64; ++i) {
        auto& w_left = w_sparse[i - 15];
        auto& w_right = w_sparse[i - 2];

        if (!w_left.has_sparse_limbs) {
            w_left = convert_witness(w_left.normal);
        }
        if (!w_right.has_sparse_limbs) {
            w_right = convert_witness(w_right.normal);
        }

        // Compute the (partially) rotated sparse limbs for σ₀
        // Note: remaining contributions accounted for via w_left.rotated_limb_corrections
        std::array<field_pt, 4> left{
            w_left.sparse_limbs[0] * left_multipliers[0],
            w_left.sparse_limbs[1] * left_multipliers[1],
            w_left.sparse_limbs[2] * left_multipliers[2],
            w_left.sparse_limbs[3] * left_multipliers[3],
        };

        // Compute the (partially) rotated sparse limbs for σ₁
        // Note: remaining contributions accounted for via w_right.rotated_limb_corrections
        std::array<field_pt, 4> right{
            w_right.sparse_limbs[0] * right_multipliers[0],
            w_right.sparse_limbs[1] * right_multipliers[1],
            w_right.sparse_limbs[2] * right_multipliers[2],
            w_right.sparse_limbs[3] * right_multipliers[3],
        };

        // Compute σ₀(w[i-15]) = (x >>> 7) ⊕ (x >>> 18) ⊕ (x >> 3) in sparse form.
        // Each sparse digit holds the sum of contributions from the three rotation/shift operations
        // (digit value in {0,1,2,3}).
        // The fr(4) scaling positions σ₀'s contribution in the upper 2 bits of each 4-bit digit slot:
        // when combined with σ₁ (unscaled, in lower 2 bits), each digit becomes 4*σ₀_digit + σ₁_digit ∈ [0,15].
        const field_pt left_xor_sparse =
            left[0].add_two(left[1], left[2]).add_two(left[3], w_left.rotated_limb_corrections[1]) * fr(4);

        // Compute σ₀(w[i-15]) + σ₁(w[i-2]) where σ₁(x) = (x >>> 17) ⊕ (x >>> 19) ⊕ (x >> 10).
        const field_pt xor_result_sparse = right[0]
                                               .add_two(right[1], right[2])
                                               .add_two(right[3], w_right.rotated_limb_corrections[2])
                                               .add_two(w_right.rotated_limb_corrections[3], left_xor_sparse);

        field_pt xor_result = plookup_read<Builder>::read_from_1_to_2_table(SHA256_WITNESS_OUTPUT, xor_result_sparse);

        // AUDITTODO: What is this TODO referring to?
        // TODO NORMALIZE WITH RANGE CHECK

        // Compute W[i] = σ₁(W[i-2]) + W[i-7] + σ₀(W[i-15]) + W[i-16]
        field_pt w_out_raw = xor_result.add_two(w_sparse[i - 16].normal, w_sparse[i - 7].normal);

        // Natively compute value reduced to 32 bits per SHA-256 spec
        const uint64_t w_out_modded = w_out_raw.get_value().from_montgomery_form().data[0] & 0xffffffffULL;

        field_pt w_out;
        if (w_out_raw.is_constant()) {
            w_out = field_pt(ctx, fr(w_out_modded));
        } else {
            // Establish w_out as the 32-bit reduction of w_out_raw via w_out_raw = w_out + divisor*2^32
            w_out = witness_t<Builder>(ctx, fr(w_out_modded));
            static constexpr fr inv_pow_two = fr(2).pow(32).invert();
            // Implementation note: by multiplying the field elements by constants separately then subtracting, we
            // ensure that the divisor is in a normalized state and subsequent call to .normalize() won't add gates
            field_pt w_out_raw_inv_pow_two = w_out_raw * inv_pow_two;
            field_pt w_out_inv_pow_two = w_out * inv_pow_two;
            field_pt divisor = w_out_raw_inv_pow_two - w_out_inv_pow_two;
            // AUDITTODO: The exact requirement here seems to be 2, not 3. The three inputs to w_out_raw are
            // constrained to 32 bits: xor_result from lookup table, and w[i-16]/w[i-7] from either the original
            // input or previous iterations (where they were constrained by this same range check). Therefore
            // their sum is at most 3*(2^32 - 1), and thus divisor <= 3*(2^32 - 1)/2^32 = 2. Confirm that a 2-bit
            // constraint would suffice.
            divisor.create_range_constraint(3);
        }

        w_sparse[i] = sparse_witness_limbs(w_out);
    }

    std::array<field_pt, 64> w_extended;

    for (size_t i = 0; i < 64; ++i) {
        w_extended[i] = w_sparse[i].normal;
    }
    return w_extended;
}

/**
 * @brief Convert a field element to sparse form for use in the Choose function
 *
 * Performs a lookup to convert a normal 32-bit value to its base-28 sparse representation optimized for the
 * Choose function's rotation requirements.
 *
 * @param input The field element to convert (expected to be a 32-bit value)
 * @return sparse_value containing both normal and sparse representations
 */
template <typename Builder>
SHA256<Builder>::sparse_value SHA256<Builder>::map_into_choose_sparse_form(const field_t<Builder>& input)
{
    sparse_value result;
    result.normal = input;
    result.sparse = plookup_read<Builder>::read_from_1_to_2_table(SHA256_CH_INPUT, input);

    return result;
}

/**
 * @brief Convert a field element to sparse form for use in the Majority function
 *
 * Performs a lookup to convert a normal 32-bit value to its base-16 sparse representation optimized for the
 * Majority function's rotation requirements.
 *
 * @param input The field element to convert (expected to be a 32-bit value)
 * @return sparse_value containing both normal and sparse representations
 */
template <typename Builder>
SHA256<Builder>::sparse_value SHA256<Builder>::map_into_maj_sparse_form(const field_t<Builder>& input)
{
    sparse_value result;
    result.normal = input;
    result.sparse = plookup_read<Builder>::read_from_1_to_2_table(SHA256_MAJ_INPUT, input);

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

    field_pt choose_result_sparse = xor_result.add_two(f.sparse + f.sparse, g.sparse + g.sparse + g.sparse);

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

    field_pt majority_result_sparse = xor_result.add_two(b.sparse, c.sparse);

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

    if (a.is_constant() && b.is_constant()) {
        return field_pt(ctx, normalized_sum);
    }

    field_pt overflow = witness_pt(ctx, fr((sum - normalized_sum) >> 32));

    field_pt result = a.add_two(b, overflow * field_pt(ctx, -fr((uint64_t)(1ULL << 32ULL))));
    // Has to be a byte?
    overflow.create_range_constraint(3);
    return result;
}

/**
 * @brief Apply the SHA-256 compression function to a single 512-bit message block.
 *
 * This is the only public entry point for the stdlib SHA-256 implementation. We implement only the compression function
 * (rather than a full hash) because this is all that is required in DSL.
 *
 * @param h_init The 8-word (256-bit) initial hash state. For the first block of a message,
 *               this should be the standard SHA-256 IV. For subsequent blocks, this is the
 *               output of the previous compression.
 * @param input  The 16-word (512-bit) message block to compress.
 * @return       The updated 8-word hash state after compression.
 */
template <typename Builder>
std::array<field_t<Builder>, 8> SHA256<Builder>::sha256_block(const std::array<field_t<Builder>, 8>& h_init,
                                                              const std::array<field_t<Builder>, 16>& input)
{
    typedef field_t<Builder> field_pt;

    /**
     * Initialize round variables with previous block output.
     * Note: We delay converting `a` and `e` into their respective sparse forms because it's done as part of the
     * majority and choose functions in the first round.
     */
    sparse_value a = sparse_value(h_init[0]); // delay conversion to maj sparse form
    auto b = map_into_maj_sparse_form(h_init[1]);
    auto c = map_into_maj_sparse_form(h_init[2]);
    sparse_value d = sparse_value(h_init[3]);
    sparse_value e = sparse_value(h_init[4]); // delay conversion to choose sparse form
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
     * At this point, a malicious prover could tweak the add_normalize function and the result could be
     * 'overflowed'. Thus, we need 32-bit range checks on the outputs. Note that we won't need range checks while
     * applying the SHA-256 compression function because the outputs of the lookup table ensures that the output is
     * constrained to 32 bits.
     */
    for (size_t i = 0; i < 8; i++) {
        output[i].create_range_constraint(32);
    }

    return output;
}

template class SHA256<bb::UltraCircuitBuilder>;
template class SHA256<bb::MegaCircuitBuilder>;

} // namespace bb::stdlib
