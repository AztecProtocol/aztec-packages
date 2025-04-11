#pragma once
#include "../../primitives/field/field.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/plonk_honk_shared/types/aggregation_object_type.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"

namespace bb::stdlib::recursion {

/**
 * @brief An object storing two EC points that represent the inputs to a pairing check.
 * @details The points may represent the output of a single partial recursive verification or the linear combination of
 * multiple sets of pairing points.
 *
 * @tparam Builder_
 */
template <typename Builder_> struct aggregation_state {
    using Builder = Builder_;
    using Curve = bn254<Builder>;
    using Group = typename Curve::Group;
    using Fr = typename Curve::ScalarField;
    Group P0;
    Group P1;

    bool has_data = false;

    // Number of bb::fr field elements used to represent a goblin element in the public inputs
    static constexpr size_t PUBLIC_INPUTS_SIZE = Group::PUBLIC_INPUTS_SIZE * 2;

    aggregation_state() = default;

    aggregation_state(const Group& P0, const Group& P1)
        : P0(P0)
        , P1(P1)
        , has_data(true)
    {}

    aggregation_state(std::array<Group, 2> const& points)
        : aggregation_state(points[0], points[1])
    {}

    typename Curve::bool_ct operator==(aggregation_state const& other) const
    {
        return P0 == other.P0 && P1 == other.P1;
    };

    /**
     * @brief Compute a linear combination of the present pairing points with an input set of pairing points
     *
     * @param other
     * @param recursion_separator
     */
    void aggregate(aggregation_state const& other, typename Curve::ScalarField recursion_separator)
    {
        // If Mega Builder is in use, the EC operations are deferred via Goblin
        if constexpr (std::is_same_v<Builder, MegaCircuitBuilder>) {
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1325): Can we improve efficiency here?
            P0 += other.P0 * recursion_separator;
            P1 += other.P1 * recursion_separator;
        } else {
            // Save gates using short scalars. We don't apply `bn254_endo_batch_mul` to the vector {1,
            // recursion_separator} directly to avoid edge cases.
            Group point_to_aggregate = other.P0.scalar_mul(recursion_separator, 128);
            P0 += point_to_aggregate;
            point_to_aggregate = other.P1.scalar_mul(recursion_separator, 128);
            P1 += point_to_aggregate;
        }
    }

    // Used in Plonk only. Delete with the rest of plonk.
    PairingPointAccumulatorIndices get_witness_indices_for_plonk()
    {
        PairingPointAccumulatorIndices witness_indices = {
            P0.x.binary_basis_limbs[0].element.normalize().witness_index,
            P0.x.binary_basis_limbs[1].element.normalize().witness_index,
            P0.x.binary_basis_limbs[2].element.normalize().witness_index,
            P0.x.binary_basis_limbs[3].element.normalize().witness_index,
            P0.y.binary_basis_limbs[0].element.normalize().witness_index,
            P0.y.binary_basis_limbs[1].element.normalize().witness_index,
            P0.y.binary_basis_limbs[2].element.normalize().witness_index,
            P0.y.binary_basis_limbs[3].element.normalize().witness_index,
            P1.x.binary_basis_limbs[0].element.normalize().witness_index,
            P1.x.binary_basis_limbs[1].element.normalize().witness_index,
            P1.x.binary_basis_limbs[2].element.normalize().witness_index,
            P1.x.binary_basis_limbs[3].element.normalize().witness_index,
            P1.y.binary_basis_limbs[0].element.normalize().witness_index,
            P1.y.binary_basis_limbs[1].element.normalize().witness_index,
            P1.y.binary_basis_limbs[2].element.normalize().witness_index,
            P1.y.binary_basis_limbs[3].element.normalize().witness_index,
        };
        return witness_indices;
    }

    // Used in Plonk only. Delete with the rest of plonk.
    void assign_object_to_proof_outputs_for_plonk()
    {
        P0 = P0.reduce();
        P1 = P1.reduce();
        this->set_public();
    }

