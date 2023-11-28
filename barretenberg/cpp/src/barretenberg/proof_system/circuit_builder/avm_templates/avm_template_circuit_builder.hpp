/**
 * @file avm_template_circuit_builder.hpp
 * @author Rumata888
 * @brief A circuit builder for the AVM toy version used to showcase permutation and lookup mechanisms for PIL
 *
 */
#pragma once

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/flavor/avm_template.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/relations/relation_parameters.hpp"

namespace proof_system {

template <typename Flavor> class AVMTemplateCircuitBuilder {
  public:
    using FF = typename Flavor::FF;
    using Polynomial = typename Flavor::Polynomial;

    static constexpr size_t NUM_POLYNOMIALS = Flavor::NUM_ALL_ENTITIES;
    static constexpr size_t NUM_WIRES = Flavor::NUM_WIRES;

    using AllPolynomials = typename Flavor::AllPolynomials;
    size_t num_gates = 0;
    std::array<std::vector<FF>, NUM_WIRES> wires;
    AVMTemplateCircuitBuilder() = default;

    void add_row(const std::array<FF, NUM_WIRES> row)
    {
        for (size_t i = 0; i < NUM_WIRES; i++) {
            wires[i].emplace_back(row[i]);
        }
        num_gates = wires[0].size();
    }

    /**
     * @brief Compute the AVM Template flavor polynomial data required to generate a proof
     *
     * @return AllPolynomials
     */
    AllPolynomials compute_polynomials()
    {

        const auto num_gates_log2 = static_cast<size_t>(numeric::get_msb64(num_gates));
        size_t num_gates_pow2 = 1UL << (num_gates_log2 + (1UL << num_gates_log2 == num_gates ? 0 : 1));

        AllPolynomials polys;
        for (auto* poly : polys.pointer_view()) {
            *poly = Polynomial(num_gates_pow2);
        }

        polys.lagrange_first[0] = 1;

        for (size_t i = 0; i < num_gates; ++i) {
            polys.permutation_set_column_1[i] = wires[0][i];
            polys.permutation_set_column_2[i] = wires[1][i];
            polys.permutation_set_column_3[i] = wires[2][i];
            polys.permutation_set_column_4[i] = wires[3][i];
            // By default the permutation is over all rows where we place data
            polys.enable_set_permutation[i] = 1;
        }
        return polys;
    }

    /**
     * @brief Check that the circuit is correct (proof should work)
     *
     */
    bool check_circuit()
    {
        // For now only gamma and beta are used
        const FF gamma = FF::random_element();
        const FF beta = FF::random_element();
        proof_system::RelationParameters<typename Flavor::FF> params{
            .eta = 0,
            .beta = beta,
            .gamma = gamma,
            .public_input_delta = 0,
            .lookup_grand_product_delta = 0,
            .beta_sqr = 0,
            .beta_cube = 0,
            .eccvm_set_permutation_delta = 0,
        };

        auto polynomials = compute_polynomials();
        const size_t num_rows = polynomials.get_polynomial_size();
        proof_system::honk::logderivative_library::
            compute_logderivative_inverse<Flavor, honk::sumcheck::GenericPermutationRelation<FF>>(
                polynomials, params, num_rows);

        using PermutationRelation = honk::sumcheck::GenericPermutationRelation<FF>;
        typename honk::sumcheck::GenericPermutationRelation<typename Flavor::FF>::SumcheckArrayOfValuesOverSubrelations
            permutation_result;
        for (auto& r : permutation_result) {
            r = 0;
        }
        for (size_t i = 0; i < num_rows; ++i) {
            PermutationRelation::accumulate(permutation_result, polynomials.get_row(i), params, 1);
        }
        for (auto r : permutation_result) {
            if (r != 0) {
                info("Relation GenericPermutationRelation failed.");
                return false;
            }
        }
        return true;
    }

    [[nodiscard]] size_t get_num_gates() const { return num_gates; }

    [[nodiscard]] size_t get_circuit_subgroup_size(const size_t num_rows) const
    {

        const auto num_rows_log2 = static_cast<size_t>(numeric::get_msb64(num_rows));
        size_t num_rows_pow2 = 1UL << (num_rows_log2 + (1UL << num_rows_log2 == num_rows ? 0 : 1));
        return num_rows_pow2;
    }
};
} // namespace proof_system
