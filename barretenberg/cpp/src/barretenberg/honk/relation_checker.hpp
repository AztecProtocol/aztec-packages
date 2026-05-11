#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/relations/translator_vm/translator_decomposition_relation.hpp"
#include "barretenberg/relations/translator_vm/translator_extra_relations.hpp"
#include "barretenberg/relations/translator_vm/translator_non_native_field_relation.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"

namespace bb {

/**
 * @brief A debugging utility for checking whether a set of polynomials satisfies the relations for a given Flavor
 *
 * @tparam Flavor
 */
template <typename Flavor> class RelationChecker {
  public:
    using FirstSubrelationFailures =
        std::map<size_t,
                 uint32_t>; // key is the subrelation idx, value is the row idx.
                            // for relations which `has_linearly_dependent`, those subrelations which are "not
                            // linearly independent" (i.e., are only required to vanish on the entire execution trace)
                            // are treated as follows: if they do _not_ vanish when evaluated over the entire execution
                            // trace, we set the row_idx in this data structure to 0.
    using AllSubrelationFailures =
        std::map<std::string, FirstSubrelationFailures>; // key is the name of a Relation, value is of type
                                                         // `FirstSubrelationFailures`. Theck if there are no failures,
                                                         // simply check if this hashmap is empty.
    /**
     * @brief Check that the provided polynomials satisfy all relations for a given Flavor
     */
    static AllSubrelationFailures check_all([[maybe_unused]] const auto& polynomials,
                                            [[maybe_unused]] const auto& params)
    {
        // default
        return AllSubrelationFailures{};
    }

    /**
     * @brief Check that a single specified relation is satisfied for a set of polynomials
     */
    template <typename Relation, bool has_linearly_dependent = false>
    static FirstSubrelationFailures check(const auto& polynomials,
                                          const auto& params,
                                          [[maybe_unused]] std::string label = "Relation",
                                          uint32_t start_row = 0)
    {
        FirstSubrelationFailures first_failure_per_subrelation;
        // Define the appropriate accumulator type for the relation and initialize to zero
        typename Relation::SumcheckArrayOfValuesOverSubrelations result;
        for (auto& element : result) {
            element = 0;
        }

        for (uint32_t i = start_row; i < polynomials.get_polynomial_size(); i++) {

            Relation::accumulate(result, polynomials.get_row(i), params, 1);
            size_t subrelation_idx = 0;

            // Iterate over all the subrelation results and report if a linearly independent one failed
            for (auto& element : result) {
                if constexpr (has_linearly_dependent) {
                    if (element != 0 && Relation::SUBRELATION_LINEARLY_INDEPENDENT[subrelation_idx]) {
                        // only record the first failure for this subrelation
                        if (!first_failure_per_subrelation.contains(subrelation_idx)) {
                            first_failure_per_subrelation[subrelation_idx] = i;
                        }
                    }
                } else {
                    if (element != 0) {
                        // only record the first failure for this subrelation
                        if (!first_failure_per_subrelation.contains(subrelation_idx)) {
                            first_failure_per_subrelation[subrelation_idx] = i;
                        }
                    }
                }
                subrelation_idx++;
            }
        }

        if constexpr (has_linearly_dependent) {
            size_t subrelation_idx = 0;
            for (auto& element : result) {
                // Check that linearly _dependent_ subrelation result is 0 over the entire execution trace
                if (element != 0 && !Relation::SUBRELATION_LINEARLY_INDEPENDENT[subrelation_idx]) {
                    if (!first_failure_per_subrelation.contains(subrelation_idx)) {
                        first_failure_per_subrelation[subrelation_idx] = 0;
                    }
                }
                subrelation_idx++;
            }
        }
        return first_failure_per_subrelation;
    };
};

// Specialization for Ultra
template <> class RelationChecker<bb::UltraFlavor> : public RelationChecker<void> {
    using Base = RelationChecker<void>;

  public:
    static AllSubrelationFailures check_all(const auto& polynomials, const auto& params)
    {
        using FF = UltraFlavor::FF;

        AllSubrelationFailures all_subrelation_failures;

        // Linearly independent relations (must be satisfied at each row)
        auto ultra_arithmetic_subrelation_failures =
            Base::check<ArithmeticRelation<FF>>(polynomials, params, "UltraArithmetic");
        if (!ultra_arithmetic_subrelation_failures.empty()) {
            all_subrelation_failures["UltraArithmetic"] = ultra_arithmetic_subrelation_failures;
        }
        auto ultra_permutation_subrelation_failures =
            Base::check<UltraPermutationRelation<FF>>(polynomials, params, "UltraPermutation");
        if (!ultra_permutation_subrelation_failures.empty()) {
            all_subrelation_failures["UltraPermutation"] = ultra_permutation_subrelation_failures;
        }
        auto ultra_delta_range_subrelation_failures =
            Base::check<DeltaRangeConstraintRelation<FF>>(polynomials, params, "DeltaRangeConstraint");
        if (!ultra_delta_range_subrelation_failures.empty()) {
            all_subrelation_failures["UltraDeltaRange"] = ultra_delta_range_subrelation_failures;
        }
        auto ultra_elliptic_subrelation_failures = Base::check<EllipticRelation<FF>>(polynomials, params, "Elliptic");
        if (!ultra_elliptic_subrelation_failures.empty()) {
            all_subrelation_failures["UltraElliptic"] = ultra_elliptic_subrelation_failures;
        }
        auto ultra_memory_subrelation_failures = Base::check<MemoryRelation<FF>>(polynomials, params, "Memory");
        if (!ultra_memory_subrelation_failures.empty()) {
            all_subrelation_failures["UltraMemory"] = ultra_memory_subrelation_failures;
        }
        auto ultra_non_native_field_subrelation_failures =
            Base::check<NonNativeFieldRelation<FF>>(polynomials, params, "NonNativeField");
        if (!ultra_non_native_field_subrelation_failures.empty()) {
            all_subrelation_failures["NonNativeField"] = ultra_non_native_field_subrelation_failures;
        }
        auto ultra_poseidon2_external_subrelation_failures =
            Base::check<Poseidon2ExternalRelation<FF>>(polynomials, params, "Poseidon2External");
        if (!ultra_poseidon2_external_subrelation_failures.empty()) {
            all_subrelation_failures["UltraPoseidon2External"] = ultra_poseidon2_external_subrelation_failures;
        }
        auto ultra_poseidon2_internal_subrelation_failures =
            Base::check<Poseidon2InternalRelation<FF>>(polynomials, params, "Poseidon2Internal");
        if (!ultra_poseidon2_internal_subrelation_failures.empty()) {
            all_subrelation_failures["UltraPoseidon2Internal"] = ultra_poseidon2_internal_subrelation_failures;
        }

        // Relations that have "linearly dependent" subrelations
        auto ultra_log_derivative_subrelation_failures =
            Base::check<LogDerivLookupRelation<FF>, true>(polynomials, params, "LogDerivLookup");
        if (!ultra_log_derivative_subrelation_failures.empty()) {
            all_subrelation_failures["UltraLogDerivative"] = ultra_log_derivative_subrelation_failures;
        }
        return all_subrelation_failures;
    }
};

// Specialization for Mega
template <> class RelationChecker<MegaFlavor> : public RelationChecker<void> {
    using Base = RelationChecker<void>;

  public:
    static AllSubrelationFailures check_all(const auto& polynomials, const auto& params)
    {
        using FF = MegaFlavor::FF;

        AllSubrelationFailures all_subrelation_failures;

        // Linearly independent relations shared with Ultra --- EXCEPT Poseidon2InternalRelation,
        // which is not present in MegaFlavor (Mega covers all internal rounds via the compressed
        // quad-internal block).
        auto arith = Base::check<ArithmeticRelation<FF>>(polynomials, params, "UltraArithmetic");
        if (!arith.empty()) {
            all_subrelation_failures["UltraArithmetic"] = arith;
        }
        auto perm = Base::check<UltraPermutationRelation<FF>>(polynomials, params, "UltraPermutation");
        if (!perm.empty()) {
            all_subrelation_failures["UltraPermutation"] = perm;
        }
        auto delta_range = Base::check<DeltaRangeConstraintRelation<FF>>(polynomials, params, "DeltaRangeConstraint");
        if (!delta_range.empty()) {
            all_subrelation_failures["UltraDeltaRange"] = delta_range;
        }
        auto elliptic = Base::check<EllipticRelation<FF>>(polynomials, params, "Elliptic");
        if (!elliptic.empty()) {
            all_subrelation_failures["UltraElliptic"] = elliptic;
        }
        auto memory = Base::check<MemoryRelation<FF>>(polynomials, params, "Memory");
        if (!memory.empty()) {
            all_subrelation_failures["UltraMemory"] = memory;
        }
        auto nnf = Base::check<NonNativeFieldRelation<FF>>(polynomials, params, "NonNativeField");
        if (!nnf.empty()) {
            all_subrelation_failures["NonNativeField"] = nnf;
        }
        auto p2_ext = Base::check<Poseidon2ExternalRelation<FF>>(polynomials, params, "Poseidon2External");
        if (!p2_ext.empty()) {
            all_subrelation_failures["UltraPoseidon2External"] = p2_ext;
        }
        auto p2_initial_ext =
            Base::check<Poseidon2InitialExternalRelation<FF>>(polynomials, params, "Poseidon2InitialExternal");
        if (!p2_initial_ext.empty()) {
            all_subrelation_failures["Poseidon2InitialExternal"] = p2_initial_ext;
        }

        // Compressed quad-internal relations (Mega-only, replacing Poseidon2InternalRelation).
        auto p2_quad = Base::check<Poseidon2QuadInternalRelation<FF>>(polynomials, params, "Poseidon2QuadInternal");
        if (!p2_quad.empty()) {
            all_subrelation_failures["Poseidon2QuadInternal"] = p2_quad;
        }
        auto p2_quad_term = Base::check<Poseidon2QuadInternalTerminalRelation<FF>>(
            polynomials, params, "Poseidon2QuadInternalTerminal");
        if (!p2_quad_term.empty()) {
            all_subrelation_failures["Poseidon2QuadInternalTerminal"] = p2_quad_term;
        }
        auto p2_entry =
            Base::check<Poseidon2TransitionEntryRelation<FF>>(polynomials, params, "Poseidon2TransitionEntry");
        if (!p2_entry.empty()) {
            all_subrelation_failures["Poseidon2TransitionEntry"] = p2_entry;
        }

        // Linearly-dependent log-derivative lookup (shared with Ultra).
        auto logderiv = Base::check<LogDerivLookupRelation<FF>, true>(polynomials, params, "LogDerivLookup");
        if (!logderiv.empty()) {
            all_subrelation_failures["UltraLogDerivative"] = logderiv;
        }

        // Mega-specific relations.
        auto mega_ecc_op_queue_subrelation_failures =
            Base::check<EccOpQueueRelation<FF>>(polynomials, params, "EccOpQueue");
        if (!mega_ecc_op_queue_subrelation_failures.empty()) {
            all_subrelation_failures["MegaEccOpQueue"] = mega_ecc_op_queue_subrelation_failures;
        }

        auto mega_databus_lookup_subrelation_failures =
            Base::check<DatabusLookupRelation<FF>, true>(polynomials, params, "DatabusLookup");
        if (!mega_databus_lookup_subrelation_failures.empty()) {
            all_subrelation_failures["MegaDatabusLookup"] = mega_databus_lookup_subrelation_failures;
        }

        return all_subrelation_failures;
    }
};

// Specialization for TranslatorFlavor: checks the four row-by-row relations that do not require
// grand product polynomials (Permutation and DeltaRangeConstraint are excluded as they need z_perm
// and sorted ordered_range_constraints polynomials computed during proving).
template <> class RelationChecker<TranslatorFlavor> : public RelationChecker<void> {
    using Base = RelationChecker<void>;

  public:
    static AllSubrelationFailures check_all(const auto& polynomials, const auto& params)
    {
        using FF = TranslatorFlavor::FF;
        AllSubrelationFailures all_subrelation_failures;

        auto try_check = [&]<typename R>(const char* name) {
            auto failures = Base::check<R>(polynomials, params, name);
            if (!failures.empty()) {
                all_subrelation_failures[name] = failures;
            }
        };

        try_check.template operator()<TranslatorOpcodeConstraintRelation<FF>>("TranslatorOpcodeConstraint");
        try_check.template operator()<TranslatorAccumulatorTransferRelation<FF>>("TranslatorAccumulatorTransfer");
        try_check.template operator()<TranslatorDecompositionRelation<FF>>("TranslatorDecomposition");
        try_check.template operator()<TranslatorNonNativeFieldRelation<FF>>("TranslatorNonNativeField");

        return all_subrelation_failures;
    }
};

} // namespace bb
