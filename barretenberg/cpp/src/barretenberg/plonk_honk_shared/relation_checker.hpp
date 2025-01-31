#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"

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
     *
     * @tparam Relation a linearly independent Relation to be checked
     * @param polynomials prover polynomials
     * @param params a RelationParameters instance
     */
    template <typename Relation>
    static void check(const auto& polynomials,
                      const auto& params,
                      bool is_linearly_independent,
                      std::string label = "Relation")
    {
        // Define the appropriate accumulator type for the relation and initialize to zero
        typename Relation::SumcheckArrayOfValuesOverSubrelations result;
        for (auto& element : result) {
            element = 0;
        }

        for (size_t i = 0; i < polynomials.w_l.virtual_size(); i++) {
            if (is_linearly_independent) {
                // Evaluate each constraint in the relation and check that each is satisfied
                Relation::accumulate(result, polynomials.get_row(i), params, 1);
                size_t subrelation_idx = 0;
                for (auto& element : result) {
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
                    subrelation_idx++;
                }
            }
        }

        if (!is_linearly_independent) {
            // Result accumulated across entire execution trace should be zero
            for (auto& element : result) {
                if (element != 0) {
                    info("RelationChecker: ", label, " relation (linearly indep.) failed.");
                    ASSERT(false);
                }
            }
        }
    }
};

// Specialization for Ultra
template <> class RelationChecker<bb::UltraFlavor> : public RelationChecker<void> {
    using Base = RelationChecker<void>;

  public:
    static void check_all(const auto& polynomials, const auto& params)
    {
        using FF = UltraFlavor::FF;

        // Linearly independent relations (must be satisfied at each row)
        Base::check<UltraArithmeticRelation<FF>>(polynomials, params, true, "UltraArithmetic");
        Base::check<UltraPermutationRelation<FF>>(polynomials, params, true, "UltraPermutation");
        Base::check<DeltaRangeConstraintRelation<FF>>(polynomials, params, true, "DeltaRangeConstraint");
        Base::check<EllipticRelation<FF>>(polynomials, params, true, "Elliptic");
        Base::check<AuxiliaryRelation<FF>>(polynomials, params, true, "Auxiliary");
        Base::check<Poseidon2ExternalRelation<FF>>(polynomials, params, true, "Poseidon2External");
        Base::check<Poseidon2InternalRelation<FF>>(polynomials, params, true, "Poseidon2Internal");

        // Linearly dependent relations (must be satisfied as a sum across all rows)
        Base::check<LogDerivLookupRelation<FF>>(polynomials, params, false, "LogDerivLookup");
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

        // Linearly independent relations (must be satisfied at each row)
        Base::check<EccOpQueueRelation<FF>>(polynomials, params, true, "EccOpQueue");

        // Linearly dependent relations (must be satisfied as a sum across all rows)
        Base::check<DatabusLookupRelation<FF>>(polynomials, params, false, "DatabusLookup");
    }
};

} // namespace bb