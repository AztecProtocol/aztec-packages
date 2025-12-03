// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

/**
 * @file sumcheck_test_flavor.hpp
 * @brief Minimal test flavors for sumcheck testing without UltraFlavor dependencies
 *
 * @section motivation Motivation
 * This file provides simplified flavors designed specifically for testing sumcheck in isolation.
 * Using these flavors instead of UltraFlavor has several advantages:
 * - Faster tests (only 13 entities vs 41 in UltraFlavor)
 * - Clearer tests (only arithmetic relation, no lookups/permutations/etc)
 * - No coupling to circuit builder complexity
 * - Easy to create variants for specific test scenarios
 *
 * @section flavors Available Flavors
 * - SumcheckTestFlavor: Base flavor (non-ZK, short monomials, arithmetic only)
 * - SumcheckTestFlavorZK: Zero-knowledge variant (HasZK = true)
 * - SumcheckTestFlavorFullBary: Full barycentric extension (USE_SHORT_MONOMIALS = false)
 *
 * @section usage Usage Example
 * @code
 * // In sumcheck.test.cpp, instead of:
 * // using Flavor = UltraFlavor;
 *
 * // Use:
 * using Flavor = SumcheckTestFlavor;
 * using FF = typename Flavor::FF;
 * using ProverPolynomials = typename Flavor::ProverPolynomials;
 *
 * // Create simple test polynomials
 * ProverPolynomials prover_polynomials(circuit_size);
 *
 * // Set up arithmetic relation: q_arith * (q_m * w_l * w_r + q_l * w_l + q_r * w_r + q_o * w_o + q_4 * w_4 + q_c)
 * prover_polynomials.q_arith = Polynomial({ 1, 1, 1, 1 });
 * prover_polynomials.q_l = Polynomial({ 1, 1, 1, 1 });
 * prover_polynomials.w_l = Polynomial({ 2, 3, 4, 5 });
 * // ... set other polynomials as needed
 *
 * // Run sumcheck as usual
 * SumcheckProver<Flavor> prover(...);
 * auto output = prover.prove(...);
 * @endcode
 * @note Tests can now use template parameters to configure the flavor.
 */

#pragma once

#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/relation_types.hpp"
#include "barretenberg/relations/ultra_arithmetic_relation.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

/**
 * @brief A linearly dependent test relation for sumcheck testing
 * @details This relation has a single subrelation that is linearly dependent, meaning it
 * should NOT be scaled by the sumcheck scaling factor during accumulation.
 *
 * This is used alongside ArithmeticRelation (which IS linearly independent and gets scaled)
 * to test that sumcheck correctly handles the SUBRELATION_LINEARLY_INDEPENDENT array.
 *
 * Relation: q_test * w_test_1
 */
template <typename FF_> class DependentTestRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 1> SUBRELATION_PARTIAL_LENGTHS{
        2 // degree 1: q_test * w_test_1
    };

    static constexpr std::array<bool, 1> SUBRELATION_LINEARLY_INDEPENDENT{
        false // This subrelation is NOT linearly independent (should NOT be scaled)
    };

    template <typename AllEntities> static bool skip(const AllEntities& in) { return in.q_test.is_zero(); }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           const Parameters& /*unused*/,
                           const FF& /*scaling_factor*/)
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        // Note: NO scaling_factor used here - this is linearly dependent!
        auto tmp = in.w_test_1 * in.q_test;
        std::get<0>(evals) += Accumulator(tmp);
    }
};

template <typename FF> using DependentTestRelation = Relation<DependentTestRelationImpl<FF>>;

} // namespace bb