    /**
     * @brief Set the witness indices for the limbs of the pairing points to public
     *
     * @return uint32_t The index into the public inputs array at which the representation is stored
     */
    uint32_t set_public()
    {
        uint32_t start_idx = P0.set_public();
        P1.set_public();

        Builder* ctx = P0.get_context();
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1325): Eventually the builder/PK/VK will store
        // public input key which should be set here and pairing_point_accumulator_public_input_indices should go away.
        uint32_t pub_idx = start_idx;
        for (uint32_t& idx : ctx->pairing_point_accumulator_public_input_indices) {
            idx = pub_idx++;
        }
        ctx->contains_pairing_point_accumulator = true;

        return start_idx;
    }

    /**
     * @brief Reconstruct an aggregation_state from its representation as limbs (generally stored in the public inputs)
     *
     * @param limbs The limbs of the pairing points
     * @return aggregation_state<Builder>
     */
    static aggregation_state<Builder> reconstruct_from_public(const std::span<const Fr, PUBLIC_INPUTS_SIZE>& limbs)
    {
        const size_t FRS_PER_POINT = Group::PUBLIC_INPUTS_SIZE;
        std::span<const Fr, FRS_PER_POINT> P0_limbs{ limbs.data(), FRS_PER_POINT };
        std::span<const Fr, FRS_PER_POINT> P1_limbs{ limbs.data() + FRS_PER_POINT, FRS_PER_POINT };
        Group P0 = Group::reconstruct_from_public(P0_limbs);
        Group P1 = Group::reconstruct_from_public(P1_limbs);
        return { P0, P1 };
    }
    /**
     * @brief Constructs an arbitrary but valid aggregation state from a valid set of pairing inputs.
     *
     * @param builder
     * @return aggregation_state<Builder>
     */
    static aggregation_state<Builder> construct_default(typename Curve::Builder& builder)
    {
        using BaseField = typename Curve::BaseField;
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/911): These are pairing points extracted from a
        // valid proof. This is a workaround because we can't represent the point at infinity in biggroup yet.
        uint256_t x0_val("0x031e97a575e9d05a107acb64952ecab75c020998797da7842ab5d6d1986846cf");
        uint256_t y0_val("0x178cbf4206471d722669117f9758a4c410db10a01750aebb5666547acf8bd5a4");
        uint256_t x1_val("0x0f94656a2ca489889939f81e9c74027fd51009034b3357f0e91b8a11e7842c38");
        uint256_t y1_val("0x1b52c2020d7464a0c80c0da527a08193fe27776f50224bd6fb128b46c1ddb67f");
        BaseField x0 = BaseField::from_witness(&builder, x0_val);
        BaseField y0 = BaseField::from_witness(&builder, y0_val);
        BaseField x1 = BaseField::from_witness(&builder, x1_val);
        BaseField y1 = BaseField::from_witness(&builder, y1_val);
        // aggregation_state<Builder> agg_obj{ Group(x0, y0), Group(x1, y1) };
        return { Group(x0, y0), Group(x1, y1) };
    }

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/984): Check how many gates this costs and if they're
    // necessary.
    static void add_default_pairing_points_to_public_inputs(Builder& builder)
    {
        aggregation_state<Builder> agg_obj = construct_default(builder);
        agg_obj.set_public();
    }
};

template <typename Builder> void read(uint8_t const*& it, aggregation_state<Builder>& as)
{
    using serialize::read;

    read(it, as.P0);
    read(it, as.P1);
    read(it, as.has_data);
};

template <typename Builder> void write(std::vector<uint8_t>& buf, aggregation_state<Builder> const& as)
{
    using serialize::write;

    write(buf, as.P0);
    write(buf, as.P1);
    write(buf, as.has_data);
};

template <typename NCT> std::ostream& operator<<(std::ostream& os, aggregation_state<NCT> const& as)
{
    return os << "P0: " << as.P0 << "\n"
              << "P1: " << as.P1 << "\n"
              << "has_data: " << as.has_data << "\n";
}

} // namespace bb::stdlib::recursion
