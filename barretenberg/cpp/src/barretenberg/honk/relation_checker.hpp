// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"

namespace bb {

/**
 * @brief A debugging utility for checking whether a set of polynomials satisfies the relations for a given Flavor
 *
 * @tparam Flavor
 */
template <typename Flavor> class RelationChecker {
  public:
    /**
     * @brief Check that the provided polynomials satisfy all relations for a given Flavor
     */
    static void check_all([[maybe_unused]] const auto& polynomials, [[maybe_unused]] const auto& params)
    {
        // default; do nothing
    }

    /**
     * @brief Check that a single specified relation is satisfied for a set of polynomials
     */
    template <typename Relation, bool has_linearly_dependent = false>
    static void check(const auto& polynomials, const auto& params, std::string label = "Relation")
    {

        // Define the appropriate accumulator type for the relation and initialize to zero
        typename Relation::SumcheckArrayOfValuesOverSubrelations result;
        for (auto& element : result) {
            element = 0;
        }

        for (size_t i = 0; i < polynomials.get_polynomial_size(); i++) {

            Relation::accumulate(result, polynomials.get_row(i), params, 1);
            size_t subrelation_idx = 0;

            // Iterate over all the subrelation results and report if a linearly independent one failed
            for (auto& element : result) {
                if constexpr (has_linearly_dependent) {
                    if (element != 0 && Relation::SUBRELATION_LINEARLY_INDEPENDENT[subrelation_idx]) {
                        info("RelationChecker: ",
                             label,
                             " relation (subrelation idx: ",
                             subrelation_idx,
                             ") failed at row idx: ",
                             i,
                             ".");
                        ASSERT(false);
                    }
                } else {
                    if (element != 0) {
                        info("RelationChecker: ",
                             label,
                             " relation (subrelation idx: ",
                             subrelation_idx,
                             ") failed at row idx: ",
                             i,
                             ".");
                        ASSERT(false);
                    }
                }
                subrelation_idx++;
            }
        }

        if constexpr (has_linearly_dependent) {
            size_t subrelation_idx = 0;
            for (auto& element : result) {
                // Check that linearly dependent subrelation result is  0 over the entire execution trace
                if (element != 0 && Relation::SUBRELATION_LINEARLY_INDEPENDENT[subrelation_idx]) {
                    info("RelationChecker: ",
                         label,
                         " linearly dependent subrelation idx: ",
                         subrelation_idx,
                         " failed.");
                    ASSERT(false);
                }
                subrelation_idx++;
            }
        }
    };
};

// Specialization for Ultra
template <> class RelationChecker<bb::UltraFlavor> : public RelationChecker<void> {
    using Base = RelationChecker<void>;

  public:
    static void check_all(const auto& polynomials, const auto& params)
    {
        using FF = UltraFlavor::FF;

        // Linearly independent relations (must be satisfied at each row)
        Base::check<UltraArithmeticRelation<FF>>(polynomials, params, "UltraArithmetic");
        Base::check<UltraPermutationRelation<FF>>(polynomials, params, "UltraPermutation");
        Base::check<DeltaRangeConstraintRelation<FF>>(polynomials, params, "DeltaRangeConstraint");
        Base::check<EllipticRelation<FF>>(polynomials, params, "Elliptic");
        Base::check<AuxiliaryRelation<FF>>(polynomials, params, "Auxiliary");
        Base::check<Poseidon2ExternalRelation<FF>>(polynomials, params, "Poseidon2External");
        Base::check<Poseidon2InternalRelation<FF>>(polynomials, params, "Poseidon2Internal");

        // Linearly dependent relations (must be satisfied as a sum across all rows)
        Base::check<LogDerivLookupRelation<FF>, true>(polynomials, params, "LogDerivLookup");
    }
};

// Specialization for Mega
template <> class RelationChecker<MegaFlavor> : public RelationChecker<void> {
    using Base = RelationChecker<void>;

  public:
    static void check_all(const auto& polynomials, const auto& params)
    {
        // Check relations that are shared with Ultra
        RelationChecker<UltraFlavor>::check_all(polynomials, params);

        using FF = MegaFlavor::FF;
        Base::check<EccOpQueueRelation<FF>>(polynomials, params, "EccOpQueue");
        Base::check<DatabusLookupRelation<FF>, true>(polynomials, params, "DatabusLookup");
    }
};
} // namespace bb

// namespace bb