namespace bb {

/**
 * @brief A flexible, minimal test flavor for sumcheck testing
 * @details This flavor is designed to test sumcheck in isolation without dependencies on full Ultra complexity.
 * It includes TWO relations:
 * 1. ArithmeticRelation - linearly independent (WILL be scaled by sumcheck)
 * 2. DependentTestRelation - linearly DEPENDENT (will NOT be scaled)
 *
 * Tests can activate either or both relations via selectors.
 *
 * @tparam CurveType The elliptic curve to use (BN254 or Grumpkin)
 * @tparam HasZK_ Whether to use ZK sumcheck (adds masking rows)
 * @tparam UseShortMonomials_ Whether to use short monomials (degree-1) or full barycentric extension
 *
 * Benefits:
 * - Tests are faster (only 16 entities vs 41 in UltraFlavor)
 * - Tests are clearer (only essential relations)
 * - No coupling to Ultra-specific features (lookups, permutations, etc.)
 * - Template parameters allow all combinations (ZK + Grumpkin + FullBary, etc.)
 * - Clean separation: one independent relation, one dependent relation
 *
 * Example usage:
 * @code
 * // Base flavor (BN254, non-ZK, short monomials)
 * using Flavor = SumcheckTestFlavor_<>;
 *
 * // ZK variant
 * using FlavorZK = SumcheckTestFlavor_<curve::BN254, true>;
 *
 * // Grumpkin with full barycentric extension
 * using FlavorGrumpkin = SumcheckTestFlavor_<curve::Grumpkin, false, false>;
 *
 * // In tests, activate relations via selectors:
 * prover_polynomials.q_arith = Polynomial({ 1, 1, 1, 1 }); // Activate arithmetic (independent)
 * prover_polynomials.q_test = Polynomial({ 1, 1, 1, 1 });  // Activate test relation (dependent)
 * @endcode
 */
template <typename CurveType = curve::BN254, bool HasZK_ = false, bool UseShortMonomials_ = true>
class SumcheckTestFlavor_ {
  public:
    using CircuitBuilder = UltraCircuitBuilder;
    using Curve = CurveType;
    using FF = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;
    using PCS = KZG<Curve>;
    using Polynomial = bb::Polynomial<FF>;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<Curve>;
    using Transcript = NativeTranscript;

    // Configuration constants from template parameters
    static constexpr bool HasZK = HasZK_;
    static constexpr bool USE_SHORT_MONOMIALS = UseShortMonomials_;
    static constexpr bool USE_PADDING = false;
    static constexpr size_t NUM_WIRES = 4;

    // Entity counts:
    // Precomputed: q_m, q_l, q_r, q_o, q_4, q_c, q_arith + q_test = 8
    // Witness: w_l, w_r, w_o, w_4 + w_test_1, w_test_2 = 6
    // Shifted: w_l_shift, w_4_shift = 2
    // Note: No gemini_masking_poly - that's a PCS concept, not sumcheck
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = 8;
    static constexpr size_t NUM_WITNESS_ENTITIES = 6;
    static constexpr size_t NUM_SHIFTED_ENTITIES = 2;
    static constexpr size_t NUM_ALL_ENTITIES = NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES + NUM_SHIFTED_ENTITIES;

    // Two relations: Arithmetic (linearly independent) + DependentTest (linearly dependent)
    // Tests can activate either or both via selectors:
    // - q_arith = 1 : activate arithmetic relation (linearly independent, WILL be scaled)
    // - q_test = 1 : activate dependent test relation (linearly dependent, will NOT be scaled)
    template <typename FF_> using Relations_ = std::tuple<ArithmeticRelation<FF_>, DependentTestRelation<FF_>>;
    using Relations = Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    // For ZK flavors, BATCHED_RELATION_PARTIAL_LENGTH is incremented by 1 for the libra masking univariates
    // For BN254 with ZK, this must match Curve::LIBRA_UNIVARIATES_LENGTH (9)
    // Note: MAX_PARTIAL_RELATION_LENGTH = 6 (from ArithmeticRelation's [6,5])
    // Non-ZK: 6 + 1 = 7
    // ZK: 6 + 3 = 9 (matches BN254::LIBRA_UNIVARIATES_LENGTH)
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + (HasZK ? 3 : 1);
    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;
    using SubrelationSeparator = FF;

    static constexpr bool has_zero_row = false;

