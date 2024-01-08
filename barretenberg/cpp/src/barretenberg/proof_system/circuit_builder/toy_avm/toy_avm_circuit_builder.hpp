/**
 * @file avm_template_circuit_builder.hpp
 * @author Rumata888
 * @brief A circuit builder for the AVM toy version used to showcase permutation and lookup mechanisms for PIL
 *
 */
#pragma once

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/flavor/toy_avm.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/toy_avm/generic_permutation_relation.hpp"

namespace proof_system {

/**
 * @brief Circuit builder for the ToyAVM that is used to explain generic permutation settings
 *
 * @tparam Flavor
 */
template <typename Flavor> class ToyAVMCircuitBuilder {
  public:
    using FF = typename Flavor::FF;
    using Polynomial = typename Flavor::Polynomial;

    static constexpr size_t NUM_POLYNOMIALS = Flavor::NUM_ALL_ENTITIES;
    static constexpr size_t NUM_WIRES = Flavor::NUM_WIRES;

    using ProverPolynomials = typename Flavor::ProverPolynomials;
    size_t num_gates = 0;
    std::array<std::vector<FF>, NUM_WIRES> wires;
    ToyAVMCircuitBuilder() = default;

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
     * @return ProverPolynomials
     */
    ProverPolynomials compute_polynomials()
    {

        const auto num_gates_log2 = static_cast<size_t>(numeric::get_msb64(num_gates));
        size_t num_gates_pow2 = 1UL << (num_gates_log2 + (1UL << num_gates_log2 == num_gates ? 0 : 1));

        // We need at least 256 values for the range constraint
        num_gates_pow2 = num_gates_pow2 > 256 ? num_gates_pow2 : 256;

        // We need at least 256 values for the range constraint
        num_gates_pow2 = num_gates_pow2 > 256 ? num_gates_pow2 : 256;

        ProverPolynomials polys;
        for (Polynomial& poly : polys.get_all()) {
            poly = Polynomial(num_gates_pow2);
        }

        polys.lagrange_first[0] = 1;

        for (size_t i = 0; i < num_gates; ++i) {
            // Fill out the witness polynomials
            polys.permutation_set_column_1[i] = wires[0][i];
            polys.permutation_set_column_2[i] = wires[1][i];
            polys.permutation_set_column_3[i] = wires[2][i];
            polys.permutation_set_column_4[i] = wires[3][i];
            polys.self_permutation_column[i] = wires[4][i];

            // By default the permutation is over all rows where we place data
            polys.enable_tuple_set_permutation[i] = 1;
            // The same column permutation alternates between even and odd values
            polys.enable_single_column_permutation[i] = 1;
            polys.enable_first_set_permutation[i] = i & 1;
            polys.enable_second_set_permutation[i] = 1 - (i & 1);

            // Lookup-based range constraint related values

            // Store the value
            polys.range_constrained_column[i] = wires[5][i];
            // Make range constrained
            polys.lookup_is_range_constrained[i] = 1;
            uint256_t constrained_value = wires[5][i];
            // if the value is correct, update the appropriate counter
            if (constrained_value < 256) {
                polys.lookup_range_constraint_read_count[static_cast<size_t>(constrained_value.data[0])] =
                    polys.lookup_range_constraint_read_count[static_cast<size_t>(constrained_value.data[0])] + 1;
            }

            // Copy xor values
            polys.lookup_xor_argument_1[i] = wires[6][i];
            polys.lookup_xor_argument_2[i] = wires[7][i];
            polys.lookup_xor_result[i] = wires[8][i];
            polys.lookup_xor_accumulated_argument_1[i] = wires[9][i];
            polys.lookup_xor_accumulated_argument_2[i] = wires[10][i];
            polys.lookup_xor_accumulated_result[i] = wires[11][i];
            // Enable xor
            polys.lookup_is_xor_operation[i] = 1;

            // Calculate index of this xor table entry
            uint256_t xor_index = wires[6][i] * 16 + wires[7][i];
            // if the value is correct, update the appropriate counter
            if (xor_index < 256) {
                polys.lookup_xor_read_count[static_cast<size_t>(xor_index.data[0])] =
                    polys.lookup_xor_read_count[static_cast<size_t>(xor_index.data[0])] + 1;
            }
            // xor_index = (uint256_t(wires[9][i]) & 0xf) * 16 + (uint256_t(wires[10][i]) & 0xf);
            // // if the value is correct, update the appropriate counter
            // if (xor_index < 256) {
            //     polys.lookup_xor_read_count[static_cast<size_t>(xor_index.data[0])] =
            //         polys.lookup_xor_read_count[static_cast<size_t>(xor_index.data[0])] + 1;
            // }
        }
        for (size_t i = 0; i < 256; i++) {
            //  Fill range table
            polys.lookup_is_range_table_entry[i] = FF(1);
            polys.lookup_range_table_entries[i] = FF(i);

            // Fill xor table
            polys.lookup_is_xor_table_entry[i] = FF(1);
            // This is all combination of 4 bit values
            polys.lookup_xor_table_1[i] = FF(i >> 4);
            polys.lookup_xor_table_2[i] = FF(i % 16);
            polys.lookup_xor_table_3[i] = FF((i >> 4) ^ (i % 16));
            polys.lookup_xor_shift[i] = FF(16);
        }
        return polys;
    }

    /**
     * @brief Check that the circuit is correct (proof should work)
     *
     */
    bool check_circuit()
    {
        //        using FirstPermutationRelation = typename std::tuple_element_t<0, Flavor::Relations>;
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

        // Compute polynomial values
        auto polynomials = compute_polynomials();
        const size_t num_rows = polynomials.get_polynomial_size();

        // Check the tuple permutation relation
        proof_system::honk::logderivative_library::compute_logderivative_inverse<
            Flavor,
            honk::sumcheck::GenericPermutationRelation<honk::sumcheck::ExampleTuplePermutationSettings, FF>>(
            polynomials, params, num_rows);

        using PermutationRelation =
            honk::sumcheck::GenericPermutationRelation<honk::sumcheck::ExampleTuplePermutationSettings, FF>;
        typename honk::sumcheck::GenericPermutationRelation<honk::sumcheck::ExampleTuplePermutationSettings,
                                                            typename Flavor::FF>::SumcheckArrayOfValuesOverSubrelations
            permutation_result;
        for (auto& r : permutation_result) {
            r = 0;
        }
        for (size_t i = 0; i < num_rows; ++i) {
            PermutationRelation::accumulate(permutation_result, polynomials.get_row(i), params, 1);
        }
        for (auto r : permutation_result) {
            if (r != 0) {
                info("Tuple GenericPermutationRelation failed.");
                return false;
            }
        }
        // Check the single permutation relation
        proof_system::honk::logderivative_library::compute_logderivative_inverse<
            Flavor,
            honk::sumcheck::GenericPermutationRelation<honk::sumcheck::ExampleSameWirePermutationSettings, FF>>(
            polynomials, params, num_rows);

        using SameWirePermutationRelation =
            honk::sumcheck::GenericPermutationRelation<honk::sumcheck::ExampleSameWirePermutationSettings, FF>;
        typename honk::sumcheck::GenericPermutationRelation<honk::sumcheck::ExampleSameWirePermutationSettings,
                                                            typename Flavor::FF>::SumcheckArrayOfValuesOverSubrelations
            second_permutation_result;
        for (auto& r : second_permutation_result) {
            r = 0;
        }
        for (size_t i = 0; i < num_rows; ++i) {
            SameWirePermutationRelation::accumulate(second_permutation_result, polynomials.get_row(i), params, 1);
        }
        for (auto r : second_permutation_result) {
            if (r != 0) {
                info("Same wire  GenericPermutationRelation failed.");
                return false;
            }
        }

        // Check the range constraint relation
        proof_system::honk::logderivative_library::compute_logderivative_inverse<
            Flavor,
            honk::sumcheck::GenericLookupRelation<honk::sumcheck::ExampleLookupBasedRangeConstraintSettings, FF>>(
            polynomials, params, num_rows);

        using LookupRelation =
            honk::sumcheck::GenericLookupRelation<honk::sumcheck::ExampleLookupBasedRangeConstraintSettings, FF>;
        typename honk::sumcheck::GenericLookupRelation<honk::sumcheck::ExampleLookupBasedRangeConstraintSettings,
                                                       typename Flavor::FF>::SumcheckArrayOfValuesOverSubrelations
            range_constraint_result;
        for (auto& r : range_constraint_result) {
            r = 0;
        }
        for (size_t i = 0; i < num_rows; ++i) {
            LookupRelation::accumulate(range_constraint_result, polynomials.get_row(i), params, 1);
        }
        for (auto r : range_constraint_result) {
            if (r != 0) {
                info("RangeConstraintRelation failed.");
                return false;
            }
        }

        // Check the xor relation
        proof_system::honk::logderivative_library::compute_logderivative_inverse<
            Flavor,
            honk::sumcheck::GenericLookupRelation<honk::sumcheck::ExampleXorLookupConstraintSettings, FF>>(
            polynomials, params, num_rows);

        using XorLookupRelation =
            honk::sumcheck::GenericLookupRelation<honk::sumcheck::ExampleXorLookupConstraintSettings, FF>;
        typename honk::sumcheck::GenericLookupRelation<honk::sumcheck::ExampleXorLookupConstraintSettings,
                                                       typename Flavor::FF>::SumcheckArrayOfValuesOverSubrelations
            xor_constraint_result;
        for (auto& r : xor_constraint_result) {
            r = 0;
        }
        for (size_t i = 0; i < num_rows; ++i) {

            XorLookupRelation::accumulate(xor_constraint_result, polynomials.get_row(i), params, 1);
        }
        for (auto r : xor_constraint_result) {
            if (r != 0) {
                info("Xor Constraint failed.");
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
