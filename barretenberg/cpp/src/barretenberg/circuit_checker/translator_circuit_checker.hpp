#pragma once
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/translator_vm/translator_decomposition_relation.hpp"
#include "barretenberg/relations/translator_vm/translator_extra_relations.hpp"
#include "barretenberg/relations/translator_vm/translator_non_native_field_relation.hpp"
#include "barretenberg/translator_vm/translator_circuit_builder.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
namespace bb {
class TranslatorCircuitChecker {
    using Builder = TranslatorCircuitBuilder;
    using Flavor = TranslatorFlavor;
    using Fr = Flavor::FF;
    using Fq = Flavor::BF;
    using WireIds = Builder::WireIds;
    using AllValues = Flavor::AllValues;
    using Params = RelationParameters<Fr>;

    // Number of limbs used to decompose a 254-bit value for modular arithmetic
    static constexpr size_t NUM_BINARY_LIMBS = Builder::NUM_BINARY_LIMBS;

    static constexpr size_t RESULT_ROW = Builder::RESULT_ROW;

  public:
    TranslatorCircuitChecker() = default;

    /**
     * @brief Get the result of accumulation, stored as 4 binary limbs in the first row of the circuit.
     *
     */
    static Fq get_computation_result(const Builder& circuit)
    {
        BB_ASSERT_GT(circuit.num_gates(), RESULT_ROW);
        return Fq(
            circuit.get_variable(circuit.wires[WireIds::ACCUMULATORS_BINARY_LIMBS_0][RESULT_ROW]) +
            circuit.get_variable(circuit.wires[WireIds::ACCUMULATORS_BINARY_LIMBS_1][RESULT_ROW]) * Builder::SHIFT_1 +
            circuit.get_variable(circuit.wires[WireIds::ACCUMULATORS_BINARY_LIMBS_2][RESULT_ROW]) * Builder::SHIFT_2 +
            circuit.get_variable(circuit.wires[WireIds::ACCUMULATORS_BINARY_LIMBS_3][RESULT_ROW]) * Builder::SHIFT_3);
    }

    /**
     * @brief Check the witness satisifies the circuit
     *
     * @details Goes through each gate and checks the correctness of accumulation using the Translator relations.
     * Checks TranslatorOpcodeConstraintRelation, TranslatorAccumulatorTransferRelation,
     * TranslatorDecompositionRelation, and TranslatorNonNativeFieldRelation for each row.
     *
     * Note: TranslatorPermutationRelation and TranslatorDeltaRangeConstraintRelation are not checked here
     * because they require grand product polynomials (z_perm) and sorted range constraint polynomials
     * that are only available at the prover level, not from the circuit builder directly.
     *
     * @return true if all relation constraints are satisfied, false otherwise
     */
    static bool check(const Builder& circuit);

  private:
    /**
     * @brief Build the RelationParameters from the circuit's public inputs.
     *
     * @details Populates evaluation_input_x (4 binary limbs + 1 native Fr),
     * batching_challenge_v powers (4 sets of 5 limbs), and accumulated_result (4 limbs).
     */
    static Params compute_relation_params(const Builder& circuit);

    /**
     * @brief Populate an AllValues struct for a single row of the circuit.
     *
     * @details Sets wire values from the circuit at row_idx, shifted wire values from row_idx+1
     * (or zero at the last row), and computes Lagrange selector values analytically.
     */
    static void populate_values(const Builder& circuit, AllValues& values, size_t row_idx);

    /**
     * @brief Check that a given relation evaluates to zero for the provided row values.
     *
     * @tparam Relation The relation type to check
     */
    template <typename Relation> static bool check_relation(const AllValues& values, const Params& params)
    {
        typename Relation::SumcheckArrayOfValuesOverSubrelations evals;
        for (auto& e : evals) {
            e = Fr(0);
        }
        Relation::accumulate(evals, values, params, Fr(1));
        for (auto& e : evals) {
            if (e != Fr(0)) {
                return false;
            }
        }
        return true;
    }
};
} // namespace bb