    /**
     * @brief Precomputed polynomials (selectors)
     * @details Includes selectors for both relations
     */
    template <typename DataType> class PrecomputedEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              q_m,     // Multiplication selector (arithmetic)
                              q_l,     // Left wire selector (arithmetic)
                              q_r,     // Right wire selector (arithmetic)
                              q_o,     // Output wire selector (arithmetic)
                              q_4,     // Fourth wire selector (arithmetic)
                              q_c,     // Constant selector (arithmetic)
                              q_arith, // Arithmetic gate enable (linearly independent, WILL be scaled)
                              q_test)  // Test relation enable (linearly dependent, will NOT be scaled)
    };

    /**
     * @brief Witness polynomials
     * @details Includes wires for both arithmetic relation and dependent test relation
     */
    template <typename DataType> class WitnessEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              w_l,      // Left wire (arithmetic)
                              w_r,      // Right wire (arithmetic)
                              w_o,      // Output wire (arithmetic)
                              w_4,      // Fourth wire (arithmetic)
                              w_test_1, // Test wire 1 (dependent test relation)
                              w_test_2) // Test wire 2 (dependent test relation, currently unused)
    };

    /**
     * @brief Shifted witness polynomials
     */
    template <typename DataType> class ShiftedEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              w_l_shift, // w_l shifted by 1
                              w_4_shift) // w_4 shifted by 1
    };

    /**
     * @brief All entities combined
     * @details Note: We don't include gemini_masking_poly here because that's a Gemini/PCS concept,
     * not a sumcheck concept. For ZK sumcheck testing, the key difference is the increased
     * BATCHED_RELATION_PARTIAL_LENGTH to accommodate Libra masking univariates.
     */
    template <typename DataType>
    class AllEntities : public PrecomputedEntities<DataType>,
                        public WitnessEntities<DataType>,
                        public ShiftedEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(PrecomputedEntities<DataType>, WitnessEntities<DataType>, ShiftedEntities<DataType>)

        auto get_precomputed() { return PrecomputedEntities<DataType>::get_all(); }
        auto get_witness() { return WitnessEntities<DataType>::get_all(); }
        auto get_witness() const { return WitnessEntities<DataType>::get_all(); }
        auto get_shifted() { return ShiftedEntities<DataType>::get_all(); }
    };

    /**
     * @brief Container for prover polynomials
     */
    class ProverPolynomials : public AllEntities<Polynomial> {
      public:
        ProverPolynomials() = default;
        ProverPolynomials(size_t circuit_size)
        {
            for (auto& poly : this->get_precomputed()) {
                poly = Polynomial(circuit_size);
            }
            for (auto& poly : this->get_witness()) {
                poly = Polynomial(circuit_size);
            }
            for (auto& poly : this->get_shifted()) {
                poly = Polynomial(circuit_size);
            }
        }

        [[nodiscard]] size_t get_polynomial_size() const { return this->w_l.size(); }

        /**
         * @brief Get the polynomials that will be shifted
         * @return RefArray of polynomials to be shifted (w_l, w_4)
         */
        auto get_to_be_shifted() { return RefArray{ this->w_l, this->w_4 }; }

        /**
         * @brief Set all shifted polynomials based on their to-be-shifted counterpart
         * @details This must be called after the witness polynomials are populated
         */
        void set_shifted()
        {
            for (auto [shifted, to_be_shifted] : zip_view(this->get_shifted(), this->get_to_be_shifted())) {
                shifted = to_be_shifted.shifted();
            }
        }
    };

    /**
     * @brief Container for univariates (used in sumcheck)
     */
    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;

    /**
     * @brief Extended edges for sumcheck
     */
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;

    /**
     * @brief Container for evaluations
     */
    class AllValues : public AllEntities<FF> {
      public:
        using Base = AllEntities<FF>;
        using Base::Base;
    };

    /**
     * @brief Partially evaluated multivariates for folded sumcheck
     */
    class PartiallyEvaluatedMultivariates : public AllEntities<Polynomial> {
      public:
        PartiallyEvaluatedMultivariates() = default;
        PartiallyEvaluatedMultivariates(const ProverPolynomials& full_polynomials, size_t circuit_size)
        {
            for (auto [poly, full_poly] : zip_view(this->get_all(), full_polynomials.get_all())) {
                size_t desired_size = (full_poly.end_index() / 2) + (full_poly.end_index() % 2);
                poly = Polynomial(desired_size, circuit_size / 2);
            }
        }
    };
};

// ================================================================================================
// Convenient type aliases for common test configurations
// ================================================================================================
// Note: All flavors include both relations (arithmetic + test).
// Tests can choose which to activate via selectors (q_arith = 1 or q_test = 1).

/**
 * @brief Base test flavor (BN254, non-ZK, short monomials)
 * @details Most common configuration for basic sumcheck testing
 */
using SumcheckTestFlavor = SumcheckTestFlavor_<curve::BN254, false, true>;

/**
 * @brief Zero-knowledge variant
 * @details Tests sumcheck with masking (HasZK = true)
 */
using SumcheckTestFlavorZK = SumcheckTestFlavor_<curve::BN254, true, true>;

/**
 * @brief Full barycentric extension variant
 * @details Tests full extension to MAX_PARTIAL_RELATION_LENGTH (USE_SHORT_MONOMIALS = false)
 */
using SumcheckTestFlavorFullBary = SumcheckTestFlavor_<curve::BN254, false, false>;

/**
 * @brief Grumpkin ZK variant
 * @details Tests ZK sumcheck over the Grumpkin curve (used in ECCVM/IVC)
 * @note Grumpkin sumcheck requires ZK mode for commitment-based protocol
 */
using SumcheckTestFlavorGrumpkinZK = SumcheckTestFlavor_<curve::Grumpkin, true, true>;

/**
 * @brief ZK + Full barycentric combination
 * @details Tests both ZK and full barycentric extension together
 */
using SumcheckTestFlavorZKFullBary = SumcheckTestFlavor_<curve::BN254, true, false>;

} // namespace bb
