// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

/**
 * @file sha256.cpp
 * @brief Circuit implementation of SHA-256 compression function using lookup tables.
 *
 * This implementation uses "sparse form" representations to efficiently compute SHA-256 operations:
 * - XOR operations become additions in sparse form (one digit per bit)
 * - Rotations become coefficient multiplications or table lookups
 * - Boolean functions (Choose, Majority) are computed via lookup tables
 *
 * Two sparse bases are used:
 * - Base-28 for Choose + Σ₁: encodes 7*rotation + (e + 2f + 3g)
 * - Base-16 for Majority + Σ₀: encodes 4*rotation + (a + b + c)
 * - Base-16 with pre-rotated limbs for message schedule extension
 *
 * See plookup_tables/sha256.hpp for the details of the lookup tables used herein.
 */

#include "sha256.hpp"

#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/plookup/plookup.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/plookup_tables.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/sha256.hpp"

using namespace bb;

namespace bb::stdlib {
using namespace bb::plookup;

/**
 * @brief Convert a 32-bit value to sparse limbs form for message schedule extension.
 *
 * Uses SHA256_WITNESS_INPUT lookup table to decompose input into sparse limbs and
 * pre-rotated correction terms needed for σ₀/σ₁ computation.
 *
 * See get_witness_extension_input_table() in plookup_tables/sha256.hpp for table structure.
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
 * @brief Apply a 32-bit range constraint using SHA256_WITNESS_INPUT lookup table.
 *
 * More efficient than explicit range constraints for 32-bit values since the lookup
 * table is already utilized for SHA-256 operations.
 *
 * @param input The field element to constrain to 32 bits.
 */
template <typename Builder>
void SHA256<Builder>::apply_32_bit_range_constraint_via_lookup(const field_t<Builder>& input)
{
    (void)plookup_read<Builder>::get_lookup_accumulators(MultiTableId::SHA256_WITNESS_INPUT, input);
}

/**
 * @brief Extend the 16-word message block to 64 words per SHA-256 specification.
 *
 * SHA-256 Spec (FIPS 180-4, Section 6.2.2):
 *   W[i] = σ₁(W[i-2]) + W[i-7] + σ₀(W[i-15]) + W[i-16]  (mod 2³²)  for i = 16..63
 *
 * Uses base-16 sparse form to compute σ₀ + σ₁ efficiently via lookup tables,
 * then adds W[i-7] and W[i-16] and reduces mod 2³².
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

    // Populate initial 16 words from input (sparse form computed lazily as needed)
    for (size_t i = 0; i < 16; ++i) {
        w_sparse[i] = SHA256<Builder>::sparse_witness_limbs(w_in[i]);
        // Extract builder context from inputs
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

        // Compute σ₀(w[i-15]) in sparse form where σ₀(x) = (x >>> 7) ⊕ (x >>> 18) ⊕ (x >> 3).
        // Each sparse digit holds the sum of contributions from the three rotation/shift operations (digit value in
        // {0,1,2,3}). The fr(4) scaling positions σ₀'s contribution in the upper 2 bits of each 4-bit digit slot: when
        // combined with σ₁ (unscaled, in lower 2 bits), each digit becomes 4*σ₀_digit + σ₁_digit ∈ [0,15].
        const field_pt left_xor_sparse =
            left[0].add_two(left[1], left[2]).add_two(left[3], w_left.rotated_limb_corrections[1]) * fr(4);

        // Compute σ₀(w[i-15]) + σ₁(w[i-2]) in sparse form where σ₁(x) = (x >>> 17) ⊕ (x >>> 19) ⊕ (x >> 10).
        const field_pt xor_result_sparse = right[0]
                                               .add_two(right[1], right[2])
                                               .add_two(right[3], w_right.rotated_limb_corrections[2])
                                               .add_two(w_right.rotated_limb_corrections[3], left_xor_sparse);

        // Normalize the sparse representation via a lookup to obtain the genuine result σ₀ + σ₁
        field_pt xor_result = plookup_read<Builder>::read_from_1_to_2_table(SHA256_WITNESS_OUTPUT, xor_result_sparse);

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

            field_pt w_out_raw_inv_pow_two = w_out_raw * inv_pow_two;
            field_pt w_out_inv_pow_two = w_out * inv_pow_two;
            field_pt divisor = w_out_raw_inv_pow_two - w_out_inv_pow_two;
            // Sum of four 32-bit values: divisor ∈ {0,1,2,3}.
            divisor.create_range_constraint(2);
        }

        w_sparse[i] = sparse_witness_limbs(w_out);
    }

    // Explicitly constrain words not already constrained via lookups during extension:
    // - w[0], w[62], w[63]: Never accessed as w[i-15] or w[i-2] in the extension loop
    apply_32_bit_range_constraint_via_lookup(w_sparse[0].normal);
    apply_32_bit_range_constraint_via_lookup(w_sparse[62].normal);
    apply_32_bit_range_constraint_via_lookup(w_sparse[63].normal);

    std::array<field_pt, 64> w_extended;
    for (size_t i = 0; i < 64; ++i) {
        w_extended[i] = w_sparse[i].normal;
    }
    return w_extended;
}

/**
 * @brief Convert a field element to sparse form for use in the Choose function
 *
 * Performs a lookup to convert a normal 32-bit value to its base-28 sparse representation.
 * Base 28 is required because the Choose lookup table index formula is `7 × rotation_sum + (e + 2f + 3g)`,
 * where rotation_sum ranges 0-3 and the weighted sum (e + 2f + 3g) ranges 0-6, giving max index 27.
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
 * Performs a lookup to convert a normal 32-bit value to its base-16 sparse representation.
 * Base 16 is required because the Majority lookup table index formula is `4 × rotation_sum + (a + b + c)`,
 * where rotation_sum ranges 0-3 and (a + b + c) ranges 0-3, giving max index 15.
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

/**
 * @brief Compute Σ₁(e) + Ch(e,f,g) for SHA-256 compression rounds.
 *
 * Combines two operations efficiently using base-28 sparse form:
 *   - Σ₁(e) = (e >>> 6) ^ (e >>> 11) ^ (e >>> 25)
 *   - Ch(e,f,g) = (e & f) ^ (~e & g)
 *
 * Sparse encoding: 7*[rotations] + [e + 2f + 3g], where factor 7 separates rotation
 * contributions (0-3) from Choose encoding (0-6) within each base-28 digit.
 *
 * See get_choose_input_table() in plookup_tables/sha256.hpp for the mathematical derivation.
 *
 * @param e Input/output: e.normal read, e.sparse populated as side effect
 * @param f Input: must have .sparse already populated
 * @param g Input: must have .sparse already populated
 * @return Σ₁(e) + Ch(e,f,g) (sum of two 32-bit constrained values)
 */
template <typename Builder>
field_t<Builder> SHA256<Builder>::choose_with_sigma1(sparse_value& e, const sparse_value& f, const sparse_value& g)
{
    using field_pt = field_t<Builder>;
    // Separates rotation contributions (0-3) from Choose encoding (0-6) in each base-28 digit
    constexpr fr SPARSE_MULT = fr(7);

    const auto lookup = plookup_read<Builder>::get_lookup_accumulators(SHA256_CH_INPUT, e.normal);
    const auto rotation_coefficients = sha256_tables::get_choose_rotation_multipliers();

    field_pt rotation_result = lookup[ColumnIdx::C3][0];
    e.sparse = lookup[ColumnIdx::C2][0];
    field_pt sparse_L2 = lookup[ColumnIdx::C2][2];

    // Compute e + 7*Σ₁(e) in sparse form
    field_pt xor_result = (rotation_result * SPARSE_MULT)
                              .add_two(e.sparse * (rotation_coefficients[0] * SPARSE_MULT + fr(1)),
                                       sparse_L2 * (rotation_coefficients[2] * SPARSE_MULT));

    // Add 2f + 3g to get e + 7*Σ₁(e) + 2f + 3g (each digit in 0..27)
    field_pt choose_result_sparse = xor_result.add_two(f.sparse + f.sparse, g.sparse + g.sparse + g.sparse);

    // Normalize via lookup: each digit maps to Σ₁(e)_i + Ch(e,f,g)_i
    field_pt choose_result = plookup_read<Builder>::read_from_1_to_2_table(SHA256_CH_OUTPUT, choose_result_sparse);

    return choose_result;
}

/**
 * @brief Compute Σ₀(a) + Maj(a,b,c) for SHA-256 compression rounds.
 *
 * Combines two operations efficiently using base-16 sparse form:
 *   - Σ₀(a) = (a >>> 2) ^ (a >>> 13) ^ (a >>> 22)
 *   - Maj(a,b,c) = (a & b) ^ (a & c) ^ (b & c)
 *
 * Sparse encoding: 4*[rotations] + [a + b + c], where factor 4 separates rotation
 * contributions (0-3) from Majority encoding (0-3) within each base-16 digit.
 *
 * See get_majority_input_table() in plookup_tables/sha256.hpp for the mathematical derivation.
 *
 * @param a Input/output: a.normal read, a.sparse populated as side effect
 * @param b Input: must have .sparse already populated
 * @param c Input: must have .sparse already populated
 * @return Σ₀(a) + Maj(a,b,c) (sum of two 32-bit constrained values)
 */
template <typename Builder>
field_t<Builder> SHA256<Builder>::majority_with_sigma0(sparse_value& a, const sparse_value& b, const sparse_value& c)
{
    using field_pt = field_t<Builder>;
    // Separates rotation contributions (0-3) from Majority encoding (0-3) in each base-16 digit
    constexpr fr SPARSE_MULT = fr(4);

    const auto lookup = plookup_read<Builder>::get_lookup_accumulators(SHA256_MAJ_INPUT, a.normal);
    const auto rotation_coefficients = sha256_tables::get_majority_rotation_multipliers();

    // first row of 3rd column gives accumulating sum of "non-trivial" wraps
    field_pt rotation_result = lookup[ColumnIdx::C3][0];
    a.sparse = lookup[ColumnIdx::C2][0];
    field_pt sparse_L1_acc = lookup[ColumnIdx::C2][1];

    // Compute a + 4*Σ₀(a) in sparse form
    field_pt xor_result = (rotation_result * SPARSE_MULT)
                              .add_two(a.sparse * (rotation_coefficients[0] * SPARSE_MULT + fr(1)),
                                       sparse_L1_acc * (rotation_coefficients[1] * SPARSE_MULT));

    // Add b + c to get a + 4*Σ₀(a) + b + c (each digit in 0..15)
    field_pt majority_result_sparse = xor_result.add_two(b.sparse, c.sparse);

    // Normalize via lookup: each digit maps to Σ₀(a)_i + Maj(a,b,c)_i
    field_pt majority_result = plookup_read<Builder>::read_from_1_to_2_table(SHA256_MAJ_OUTPUT, majority_result_sparse);

    return majority_result;
}

/**
 * @brief Compute (a + b) mod 2^32 with circuit constraints.
 *
 * Constrains: result = a + b - overflow * 2^32, where overflow is range-checked to overflow_bits.
 *
 * @param overflow_bits Number of bits for overflow range constraint. Must accommodate max(a + b) / 2^32.
 *
 * @warning result is not explicitly range-constrained here because it is typically used downstream in lookup tables
 * (e.g. in choose_with_sigma1, majority_with_sigma0) which implicitly validates the 32-bit range.
 */
template <typename Builder>
field_t<Builder> SHA256<Builder>::add_normalize(const field_t<Builder>& a,
                                                const field_t<Builder>& b,
                                                size_t overflow_bits)
{
    using field_pt = field_t<Builder>;
    using witness_pt = witness_t<Builder>;

    Builder* ctx = a.get_context() ? a.get_context() : b.get_context();

    uint256_t sum = a.get_value() + b.get_value();
    uint256_t normalized_sum = static_cast<uint32_t>(sum.data[0]); // lower 32 bits

    if (a.is_constant() && b.is_constant()) {
        return field_pt(ctx, normalized_sum);
    }

    fr overflow_value = fr((sum - normalized_sum) >> 32);
    field_pt overflow = witness_pt(ctx, overflow_value);

    field_pt result = a.add_two(b, overflow * field_pt(ctx, -fr(1ULL << 32ULL)));
    overflow.create_range_constraint(overflow_bits);
    return result;
}

/**
 * @brief Apply the SHA-256 compression function to a single 512-bit message block.
 *
 * This is the only public entry point for the stdlib SHA-256 implementation. We implement only the compression function
 * (rather than a full hash) because this is all that is required in DSL.
 *
 * @note  All 24 inputs (8 hash state + 16 message words) are 32-bit constrained via lookups:
 *        - h_init[0,4]: via majority_with_sigma0/choose_with_sigma1 in round 0
 *        - h_init[1,2,5,6]: via map_into_maj/choose_sparse_form at initialization
 *        - h_init[3,7]: explicitly via apply_32_bit_range_constraint_via_lookup
 *        - input[1..15]: via convert_witness when accessed as w[i-15] or w[i-2] in extend_witness
 *        - input[0]: explicitly via apply_32_bit_range_constraint_via_lookup
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
    using field_pt = field_t<Builder>;

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

    // Constrain h_init[3] and h_init[7] which are not lookup-constrained via sparse form conversion.
    apply_32_bit_range_constraint_via_lookup(h_init[3]);
    apply_32_bit_range_constraint_via_lookup(h_init[7]);

    // Extend the 16-word message block to 64 words per SHA-256 specification
    const std::array<field_t<Builder>, 64> w = extend_witness(input);

    /**
     * Apply SHA-256 compression function to the message schedule.
     *
     * Standard SHA-256 round:
     *   T1 = h + Σ1(e) + Ch(e,f,g) + K[i] + W[i]
     *   T2 = Σ0(a) + Maj(a,b,c)
     *   h,g,f,e,d,c,b,a = g,f,e,d+T1,c,b,a,T1+T2
     *
     * NOTE: Order-dependent side effects below. choose_with_sigma1() populates e.sparse (subsequently copied to f).
     * majority_with_sigma0() populates a.sparse (subsequently copied to b). Do not reorder relative to f=e or b=a.
     */
    for (size_t i = 0; i < 64; ++i) {
        auto ch = choose_with_sigma1(e, f, g);    // ch = Σ1(e) + Ch(e,f,g) ≤ 2*(2^32-1)
        auto maj = majority_with_sigma0(a, b, c); // maj = Σ0(a) + Maj(a,b,c) ≤ 2*(2^32-1)

        // T1 = ch + h + K[i] + W[i] ≤ 5*(2^32-1)
        auto temp1 = ch.add_two(h.normal, w[i] + fr(round_constants[i]));

        h = g;
        g = f;
        f = e;
        e.normal = add_normalize(d.normal, temp1, /*overflow_bits=*/3); // d + T1: 6 × 32-bit, overflow ≤ 5
        d = c;
        c = b;
        b = a;
        a.normal = add_normalize(temp1, maj, /*overflow_bits=*/3); // T1 + Σ0+Maj: 7 × 32-bit, overflow ≤ 6
    }

