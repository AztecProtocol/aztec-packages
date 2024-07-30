#pragma once
#include "../../primitives/field/field.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/plonk_honk_shared/types/aggregation_object_type.hpp"

namespace bb::stdlib::recursion {

/**
 * Aggregation state contains the following:
 *   (P0, P1): the aggregated elements storing the verification results of proofs in the past
 *   proof_witness_indices: witness indices that point to (P0, P1)
 *   public_inputs: the public inputs of the inner proof, these become the private inputs to the recursive circuit
 *   has_data: indicates if this aggregation state contain past (P0, P1)
 */
template <typename Curve> struct aggregation_state {
    typename Curve::Group P0;
    typename Curve::Group P1;

    // The public inputs of the inner circuit are now private inputs of the outer circuit!
    // std::vector<typename Curve::ScalarField> public_inputs;
    // AggregationObjectIndices proof_witness_indices;
    bool has_data = false;

    typename Curve::bool_ct operator==(aggregation_state const& other) const
    {
        return P0 == other.P0 && P1 == other.P1;
        // && public_inputs == other.public_inputs &&
        //        proof_witness_indices == other.proof_witness_indices;
        //    has_data == other.has_data; can't compare as native
    };

    void aggregate(aggregation_state const& other, typename Curve::ScalarField recursion_separator)
    {
        P0 += other.P0 * recursion_separator;
        P1 += other.P1 * recursion_separator;
    }

    void aggregate(std::array<typename Curve::Group, 2> const& other, typename Curve::ScalarField recursion_separator)
    {
        P0 += other[0] * recursion_separator;
        P1 += other[1] * recursion_separator;
    }

    /**
     * @brief TODO(@dbanks12 please migrate A3 circuits to using `assign_object_to_proof_outputs`. Much safer to not
     * independently track `proof_witness_indices` and whether object has been assigned to public inputs)
     *
     */
    // void add_proof_outputs_as_public_inputs()
    // {
    //     auto* context = P0.get_context();
    //     context->add_recursive_proof(proof_witness_indices);
    // }

    AggregationObjectIndices get_witness_indices()
    {
        AggregationObjectIndices witness_indices = {
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
    void assign_object_to_proof_outputs()
    {
        // if (proof_witness_indices.size() == 0) {
        //     std::cerr << "warning. calling `assign_object_to_proof_outputs`, but aggregation object already has "
        //                  "assigned proof outputs to public inputs.";
        //     return;
        // }

        P0 = P0.reduce();
        P1 = P1.reduce();
        AggregationObjectIndices proof_witness_indices = get_witness_indices();

        auto* context = P0.get_context();

        CircuitChecker::check(*context);
        info("checked circuit before add_recursive_proof");
        context->add_recursive_proof(proof_witness_indices);
    }
};

template <typename Curve> void read(uint8_t const*& it, aggregation_state<Curve>& as)
{
    using serialize::read;

    read(it, as.P0);
    read(it, as.P1);
    // read(it, as.public_inputs);
    // read(it, as.proof_witness_indices);
    read(it, as.has_data);
};

template <typename Curve> void write(std::vector<uint8_t>& buf, aggregation_state<Curve> const& as)
{
    using serialize::write;

    write(buf, as.P0);
    write(buf, as.P1);
    // write(buf, as.public_inputs);
    // write(buf, as.proof_witness_indices);
    write(buf, as.has_data);
};

template <typename NCT> std::ostream& operator<<(std::ostream& os, aggregation_state<NCT> const& as)
{
    return os << "P0: " << as.P0 << "\n"
              << "P1: " << as.P1
              << "\n"
              //   << "public_inputs: " << as.public_inputs << "\n"
              //   << "proof_witness_indices: " << as.proof_witness_indices << "\n"
              << "has_data: " << as.has_data << "\n";
}
template <typename Builder, typename Curve>
aggregation_state<Curve> convert_witness_indices_to_agg_obj(Builder& builder,
                                                            AggregationObjectIndices const& witness_indices)
{
    aggregation_state<Curve> agg_obj;

    size_t idx = 0;
    std::array<typename Curve::Group, 2> pairing_points;
    for (size_t i = 0; i < 2; i++) {
        std::array<typename Curve::BaseField, 2> base_field_vals;
        for (size_t j = 0; j < 2; j++) {
            std::array<typename Builder::FF, 4> bigfield_limbs;
            for (size_t k = 0; k < 4; k++) {
                bigfield_limbs[k] = builder.get_variable(witness_indices[idx]);
                idx++;
            }
            base_field_vals[j] =
                typename Curve::BaseField(bigfield_limbs[0], bigfield_limbs[1], bigfield_limbs[2], bigfield_limbs[3]);
        }
        pairing_points[i] = typename Curve::Group(base_field_vals[0], base_field_vals[1]);
    }
    agg_obj.P0 = pairing_points[0];
    agg_obj.P1 = pairing_points[1];
    return agg_obj;
}

template <typename Builder> AggregationObjectIndices init_default_agg_obj_indices(Builder& builder)
{
    constexpr uint32_t NUM_LIMBS = 4;
    constexpr uint32_t NUM_LIMB_BITS = 68;
    constexpr uint32_t TOTAL_BITS = 254;

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/911): These are pairing points extracted from a valid
    // proof. This is a workaround because we can't represent the point at infinity in biggroup yet.
    AggregationObjectIndices agg_obj_indices = {};
    fq x0("0x031e97a575e9d05a107acb64952ecab75c020998797da7842ab5d6d1986846cf");
    fq y0("0x178cbf4206471d722669117f9758a4c410db10a01750aebb5666547acf8bd5a4");
    fq x1("0x0f94656a2ca489889939f81e9c74027fd51009034b3357f0e91b8a11e7842c38");
    fq y1("0x1b52c2020d7464a0c80c0da527a08193fe27776f50224bd6fb128b46c1ddb67f");
    std::vector<fq> aggregation_object_fq_values = { x0, y0, x1, y1 };
    size_t agg_obj_indices_idx = 0;
    for (fq val : aggregation_object_fq_values) {
        const uint256_t x = val;
        std::array<fr, NUM_LIMBS> val_limbs = { x.slice(0, NUM_LIMB_BITS),
                                                x.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2),
                                                x.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3),
                                                x.slice(NUM_LIMB_BITS * 3, TOTAL_BITS) };
        for (size_t i = 0; i < NUM_LIMBS; ++i) {
            uint32_t idx = builder.add_variable(val_limbs[i]);
            agg_obj_indices[agg_obj_indices_idx] = idx;
            agg_obj_indices_idx++;
        }
    }
    return agg_obj_indices;
}
template <typename Builder, typename Curve> aggregation_state<Curve> init_default_aggregation_state(Builder& builder)
{
    AggregationObjectIndices agg_obj_indices = init_default_agg_obj_indices(builder);
    return convert_witness_indices_to_agg_obj<Builder, Curve>(builder, agg_obj_indices);
}

} // namespace bb::stdlib::recursion
