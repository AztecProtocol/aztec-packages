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

// Specialization for Mega.
// Mega does NOT inherit Ultra's standard Poseidon2External/Internal relations — those are replaced
// by the compressed K=8 / external-compressed relations (see Poseidon2QuadInternalK8Relation etc.).
template <> class RelationChecker<MegaFlavor> : public RelationChecker<void> {
    using Base = RelationChecker<void>;

  public:
    static AllSubrelationFailures check_all(const auto& polynomials, const auto& params)
    {
        using FF = MegaFlavor::FF;
        AllSubrelationFailures all_subrelation_failures;

        // Ultra-shared relations (excluding standard Poseidon2 — replaced by compressed for Mega).
        auto try_check = [&]<typename R, bool linearly_dependent = false>(const char* name) {
            auto failures = Base::check<R, linearly_dependent>(polynomials, params, name);
            if (!failures.empty()) {
                all_subrelation_failures[name] = failures;
            }
        };
        try_check.template operator()<ArithmeticRelation<FF>>("Arithmetic");
        try_check.template operator()<UltraPermutationRelation<FF>>("UltraPermutation");
        try_check.template operator()<DeltaRangeConstraintRelation<FF>>("DeltaRangeConstraint");
        try_check.template operator()<EllipticRelation<FF>>("Elliptic");
        try_check.template operator()<MemoryRelation<FF>>("Memory");
        try_check.template operator()<NonNativeFieldRelation<FF>>("NonNativeField");
        try_check.template operator()<LogDerivLookupRelation<FF>, true>("LogDerivLookup");

        // Mega-specific relations.
        try_check.template operator()<EccOpQueueRelation<FF>>("MegaEccOpQueue");
        try_check.template operator()<DatabusLookupRelation<FF>, true>("MegaDatabusLookup");

        // Compressed Poseidon2 relations (K=8 internal + 2-per-row external + initial linear layer).
        try_check.template operator()<Poseidon2ExternalCompressedRelation<FF>>("Poseidon2ExternalCompressed");
        try_check.template operator()<Poseidon2InitialExternalRelation<FF>>("Poseidon2InitialExternal");
        try_check.template operator()<Poseidon2QuadInternalK8Relation<FF>>("Poseidon2QuadInternalK8");
        try_check.template operator()<Poseidon2QuadInternalK8TerminalRelation<FF>>("Poseidon2QuadInternalK8Terminal");
        try_check.template operator()<Poseidon2TransitionEntryK8Relation<FF>>("Poseidon2TransitionEntryK8");

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