    // Apply range constraints to `a` and `e` which are the only outputs not already lookup-constrained via sparse form
    // conversion. Although not strictly necessary, this simplifies the analysis that the output of compression is fully
    // constrained at minimal cost.
    apply_32_bit_range_constraint_via_lookup(a.normal);
    apply_32_bit_range_constraint_via_lookup(e.normal);

    // Add round results into previous block output.
    // Overflow bits = 1 since each summand is constrained to 32 bits.
    std::array<field_pt, 8> output;
    output[0] = add_normalize(a.normal, h_init[0], /*overflow_bits=*/1);
    output[1] = add_normalize(b.normal, h_init[1], /*overflow_bits=*/1);
    output[2] = add_normalize(c.normal, h_init[2], /*overflow_bits=*/1);
    output[3] = add_normalize(d.normal, h_init[3], /*overflow_bits=*/1);
    output[4] = add_normalize(e.normal, h_init[4], /*overflow_bits=*/1);
    output[5] = add_normalize(f.normal, h_init[5], /*overflow_bits=*/1);
    output[6] = add_normalize(g.normal, h_init[6], /*overflow_bits=*/1);
    output[7] = add_normalize(h.normal, h_init[7], /*overflow_bits=*/1);

    // The final add_normalize outputs are not consumed by lookup tables, so they must be
    // explicitly range-constrained. (Within the compression loop, lookup tables provide
    // implicit 32-bit constraints on add_normalize outputs.)
    for (size_t i = 0; i < 8; i++) {
        output[i].create_range_constraint(32);
    }

    return output;
}

template class SHA256<bb::UltraCircuitBuilder>;
template class SHA256<bb::MegaCircuitBuilder>;

} // namespace bb::stdlib
