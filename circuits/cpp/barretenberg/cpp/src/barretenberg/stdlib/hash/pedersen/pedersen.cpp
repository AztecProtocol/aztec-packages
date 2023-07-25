#include "pedersen.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "pedersen_gates.hpp"
#include "pedersen_plookup.hpp"

namespace proof_system::plonk {
namespace stdlib {

using namespace barretenberg;
using namespace crypto::pedersen_hash;
using namespace crypto::generators;
using namespace proof_system;

/**
 * Description of function:
 * We begin with an fr element `in`, and create a wnaf representation of it (see validate_wnaf_is_in_field for detail on
 * this presentation, or page 4 in https://docs.zkproof.org/pages/standards/accepted-workshop3/proposal-turbo_plonk.pdf)
 * This representation gives a sequence of 128 quads q_0, q_1, ..., q_{127} each in the range {-3, -1, 1, 3} and an
 * additional skew bit s ∈ {0,1}. Note that we always have q_{127} = 1 since `in` is 254-bit field scalar.
 * For generators [g] and [g_aux] (selected according to hash_index), we define a Pedersen hash as follows:
 *
 *             127
 *             ===
 *             \            i
 * in = -s  +  /    q_i . 4       =>    H(in) :=  A * [g] +  B * [g_aux] + s * [g_skew]
 *             ===
 *             i=0
 *
 *                      126
 *                      ===
 *               125    \            (i - 2)
 * where A :=  4     +  /    q_i . 4            and    B := (q_1 . 4 + q_0).
 *                      ===
 *                      i=2
 *
 * Since A is smaller than p/2, p being the grumpkin curve order, the output H(in) can be shown to be CR under DL even
 * when later outputting only the x coordinate.
 *
 * Full documentation: https://hackmd.io/gRsmqUGkSDOCI9O22qWXBA?view
 **/
template <typename C>
point<C> pedersen_hash<C>::hash_single_internal(const field_t& in,
                                                const generator_index_t hash_index,
                                                const bool validate_input_is_in_field)
{
    C* ctx = in.context;
    field_t scalar = in.normalize();

    if (in.is_constant()) {
        const auto hash_native = crypto::pedersen_hash::hash_single(in.get_value(), hash_index).normalize();
        return { field_t(ctx, hash_native.x), field_t(ctx, hash_native.y) };
    }

    ASSERT(ctx != nullptr);
    fr scalar_multiplier = scalar.get_value().from_montgomery_form();

    constexpr size_t num_bits = 254;
    constexpr size_t num_quads_base = (num_bits - 1) >> 1;
    constexpr size_t num_quads = ((num_quads_base << 1) + 1 < num_bits) ? num_quads_base + 1 : num_quads_base;
    constexpr size_t num_wnaf_bits = (num_quads << 1) + 1;

    // more generally, we could define initial_exponent as
    //   initial_exponent = ((num_bits & 1) == 1) ? num_bits - 1: num_bits;
    // this may require updating the logic around accumulator_offset
    constexpr size_t initial_exponent = num_bits;
    const auto gen_data = crypto::generators::get_generator_data(hash_index);
    const crypto::generators::fixed_base_ladder* ladder = gen_data.get_hash_ladder(num_bits);
    grumpkin::g1::affine_element skew_generator = gen_data.skew_generator;

    // Here n = num_quads = 127.
    // We have ladder[0] = 4^{n-2}[g], where g is a generator chosen for hashing.
    // Hence, we initialize the Pedersen hash with
    // When input scalar is odd:  P_0 = 4^{n-2}[g],
    // When input scalar is even: P_1 = 4^{n-2}[g] - [g_skew].
    // This is because the 128-th quad is always 1 and skew = 1 if scalar is even.
    // See the full documentation (https://hackmd.io/gRsmqUGkSDOCI9O22qWXBA?view) for more details.
    grumpkin::g1::element origin_points[2];
    origin_points[0] = grumpkin::g1::element(ladder[0].one);
    origin_points[1] = origin_points[0] - skew_generator;
    origin_points[1] = origin_points[1].normalize();

    uint64_t wnaf_entries[num_quads + 1] = { 0 };
    bool skew = false; // will update to be the boolean "scalar is even"

    /* compute the value of each 2-bit wnaf window and write into `wnaf_entries` array
     each `wnaf_entries[i]` is a `uint32_t` value which maps to the wnaf value via the formulae:
       wnaf_value_absolute = 2 * (wnaf_entries[i] & 0b11) + 1
       predicate = (wnaf_entries[i] >> 31);
       wnaf_value = predicate ? -wnaf_value_absolute : wnaf_value_absolute
     i.e. most significant bit describes if wnaf is negative
    remaining value will be 0 or 1 which corresponds to 1 or 3
    */
    barretenberg::wnaf::fixed_wnaf<num_wnaf_bits, 1, 2>(&scalar_multiplier.data[0], &wnaf_entries[0], skew, 0);

    // We are subtracting the skew from the reconstructed scalar from wnaf, so the accumulator offset must be
    // (-4^{-127}).
    fr accumulator_offset = -(fr::one() + fr::one()).pow(static_cast<uint64_t>(initial_exponent)).invert();

    // We need the accumulator offset to scale down the effect of accumulation on the skew term.
    fr origin_accumulators[2]{ fr::one(), accumulator_offset + fr::one() };

    std::vector<grumpkin::g1::element> multiplication_transcript;
    multiplication_transcript.resize(num_quads + 1);
    std::vector<fr> accumulator_transcript;
    accumulator_transcript.resize(num_quads + 1);

    if (skew) {
        // scalar is even (in particular, could be 0)
        multiplication_transcript[0] = origin_points[1];
        accumulator_transcript[0] = origin_accumulators[1];
    } else {
        // scalar is odd
        multiplication_transcript[0] = origin_points[0];
        accumulator_transcript[0] = origin_accumulators[0];
    }
    constexpr fr one = fr::one();
    constexpr fr three = ((one + one) + one);

    // compute values for `accumulator_transcript` and `multiplication_transcript`
    // `accumulator_transcript` contains the value of the accumulated wnaf entries for each gate
    // `multiplication_transcript` contains the x/y coordinate of the current accumulator point for each gate
    for (size_t i = 0; i < num_quads; ++i) {
        uint64_t entry = wnaf_entries[i + 1] & WNAF_MASK; // remove most significant bit (this is the sign bit)

        fr prev_accumulator = accumulator_transcript[i] + accumulator_transcript[i];
        prev_accumulator = prev_accumulator + prev_accumulator;

        grumpkin::g1::affine_element point_to_add = (entry == 1) ? ladder[i + 1].three : ladder[i + 1].one;

        // For a width-2 wnaf form, the wnaf value must be either 0 or 1 excluding the sign-bit (32nd bit).
        fr scalar_to_add = fr(entry == 1) * three + fr(entry == 0) * one;

        // 31st bit is sign bit
        uint64_t predicate = (wnaf_entries[i + 1] >> 31U) & 1U;
        if (predicate) {
            // wnaf digit is negative
            point_to_add = -point_to_add;
            scalar_to_add.self_neg();
        }
        accumulator_transcript[i + 1] = prev_accumulator + scalar_to_add;
        multiplication_transcript[i + 1] = multiplication_transcript[i] + point_to_add;
    }

    grumpkin::g1::element::batch_normalize(&multiplication_transcript[0], num_quads + 1);

    fixed_group_init_quad init_quad{ origin_points[0].x,
                                     (origin_points[0].x - origin_points[1].x),
                                     origin_points[0].y,
                                     (origin_points[0].y - origin_points[1].y) };

    /**
     * Fill the gates as following:
     *
     * +---------+---------+-----------+---------+
     * | w_1     | w_2     | w_3       | w_4     |
     * |---------|---------|-----------|---------|
     * | x_0     | y_0     | c         | a_0     |
     * | x_1     | y_1     | x_{α,0}   | a_1     |
     * | .       | .       | .         | .       |
     * | .       | .       | .         | .       |
     * | .       | .       | .         | .       |
     * | x_i     | y_i     | x_{α,i-1} | a_i     |<- i th gate
     * | x_{i+1} | y_{i+1} | x_{α,i}   | a_{i+1} |
     * | .       | .       | .         | .       |
     * | .       | .       | .         | .       |
     * | .       | .       | .         | .       |
     * | x_n     | y_n     | x_{α,n-1} | a_n     |
     * +---------+---------+-----------+---------+
     *
     * For the gate i=0:
     * Suppose skew s ∈ {0,1}. Initialisation point: P_s = (-s + 4^n)[g] and we have:
     * x_0 = (P_s).x, y_0 = (P_s).y, c = 4^{-n} and a_0 = 1 - s.4^{-n}.
     *
     * For gates i ∈ {1, 2, ..., n-1}
     * (x_{i+1}, y_{i+1})  =  (x_i, y_i)  +_{ecc}  x_{α,i}
     *
     * where x_{α,i} is decided based on the corresponding quad value.
     */
    pedersen_gates<C> gates(ctx);
    fr x_alpha = accumulator_offset;
    std::vector<uint32_t> accumulator_witnesses;
    for (size_t i = 0; i < num_quads; ++i) {
        fixed_group_add_quad round_quad;
        round_quad.d = ctx->add_variable(accumulator_transcript[i]);
        round_quad.a = ctx->add_variable(multiplication_transcript[i].x);
        round_quad.b = ctx->add_variable(multiplication_transcript[i].y);

        if (i == 0) {
            // we need to ensure that the first value of x_alpha is a defined constant.
            // However, repeated applications of the pedersen hash will use the same constant value.
            // `put_constant_variable` will create a gate that fixes the value of x_alpha, but only once
            round_quad.c = ctx->put_constant_variable(x_alpha);
        } else {
            round_quad.c = ctx->add_variable(x_alpha);
        }

        x_alpha = fr((wnaf_entries[i + 1] & WNAF_MASK) == 1) * ladder[i + 1].three.x +
                  fr((wnaf_entries[i + 1] & WNAF_MASK) == 0) * ladder[i + 1].one.x;

        round_quad.q_x_1 = ladder[i + 1].q_x_1;
        round_quad.q_x_2 = ladder[i + 1].q_x_2;
        round_quad.q_y_1 = ladder[i + 1].q_y_1;
        round_quad.q_y_2 = ladder[i + 1].q_y_2;

        if (i > 0) {
            gates.create_fixed_group_add_gate(round_quad);
        } else {
            if constexpr (HasPlookup<C> && (C::merkle_hash_type == merkle::HashType::FIXED_BASE_PEDERSEN ||
                                            C::commitment_type == pedersen::CommitmentType::FIXED_BASE_PEDERSEN)) {
                /* In TurboPlonkComposer, the selector q_5 is used to show that w_1 and w_2 are properly initialized to
                 * the coordinates of P_s = (-s + 4^n)[g]. In UltraPlonK, we have removed q_5 for overall efficiency (it
                 * would only be used here in this gate), but this presents us a cost in the present circuit: we must
                 * use an additional gate to perform part of the initialization. Since q_5 is only involved in the
                 * x-coordinate initialization (in the notation of the widget, Constraint 5), we only perform that part
                 * of the initialization with additional gates, letting Constraints 4 and 6  be handled in the Ultra
                 * version of the widget as in the Turbo verison.
                 * x-coordinate initialization constraint (Pi = origin_points[i] for i = 0,1):
                 * c * (P0.x - x_0) + (P0.x - P1.x) * (1 - a_0))
                 *     = -c * x_0 + c * P0.x - (P0.x - P1.x) * a_0 + (P0.x - P1.x)
                 * In present terms, x_0 = round_quad.a, c = round_quad.c, P0.x = init_quad.q_x_1,
                 *                   a_0 = round_quad.d,                   P0.x - P1.x = init_quad.q_x_2,
                 * so we want to impose the constraint:
                 * 0 = -round_quad.a * round_quad.c
                 *        + init_quad.q_x_1 * round_quad.c
                 *        - init_quad.q_x_2 * round_quad.d
                 *        + init_quad.q_x_2
                 * */
                mul_quad x_init_quad{ .a = round_quad.a,
                                      .b = round_quad.c,
                                      .c = 0,
                                      .d = round_quad.d,
                                      .mul_scaling = -1,
                                      .a_scaling = 0,
                                      .b_scaling = init_quad.q_x_1,
                                      .c_scaling = 0,
                                      .d_scaling = -init_quad.q_x_2,
                                      .const_scaling = init_quad.q_x_2 };
                ctx->create_big_mul_gate(x_init_quad);
            }
            gates.create_fixed_group_add_gate_with_init(round_quad, init_quad);
        };

        accumulator_witnesses.push_back(round_quad.d);
    }

    // In Turbo PLONK, this effectively just adds the last row of the table as witnesses.
    // In Standard PLONK, this also creates the constraint involving the final two rows.
    add_quad add_quad{ ctx->add_variable(multiplication_transcript[num_quads].x),
                       ctx->add_variable(multiplication_transcript[num_quads].y),
                       ctx->add_variable(x_alpha),
                       ctx->add_variable(accumulator_transcript[num_quads]),
                       fr::zero(),
                       fr::zero(),
                       fr::zero(),
                       fr::zero(),
                       fr::zero() };
    gates.create_fixed_group_add_gate_final(add_quad);
    accumulator_witnesses.push_back(add_quad.d);

    point result;
    result.x = field_t(ctx);
    result.x.witness_index = add_quad.a;
    result.y = field_t(ctx);
    result.y.witness_index = add_quad.b;

    field_t::from_witness_index(ctx, add_quad.d).assert_equal(in, "pedersen: d != in");

    if (validate_input_is_in_field) {
        validate_wnaf_is_in_field(ctx, accumulator_witnesses);
    }
    return result;
}

/**
 * Compute pedersen hash of the field element `in` using either lookup tables or its WNAF representation.
 *
 * Full documentation: https://hackmd.io/gRsmqUGkSDOCI9O22qWXBA?view
 **/
template <typename C>
point<C> pedersen_hash<C>::hash_single(const field_t& in,
                                       const generator_index_t hash_index,
                                       const bool validate_input_is_in_field)
{
    if constexpr (HasPlookup<C> && C::merkle_hash_type == merkle::HashType::LOOKUP_PEDERSEN) {
        return pedersen_plookup_hash<C>::hash_single(in, hash_index.index == 0);
    }

    return pedersen_hash<C>::hash_single_internal(in, hash_index, validate_input_is_in_field);
}

/**
 * Subsidiary function used by the Pedersen commitment gadget to "hash" a field element.
 *
 * Full documentation: https://hackmd.io/gRsmqUGkSDOCI9O22qWXBA?view
 **/
template <typename C>
point<C> pedersen_hash<C>::commit_single(const field_t& in,
                                         const generator_index_t hash_index,
                                         const bool validate_input_is_in_field)
{
    if constexpr (HasPlookup<C> && C::commitment_type == pedersen::CommitmentType::LOOKUP_PEDERSEN) {
        return pedersen_plookup_hash<C>::hash_single(in, hash_index.index == 0);
    }

    return pedersen_hash<C>::hash_single_internal(in, hash_index, validate_input_is_in_field);
}

/**
 * Check the wnaf sum is smaller than the circuit modulus
 *
 * When we compute a scalar mul e.g. x * [1], we decompose `x` into an accumulating sum of 2-bit non-adjacent form
 * values. In `hash_single`, we validate that the sum of the 2-bit NAFs (`w`) equals x. But we only check that `w == x
 * mod r` where r is the circuit modulus.
 *
 * If we require the pedersen hash to be injective, we must ensure that `w < r`.
 * Typically this is required for all instances where `w` represents a field element.
 * One exception is Merkle tree membership proofs as there is only one valid output that will hash to the Merkle root
 *
 * Total cost is ~36 gates
 **/
template <typename C> void pedersen_hash<C>::validate_wnaf_is_in_field(C* ctx, const std::vector<uint32_t>& accumulator)
{
    /**
     * To validate that `w < r`, we use schoolbook subtraction
     *
     * The wnaf entries, other than the last entry, are in the range [-3, -1, 1, 3]
     *
     *                                                                 -254
     * The last wnaf entry, wnaf[127] is taken from the range [1, 1 + 2    ]
     *
     *        127
     *        ===
     *        \                i
     *  w =   /    wnaf[i]  . 4
     *        ===
     *       i = 0
     *                                               255
     * The final value of w can range between 1 and 2
     *
     *      -254
     * The 2     term is the 'wnaf skew'. Only odd integers can be represented via a wnaf. The skew is an
     * additional value that is added into the wnaf sum to enable even integer representation.
     *
     * N.B. We do not consider the case where the input is equal to 0. This is a special edge case that must
     *      be handled separately because of affine addition formulae exceptions.
     *
     * The raw wnaf entries are not themselves represented as witnesses in the circuit.
     * The pedersen hash gate derives the wnaf entries by taking the difference between two accumulating sums.
     * We accumulate starting with the MOST significant wnaf entry
     *
     * i.e. there is a container of witnesses, `accumulators[128]`, where:
     *
     *
     *                      i
     *                     ===
     *                     \                      i - j
     *  accumulator[i] =   /    wnaf[127 - j]  . 4
     *                     ===
     *                    j = 0
     *
     * The goal is to ensure that accumulator[127] < r using as few constraints as possible
     * The following describes how we implement this check:
     *
     * 1. Use the wnaf accumulator to split `w` into two limbs w.lo and w.hi
     *
     *    w.lo is the accumulating sum of the least significant 63 wnaf entries, plus the wnaf skew (0 or 1)
     *    w.hi is the accumulating sum of the most significant 64 wnaf entries excluding the wnaf skew
     *
     *    We can extract w.hi from accumulator[64], but we need to remove the contribution from the wnaf skew
     *    We can extract w.lo by subtracting w.hi * 2^{126} from the final accumulator (the final accumulator will be
     *    equal to `w`)
     *
     * 2. Compute y.lo = (r.lo - w.lo) + 2^{126} (the 2^126 constant ensures this is positive)
     *    r.lo is the least significant 126 bits of r
     *    r.hi is the most significant 128 bits of r
     *      128 bits
     *    (-- y_hi --)
     *              (-- y_lo --)
     *                128 bits
     *
     * 4. Compute y.overlap = y.lo.slice(126, 128) - 1
     *    (we can get this from applying a 128-bit range constraint to y.lo && extract the most significant quad)
     *    y.overlap is a 2-bit integer and *NOT* a 1-bit integer. This is because w.lo can be negative
     *    y.overlap represents the 2 bits of y.lo that overlap with y.hi
     *    We subtract 1 to counter the constant 2^{126} term we added into y.lo
     *
     * 5. Compute y.hi = r.hi - w.hi + y.overlap
     *
     * 6. Range constrain y.hi to be a 128-bit integer
     *
     * We slice the low limb to be 126 bits so that both our range checks can be over 128-bit integers (if the range is
     * a multiple of 8 we save 1 gate per range check)
     *
     * The following table describes the range of values the above terms can take, if w < r
     *
     * 1) w_hi contains 64 most significant quads (or 128 bits) excluding the skew term:
     *   w_hi = (4^{64}.1 + 4^{63}.q_{126} + 4^{62}.q_{125} + ... + 4.q_{64} + q_{63})
     *
     * 2) w_lo contains the 63 least significant quads (or 126 bits):
     *   w_lo = (4^{62}.q_{62} + 4^{61}.q_{61} + ... + 4.q_{1} + q_{0} - s)
     *
     *   ----------------------------------------------
     *   | limb               | min value | max value |
     *   ----------------------------------------------
     *   |                    |       126 |   126     |
     *   | w.lo               |     -2    | (2   - 1) |
     *   ----------------------------------------------
     *   |                    |           |   129     |
     *   | w.hi               |         1 | (2   - 1) |
     *   ----------------------------------------------
     *   |                126 |           |   255     |
     *   | w.lo + w.hi * 2    |         0 | (2   - 1) |
     *   ----------------------------------------------
     *   |                    |    126    |    128    |
     *   | y.lo               | > 2   - 1 | < 2       |
     *   ----------------------------------------------
     *   |                    |           |    128    |
     *   | y.hi               |         0 | < 2       |
     *   ----------------------------------------------
     *
     * Possible result states and the conditions that must be satisfied:
     *
     * +---------------------------------------------------------------------------------------------------------------+
     * | condition     | y.lo >> 126 | (r_lo - w_lo) | y.lo overlaps with y.hi?       | condition for w<r              |
     * +---------------------------------------------------------------------------------------------------------------+
     * | w.lo > r.lo             | 0 | negative      | yes, y.lo borrows 1 from y.hi  | (r.hi - w.hi - 1) must be >= 0 |
     * | w.lo <= r.lo, w.lo >= 0 | 1 | positive      | no                             | (r.hi - w.hi) must be >= 0     |
     * | w.lo < 0                | 2 | positive      | yes, y.lo carries 1 to y.hi    | (r.hi - w.hi + 1) must be >= 0 |
     * +---------------------------------------------------------------------------------------------------------------+
     **/

    constexpr uint256_t modulus = fr::modulus;
    const fr r_lo = modulus.slice(0, 126);
    const fr r_hi = modulus.slice(126, 256);
    const fr shift = fr(uint256_t(1) << 126);

    // Step 1: convert accumulator into two 126/128 bit limbs
    uint32_t mid_index = accumulator[64];
    uint32_t end_index = accumulator[accumulator.size() - 1];

    /**
     * We need to extract the skew term from accumulator[0]
     *
     * We know that accumulator[0] is either 1 or (1 - 2^{-254})
     *
     * Therefore  the 2^{-254} term in accumulator[0] will translate to a value of `1` when `input` is computed
     * This corresponds to `input` being an even number (without a skew term, wnaf represenatations can only express odd
     * numbers)
     *
     * We need to factor out this skew term from w.hi as it is part of w.lo
     *
     *
     **/

    // is_even = 0 if input is odd
    // is_even = 1 if input is even
    field_t is_even = -(field_t::from_witness_index(ctx, accumulator[0]) - 1) * fr(uint256_t(1) << 254);
    is_even.create_range_constraint(1, "is_even is neither 0 nor 1");

    field_t high_limb_with_skew = field_t::from_witness_index(ctx, mid_index);

    // Reconstructed_input will equal input (this is checked in the pedersen hash function)
    // We extract term from the accumulators because input might have constant scaling factors applied to it
    field_t reconstructed_input = field_t::from_witness_index(ctx, end_index);

    /**
     *                                                         126
     *    w.lo = reconstructed_input - (high_limb_with_skew * 2  + is_even)
     *                          126
     *    y.lo = r.lo - w.lo + 2
     *                   126                                                          126
     * => y.lo = r.lo + 2    + is_even - reconstructed_input + high_limb_with_skew * 2
     *
     *  (we do not explicitly compute w.lo to save an addition gate)
     **/

    field_t y_lo = (-reconstructed_input).add_two(high_limb_with_skew * shift + (r_lo + shift), is_even);

    field_t y_overlap;
    if constexpr (HasPlookup<C>) {
        // carve out the 2 high bits from y_lo and instantiate as y_overlap
        const uint256_t y_lo_value = y_lo.get_value();
        const uint256_t y_overlap_value = y_lo_value >> 126;
        y_overlap = witness_t(ctx, y_overlap_value);

        // Validate y.lo is a 128-bit integer
        field_t y_remainder = y_lo - (y_overlap * field_t(uint256_t(1ULL) << 126));
        y_overlap.create_range_constraint(2,
                                          "pedersen: range constraint on y_overlap fails in validate_wnaf_is_in_field");
        y_remainder.create_range_constraint(
            126, "pedersen: range constraint on y_remainder fails in validate_wnaf_is_in_field");
        y_overlap = y_overlap - 1;
    } else {
        // Validate y.lo is a 128-bit integer
        const auto y_lo_accumulators = ctx->decompose_into_base4_accumulators(
            y_lo.normalize().witness_index,
            128,
            "pedersen: range constraint on y_lo fails in validate_wnaf_is_in_field");
        // Extract y.overlap, the 2 most significant bits of y.lo
        y_overlap = field_t::from_witness_index(ctx, y_lo_accumulators[0]) - 1;
    }

    /**
     *                                           -126
     *   w.hi = high_limb_with_skew + is_even * 2
     *
     *   y.hi = r.hi + (y.overlap - 1) - w.hi
     **/
    field_t y_hi = (-is_even * fr(uint256_t(1) << 126).invert()).add_two(-high_limb_with_skew, y_overlap + (r_hi));

    // Validate y.hi is a 128-bit integer
    y_hi.create_range_constraint(128, "pedersen: range constraint on y_lo fails in validate_wnaf_is_in_field");
}

/**
 * Adds two group elements using elliptic curve addition.
 **/
template <typename C> point<C> pedersen_hash<C>::add_points(const point& first, const point& second)
{
    field_t lhs = second.y - first.y;
    field_t rhs = second.x - first.x;
    // since we are adding multiples of different generators, creating a zero denum is as hard as DL
    field_t lambda = lhs.divide_no_zero_check(rhs);
    field_t x_3 = lambda * lambda - second.x - first.x;
    field_t y_3 = lambda * (first.x - x_3) - first.y;
    return { x_3, y_3 };
}

/**
 * Accumulate a set of group elements using simple elliptic curve addition.
 */
template <typename C> point<C> pedersen_hash<C>::accumulate(const std::vector<point>& to_accumulate)
{
    if (to_accumulate.size() == 0) {
        return point{ 0, 0 };
    }

    point accumulator = to_accumulate[0];
    for (size_t i = 1; i < to_accumulate.size(); ++i) {
        accumulator = add_points(accumulator, to_accumulate[i]);
    }
    return accumulator;
}

template <typename C>
field_t<C> pedersen_hash<C>::hash_multiple(const std::vector<field_t>& inputs,
                                           const size_t hash_index,
                                           const bool validate_inputs_in_field)
{
    if constexpr (HasPlookup<C> && C::merkle_hash_type == merkle::HashType::LOOKUP_PEDERSEN) {
        return pedersen_plookup_hash<C>::hash_multiple(inputs, hash_index);
    }

    std::vector<point> to_accumulate;
    for (size_t i = 0; i < inputs.size(); ++i) {
        generator_index_t index = { hash_index, i };
        to_accumulate.push_back(pedersen_hash<C>::hash_single(inputs[i], index, validate_inputs_in_field));
    }
    point result = pedersen_hash<C>::accumulate(to_accumulate);
    return result.x;
}

INSTANTIATE_STDLIB_TYPE(pedersen_hash);

} // namespace stdlib
} // namespace proof_system::plonk
