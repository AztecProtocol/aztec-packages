#pragma once

#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "recursion_constraint.hpp"

namespace acir_format {

/**
 * Experimental ABI carried by RecursiveAggregation, without changing Noir/ACIR:
 * key          = N G1 points, each [x_lo, x_hi, y_lo, y_hi], radix 2^136
 * public_inputs = N BN254 Fr scalars
 * proof        = claimed MSM result in the same four-limb representation
 * key_hash     = reserved, must be zero
 *
 * This asserts an MSM only; unlike the recursion proof types it produces no pairing
 * accumulator. Mega's group implementation sends every group operation to the
 * ECCVM. Soundness requires verification of the complete Chonk/Goblin proof.
 *
 * Coordinates must be canonical Fq values; infinity is (0, 0). The predicate must be
 * Boolean. A constant-zero predicate is elided by the ACIR parser, so no check below
 * applies to such a call. A witness-zero predicate disables the MSM (fixed valid
 * inputs are selected and the claimed result is bound to infinity), but the key_hash
 * and shape checks still apply.
 */
template <typename Builder>
    requires IsMegaBuilder<Builder>
inline void create_bn254_msm_constraint(Builder& builder, const RecursionConstraint& input)
{
    // The canonical-coordinate check uses bigfield, which needs the non-native-field gate.
    // Kernel arithmetizations drop that gate; the caller rejects BN254_MSM there.
    static_assert(Builder::ExecutionTrace::has_gate_kind(GateKind::Nnf), "BN254_MSM needs the NNF gate");
    using Curve = bb::stdlib::bn254<Builder>;
    using Field = Curve::ScalarField;
    using Group = Curve::Group;
    using Coordinate = Curve::BaseField;
    using CanonicalFq = bb::stdlib::bigfield<Builder, bb::Bn254FqParams>;
    using Bool = bb::stdlib::bool_t<Builder>;

    BB_ASSERT(!input.public_inputs.empty(), "BN254_MSM requires at least one point");
    BB_ASSERT_EQ(input.key.size(), input.public_inputs.size() * 4, "BN254_MSM point/scalar count mismatch");
    BB_ASSERT_EQ(input.proof.size(), size_t(4), "BN254_MSM output must have four limbs");
    auto witness = [&](uint32_t index) { return Field::from_witness_index(&builder, index); };
    witness(input.key_hash).assert_equal(Field(0), "BN254_MSM reserved key_hash must be zero");
    Bool enabled(to_field_ct(input.predicate, builder));

    auto coordinate = [&](uint32_t lo_index, uint32_t hi_index, uint64_t disabled_value) {
        // Select before range/curve checks: disabled calls may contain arbitrary
        // point witnesses. A fixed valid generator is queued instead.
        Field lo = Field::conditional_assign(enabled, witness(lo_index), Field(disabled_value));
        Field hi = Field::conditional_assign(enabled, witness(hi_index), Field(0));
        CanonicalFq(lo, hi).assert_is_in_field("BN254_MSM coordinate must be canonical");
        return Coordinate(lo, hi);
    };

    std::vector<Group> points;
    std::vector<Field> scalars;
    points.reserve(input.public_inputs.size());
    scalars.reserve(input.public_inputs.size());
    for (size_t i = 0; i < input.public_inputs.size(); ++i) {
        points.emplace_back(coordinate(input.key[4 * i], input.key[4 * i + 1], 1),
                            coordinate(input.key[4 * i + 2], input.key[4 * i + 3], 2));
        scalars.emplace_back(Field::conditional_assign(enabled, witness(input.public_inputs[i]), Field(0)));
    }
    Group result = Group::batch_mul(points, scalars);
    Group claimed(coordinate(input.proof[0], input.proof[1], 0), coordinate(input.proof[2], input.proof[3], 0));
    result.incomplete_assert_equal(claimed, "BN254_MSM incorrect result");
}

} // namespace acir_format
