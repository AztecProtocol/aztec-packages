// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/flavor/relation_definitions.hpp"
#include "barretenberg/flavor/repeated_commitments_data.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/translator_vm/translator_decomposition_relation.hpp"
#include "barretenberg/relations/translator_vm/translator_delta_range_constraint_relation.hpp"
#include "barretenberg/relations/translator_vm/translator_extra_relations.hpp"
#include "barretenberg/relations/translator_vm/translator_non_native_field_relation.hpp"
#include "barretenberg/relations/translator_vm/translator_permutation_relation.hpp"
#include "barretenberg/translator_vm/translator_circuit_builder.hpp"
#include "barretenberg/translator_vm/translator_fixed_vk.hpp"

namespace bb {

class TranslatorFlavor {

  public:
    using CircuitBuilder = TranslatorCircuitBuilder;
    using Curve = curve::BN254;
    using PCS = KZG<Curve>;
    using GroupElement = Curve::Element;
    using Commitment = Curve::AffineElement;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<Curve>;
    using FF = Curve::ScalarField;
    using BF = Curve::BaseField;
    using Polynomial = bb::Polynomial<FF>;
    using RelationSeparator = FF;

    // indicates when evaluating sumcheck, edges must be extended to be MAX_TOTAL_RELATION_LENGTH
    static constexpr bool USE_SHORT_MONOMIALS = false;

    // Indicates that this flavor runs with ZK Sumcheck.
    static constexpr bool HasZK = true;
    // Translator proof size and its recursive verifier circuit are genuinely fixed, hence no padding is needed.
    static constexpr bool USE_PADDING = false;
    // Important: these constants cannot be arbitrarily changed - please consult with a member of the Crypto team if
    // they become too small.

    // None of this parameters can be changed
    // Number of wires representing the op queue whose commitments are going to be checked against those from the
    // final round of merge
    static constexpr size_t NUM_OP_QUEUE_WIRES = 4;

    // How many mini_circuit_size polynomials are interleaved in one interleaved_*
    static constexpr size_t INTERLEAVING_GROUP_SIZE = 16;

    // The fixed  log size of Translator circuit determining the size most polynomials (except the ones
    // involved in the interleaving subprotocol). It should be determined by the size of the EccOpQueue.
    static constexpr size_t LOG_MINI_CIRCUIT_SIZE = 14;

    // Log of size of interleaved_* and ordered_* polynomials
    static constexpr size_t CONST_TRANSLATOR_LOG_N = LOG_MINI_CIRCUIT_SIZE + numeric::get_msb(INTERLEAVING_GROUP_SIZE);

    static constexpr size_t MINI_CIRCUIT_SIZE = 1UL << LOG_MINI_CIRCUIT_SIZE;

    // The number of interleaved_* wires
    static constexpr size_t NUM_INTERLEAVED_WIRES = 4;

    // The step in the DeltaRangeConstraint relation i.e. the maximum difference between two consecutive values
    static constexpr size_t SORT_STEP = 3;

    // Number of wires
    static constexpr size_t NUM_WIRES = CircuitBuilder::NUM_WIRES;

    // The result of evaluating the polynomials in the nonnative form in translator circuit, stored as limbs and
    // referred to as accumulated_result. This is reconstructed in it's base field form and sent to the verifier
    // responsible for checking it against the evaluations received from ECCVM.
    static constexpr size_t RESULT_ROW = CircuitBuilder::RESULT_ROW;

    // The bitness of the range constraint
    static constexpr size_t MICRO_LIMB_BITS = CircuitBuilder::MICRO_LIMB_BITS;

    // The number of "steps" inserted in ordered range constraint polynomials to ensure that the
    // DeltaRangeConstraintRelation can always be satisfied if the polynomial is within the appropriate range.
    static constexpr size_t SORTED_STEPS_COUNT = (1 << MICRO_LIMB_BITS) / SORT_STEP + 1;
    static_assert(SORTED_STEPS_COUNT * (NUM_INTERLEAVED_WIRES + 1) < MINI_CIRCUIT_SIZE * INTERLEAVING_GROUP_SIZE,
                  "Translator circuit is too small for defined number of steps "
                  "(TranslatorDeltaRangeConstraintRelation). ");

    // The limbs of the modulus we are emulating in the goblin translator. 4 binary 68-bit limbs and the prime one
    static constexpr const std::array<FF, 5>& negative_modulus_limbs()
    {
        return CircuitBuilder::NEGATIVE_MODULUS_LIMBS;
    }

    // Number of bits in a binary limb
    // This is not a configurable value. Relations are sepcifically designed for it to be 68
    static constexpr size_t NUM_LIMB_BITS = CircuitBuilder::NUM_LIMB_BITS;

    // Lowest possible size of the Translator mini circuit due to the desing of range constraints.
    static constexpr size_t MINIMUM_MINI_CIRCUIT_SIZE = 2048;
    static_assert(MINI_CIRCUIT_SIZE > MINIMUM_MINI_CIRCUIT_SIZE);

    // The number of multivariate polynomials on which a sumcheck prover sumcheck operates (including shifts). We
    // often need containers of this size to hold related data, so we choose a name more agnostic than
    // `NUM_POLYNOMIALS`. Note: this number does not include the individual sorted list polynomials.
    static constexpr size_t NUM_ALL_ENTITIES = 187;
    // The number of polynomials precomputed to describe a circuit and to aid a prover in constructing a satisfying
    // assignment of witnesses. We again choose a neutral name.
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = 10;
    // The total number of witness entities not including shifts.
    static constexpr size_t NUM_WITNESS_ENTITIES = 91;
    static constexpr size_t NUM_WIRES_NON_SHIFTED = 1;
    static constexpr size_t NUM_SHIFTED_WITNESSES = 86;
    static constexpr size_t NUM_INTERLEAVED = NUM_INTERLEAVED_WIRES * INTERLEAVING_GROUP_SIZE;
    // Number of elements in WireToBeShiftedWithoutConcatenated
    static constexpr size_t NUM_WIRES_TO_BE_SHIFTED_WITHOUT_INTERLEAVED = 16;
    // The index of the first unshifted witness that is going to be shifted when AllEntities are partitioned into
    // get_unshifted_without_interleaved(), get_to_be_shifted(), and get_groups_to_be_interleaved()
    static constexpr size_t TO_BE_SHIFTED_WITNESSES_START = NUM_PRECOMPUTED_ENTITIES + NUM_WIRES_NON_SHIFTED;
    // The index of the shift of the first to be shifted witness
    static constexpr size_t SHIFTED_WITNESSES_START = NUM_SHIFTED_WITNESSES + TO_BE_SHIFTED_WITNESSES_START;
    // The index of the first unshifted witness that is contained in the groups to be interleaved, when AllEntities are
    // partitioned into get_unshifted_without_interleaved(), get_to_be_shifted(), and get_groups_to_be_interleaved()
    static constexpr size_t TO_BE_INTERLEAVED_START =
        NUM_PRECOMPUTED_ENTITIES + NUM_WIRES_NON_SHIFTED + NUM_WIRES_TO_BE_SHIFTED_WITHOUT_INTERLEAVED;
    // The index of the first interleaving groups element inside AllEntities
    static constexpr size_t INTERLEAVED_START = NUM_SHIFTED_WITNESSES + SHIFTED_WITNESSES_START;
    // A container to be fed to ShpleminiVerifier to avoid redundant scalar muls
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS =
        RepeatedCommitmentsData(NUM_PRECOMPUTED_ENTITIES + NUM_WIRES_NON_SHIFTED,
                                NUM_PRECOMPUTED_ENTITIES + NUM_WIRES_NON_SHIFTED + NUM_SHIFTED_WITNESSES,
                                NUM_SHIFTED_WITNESSES,
                                TO_BE_INTERLEAVED_START,
                                INTERLEAVED_START,
                                NUM_INTERLEAVED);
    using GrandProductRelations = std::tuple<TranslatorPermutationRelation<FF>>;
    // define the tuple of Relations that comprise the Sumcheck relation
    template <typename FF>
    using Relations_ = std::tuple<TranslatorPermutationRelation<FF>,
                                  TranslatorDeltaRangeConstraintRelation<FF>,
                                  TranslatorOpcodeConstraintRelation<FF>,
                                  TranslatorAccumulatorTransferRelation<FF>,
                                  TranslatorDecompositionRelation<FF>,
                                  TranslatorNonNativeFieldRelation<FF>,
                                  TranslatorZeroConstraintsRelation<FF>>;
    using Relations = Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    static constexpr size_t MAX_TOTAL_RELATION_LENGTH = compute_max_total_relation_length<Relations>();

    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3.
    // The degree has to be further increased because the relation is multiplied by the Row Disabling Polynomial
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 2;
    static_assert(BATCHED_RELATION_PARTIAL_LENGTH == Curve::LIBRA_UNIVARIATES_LENGTH,
                  "LIBRA_UNIVARIATES_LENGTH must be equal to Translator::BATCHED_RELATION_PARTIAL_LENGTH");
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    // define the containers for storing the contributions from each relation in Sumcheck
    using SumcheckTupleOfTuplesOfUnivariates = decltype(create_sumcheck_tuple_of_tuples_of_univariates<Relations>());
    using TupleOfArraysOfValues = decltype(create_tuple_of_arrays_of_values<Relations>());

    /**
     * @brief A base class labelling precomputed entities and (ordered) subsets of interest.
     * @details Used to build the proving key and verification key.
     */
    template <typename DataType_> class PrecomputedEntities {
      public:
        bool operator==(const PrecomputedEntities& other) const = default;
        using DataType = DataType_;
        DEFINE_FLAVOR_MEMBERS(DataType,
                              ordered_extra_range_constraints_numerator, // column 0
                              lagrange_first,                            // column 1
                              lagrange_last,                             // column 2
                              // TODO(https://github.com/AztecProtocol/barretenberg/issues/758): Check if one of these
                              // can be replaced by shifts
                              lagrange_odd_in_minicircuit,  // column 3
                              lagrange_even_in_minicircuit, // column 4
                              lagrange_result_row,          // column 5
                              lagrange_last_in_minicircuit, // column 6
                              lagrange_masking,             // column 7
                              lagrange_mini_masking,        // column 8
                              lagrange_real_last);          // column 9
    };

    template <typename DataType> class InterleavedRangeConstraints {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              interleaved_range_constraints_0, // column 0
                              interleaved_range_constraints_1, // column 1
                              interleaved_range_constraints_2, // column 2
                              interleaved_range_constraints_3) // column 3
    };
    template <typename DataType> class WireToBeShiftedEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              x_lo_y_hi,                                    // column 0
                              x_hi_z_1,                                     // column 1
                              y_lo_z_2,                                     // column 2
                              p_x_low_limbs,                                // column 3
                              p_x_high_limbs,                               // column 4
                              p_y_low_limbs,                                // column 5
                              p_y_high_limbs,                               // column 6
                              z_low_limbs,                                  // column 7
                              z_high_limbs,                                 // column 8
                              accumulators_binary_limbs_0,                  // column 9
                              accumulators_binary_limbs_1,                  // column 10
                              accumulators_binary_limbs_2,                  // column 11
                              accumulators_binary_limbs_3,                  // column 12
                              quotient_low_binary_limbs,                    // column 13
                              quotient_high_binary_limbs,                   // column 14
                              relation_wide_limbs,                          // column 15
                              p_x_low_limbs_range_constraint_0,             // column 16
                              p_x_low_limbs_range_constraint_1,             // column 17
                              p_x_low_limbs_range_constraint_2,             // column 18
                              p_x_low_limbs_range_constraint_3,             // column 19
                              p_x_low_limbs_range_constraint_4,             // column 20
                              p_x_low_limbs_range_constraint_tail,          // column 21
                              p_x_high_limbs_range_constraint_0,            // column 22
                              p_x_high_limbs_range_constraint_1,            // column 23
                              p_x_high_limbs_range_constraint_2,            // column 24
                              p_x_high_limbs_range_constraint_3,            // column 25
                              p_x_high_limbs_range_constraint_4,            // column 26
                              p_x_high_limbs_range_constraint_tail,         // column 27
                              p_y_low_limbs_range_constraint_0,             // column 28
                              p_y_low_limbs_range_constraint_1,             // column 29
                              p_y_low_limbs_range_constraint_2,             // column 30
                              p_y_low_limbs_range_constraint_3,             // column 31
                              p_y_low_limbs_range_constraint_4,             // column 32
                              p_y_low_limbs_range_constraint_tail,          // column 33
                              p_y_high_limbs_range_constraint_0,            // column 34
                              p_y_high_limbs_range_constraint_1,            // column 35
                              p_y_high_limbs_range_constraint_2,            // column 36
                              p_y_high_limbs_range_constraint_3,            // column 37
                              p_y_high_limbs_range_constraint_4,            // column 38
                              p_y_high_limbs_range_constraint_tail,         // column 39
                              z_low_limbs_range_constraint_0,               // column 40
                              z_low_limbs_range_constraint_1,               // column 41
                              z_low_limbs_range_constraint_2,               // column 42
                              z_low_limbs_range_constraint_3,               // column 43
                              z_low_limbs_range_constraint_4,               // column 44
                              z_low_limbs_range_constraint_tail,            // column 45
                              z_high_limbs_range_constraint_0,              // column 46
                              z_high_limbs_range_constraint_1,              // column 47
                              z_high_limbs_range_constraint_2,              // column 48
                              z_high_limbs_range_constraint_3,              // column 49
                              z_high_limbs_range_constraint_4,              // column 50
                              z_high_limbs_range_constraint_tail,           // column 51
                              accumulator_low_limbs_range_constraint_0,     // column 52
                              accumulator_low_limbs_range_constraint_1,     // column 53
                              accumulator_low_limbs_range_constraint_2,     // column 54
                              accumulator_low_limbs_range_constraint_3,     // column 55
                              accumulator_low_limbs_range_constraint_4,     // column 56
                              accumulator_low_limbs_range_constraint_tail,  // column 57
                              accumulator_high_limbs_range_constraint_0,    // column 58
                              accumulator_high_limbs_range_constraint_1,    // column 59
                              accumulator_high_limbs_range_constraint_2,    // column 60
                              accumulator_high_limbs_range_constraint_3,    // column 61
                              accumulator_high_limbs_range_constraint_4,    // column 62
                              accumulator_high_limbs_range_constraint_tail, // column 63
                              quotient_low_limbs_range_constraint_0,        // column 64
                              quotient_low_limbs_range_constraint_1,        // column 65
                              quotient_low_limbs_range_constraint_2,        // column 66
                              quotient_low_limbs_range_constraint_3,        // column 67
                              quotient_low_limbs_range_constraint_4,        // column 68
                              quotient_low_limbs_range_constraint_tail,     // column 69
                              quotient_high_limbs_range_constraint_0,       // column 70
                              quotient_high_limbs_range_constraint_1,       // column 71
                              quotient_high_limbs_range_constraint_2,       // column 72
                              quotient_high_limbs_range_constraint_3,       // column 73
                              quotient_high_limbs_range_constraint_4,       // column 74
                              quotient_high_limbs_range_constraint_tail,    // column 75
                              relation_wide_limbs_range_constraint_0,       // column 76
                              relation_wide_limbs_range_constraint_1,       // column 77
                              relation_wide_limbs_range_constraint_2,       // column 78
                              relation_wide_limbs_range_constraint_3);      // column 79
    };
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/907)
    // Note: These are technically derived from wires but do not depend on challenges (like z_perm). They are committed
    // to in the wires commitment round.
    template <typename DataType> class OrderedRangeConstraints {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              ordered_range_constraints_0,  // column 0
                              ordered_range_constraints_1,  // column 1
                              ordered_range_constraints_2,  // column 2
                              ordered_range_constraints_3,  // column 3
                              ordered_range_constraints_4); // column 4
    };

    template <typename DataType> class WireNonshiftedEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              op // column 0
        );
    };
    template <typename DataType> class DerivedWitnessEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              z_perm); // column 0
    };
    /**
     * @brief Container for all witness polynomials used/constructed by the prover.
     */
    template <typename DataType>
    class WitnessEntities : public WireNonshiftedEntities<DataType>,
                            public WireToBeShiftedEntities<DataType>,
                            public OrderedRangeConstraints<DataType>,
                            public DerivedWitnessEntities<DataType>,
                            public InterleavedRangeConstraints<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(WireNonshiftedEntities<DataType>,
                                WireToBeShiftedEntities<DataType>,
                                OrderedRangeConstraints<DataType>,
                                DerivedWitnessEntities<DataType>,
                                InterleavedRangeConstraints<DataType>)

        /**
         * @brief Entities constructed from circuit data.
         *
         */
        auto get_wires()
        {
            return concatenate(WireNonshiftedEntities<DataType>::get_all(),
                               WireToBeShiftedEntities<DataType>::get_all());
        };

        auto get_wires_to_be_shifted() { return WireToBeShiftedEntities<DataType>::get_all(); };

        /**
         * @brief Witness Entities to which the prover commits and do not require challenges (i.e. not derived).
         */
        auto get_wires_and_ordered_range_constraints()
        {
            return concatenate(WireNonshiftedEntities<DataType>::get_all(),
                               WireToBeShiftedEntities<DataType>::get_all(),
                               OrderedRangeConstraints<DataType>::get_all());
        };

        /**
         * @brief Witness Entities on which Shplemini operates in the default manner.
         */
        auto get_unshifted_without_interleaved()
        {
            return concatenate(WireNonshiftedEntities<DataType>::get_all(),
                               WireToBeShiftedEntities<DataType>::get_all(),
                               OrderedRangeConstraints<DataType>::get_all(),
                               DerivedWitnessEntities<DataType>::get_all());
        }

        auto get_unshifted()
        {
            return concatenate(WireNonshiftedEntities<DataType>::get_all(),
                               WireToBeShiftedEntities<DataType>::get_all(),
                               OrderedRangeConstraints<DataType>::get_all(),
                               DerivedWitnessEntities<DataType>::get_all(),
                               InterleavedRangeConstraints<DataType>::get_all());
        }

        auto get_to_be_shifted()
        {
            return concatenate(WireToBeShiftedEntities<DataType>::get_all(),
                               OrderedRangeConstraints<DataType>::get_all(),
                               DerivedWitnessEntities<DataType>::get_all());
        };

        /**
         * @brief Get the entities constructed by interleaving.
         */
        auto get_interleaved() { return InterleavedRangeConstraints<DataType>::get_all(); }

        /**
         * @brief Get the entities interleaved for the permutation relation.
         *
         */
        std::vector<RefVector<DataType>> get_groups_to_be_interleaved()
        {
            return {
                {
                    this->p_x_low_limbs_range_constraint_0,
                    this->p_x_low_limbs_range_constraint_1,
                    this->p_x_low_limbs_range_constraint_2,
                    this->p_x_low_limbs_range_constraint_3,
                    this->p_x_low_limbs_range_constraint_4,
                    this->p_x_low_limbs_range_constraint_tail,
                    this->p_x_high_limbs_range_constraint_0,
                    this->p_x_high_limbs_range_constraint_1,
                    this->p_x_high_limbs_range_constraint_2,
                    this->p_x_high_limbs_range_constraint_3,
                    this->p_x_high_limbs_range_constraint_4,
                    this->p_x_high_limbs_range_constraint_tail,
                    this->p_y_low_limbs_range_constraint_0,
                    this->p_y_low_limbs_range_constraint_1,
                    this->p_y_low_limbs_range_constraint_2,
                    this->p_y_low_limbs_range_constraint_3,
                },
                {
                    this->p_y_low_limbs_range_constraint_4,
                    this->p_y_low_limbs_range_constraint_tail,
                    this->p_y_high_limbs_range_constraint_0,
                    this->p_y_high_limbs_range_constraint_1,
                    this->p_y_high_limbs_range_constraint_2,
                    this->p_y_high_limbs_range_constraint_3,
                    this->p_y_high_limbs_range_constraint_4,
                    this->p_y_high_limbs_range_constraint_tail,
                    this->z_low_limbs_range_constraint_0,
                    this->z_low_limbs_range_constraint_1,
                    this->z_low_limbs_range_constraint_2,
                    this->z_low_limbs_range_constraint_3,
                    this->z_low_limbs_range_constraint_4,
                    this->z_low_limbs_range_constraint_tail,
                    this->z_high_limbs_range_constraint_0,
                    this->z_high_limbs_range_constraint_1,
                },
                {
                    this->z_high_limbs_range_constraint_2,
                    this->z_high_limbs_range_constraint_3,
                    this->z_high_limbs_range_constraint_4,
                    this->z_high_limbs_range_constraint_tail,
                    this->accumulator_low_limbs_range_constraint_0,
                    this->accumulator_low_limbs_range_constraint_1,
                    this->accumulator_low_limbs_range_constraint_2,
                    this->accumulator_low_limbs_range_constraint_3,
                    this->accumulator_low_limbs_range_constraint_4,
                    this->accumulator_low_limbs_range_constraint_tail,
                    this->accumulator_high_limbs_range_constraint_0,
                    this->accumulator_high_limbs_range_constraint_1,
                    this->accumulator_high_limbs_range_constraint_2,
                    this->accumulator_high_limbs_range_constraint_3,
                    this->accumulator_high_limbs_range_constraint_4,
                    this->accumulator_high_limbs_range_constraint_tail,
                },
                {
                    this->quotient_low_limbs_range_constraint_0,
                    this->quotient_low_limbs_range_constraint_1,
                    this->quotient_low_limbs_range_constraint_2,
                    this->quotient_low_limbs_range_constraint_3,
                    this->quotient_low_limbs_range_constraint_4,
                    this->quotient_low_limbs_range_constraint_tail,
                    this->quotient_high_limbs_range_constraint_0,
                    this->quotient_high_limbs_range_constraint_1,
                    this->quotient_high_limbs_range_constraint_2,
                    this->quotient_high_limbs_range_constraint_3,
                    this->quotient_high_limbs_range_constraint_4,
                    this->quotient_high_limbs_range_constraint_tail,
                    this->relation_wide_limbs_range_constraint_0,
                    this->relation_wide_limbs_range_constraint_1,
                    this->relation_wide_limbs_range_constraint_2,
                    this->relation_wide_limbs_range_constraint_3,
                },
            };
        };
    };

    /**
     * @brief Represents polynomials shifted by 1 or their evaluations, defined relative to WireToBeShiftedEntities.
     */
    template <typename DataType> class ShiftedEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              x_lo_y_hi_shift,                                    // column 0
                              x_hi_z_1_shift,                                     // column 1
                              y_lo_z_2_shift,                                     // column 2
                              p_x_low_limbs_shift,                                // column 3
                              p_x_high_limbs_shift,                               // column 10
                              p_y_low_limbs_shift,                                // column 17
                              p_y_high_limbs_shift,                               // column 24
                              z_low_limbs_shift,                                  // column 31
                              z_high_limbs_shift,                                 // column 38
                              accumulators_binary_limbs_0_shift,                  // column 45
                              accumulators_binary_limbs_1_shift,                  // column 46
                              accumulators_binary_limbs_2_shift,                  // column 47
                              accumulators_binary_limbs_3_shift,                  // column 48
                              quotient_low_binary_limbs_shift,                    // column 61
                              quotient_high_binary_limbs_shift,                   // column 62
                              relation_wide_limbs_shift,                          // column 75
                              p_x_low_limbs_range_constraint_0_shift,             // column 4
                              p_x_low_limbs_range_constraint_1_shift,             // column 5
                              p_x_low_limbs_range_constraint_2_shift,             // column 6
                              p_x_low_limbs_range_constraint_3_shift,             // column 7
                              p_x_low_limbs_range_constraint_4_shift,             // column 8
                              p_x_low_limbs_range_constraint_tail_shift,          // column 9
                              p_x_high_limbs_range_constraint_0_shift,            // column 11
                              p_x_high_limbs_range_constraint_1_shift,            // column 12
                              p_x_high_limbs_range_constraint_2_shift,            // column 13
                              p_x_high_limbs_range_constraint_3_shift,            // column 14
                              p_x_high_limbs_range_constraint_4_shift,            // column 15
                              p_x_high_limbs_range_constraint_tail_shift,         // column 16
                              p_y_low_limbs_range_constraint_0_shift,             // column 18
                              p_y_low_limbs_range_constraint_1_shift,             // column 19
                              p_y_low_limbs_range_constraint_2_shift,             // column 20
                              p_y_low_limbs_range_constraint_3_shift,             // column 21
                              p_y_low_limbs_range_constraint_4_shift,             // column 22
                              p_y_low_limbs_range_constraint_tail_shift,          // column 23
                              p_y_high_limbs_range_constraint_0_shift,            // column 25
                              p_y_high_limbs_range_constraint_1_shift,            // column 26
                              p_y_high_limbs_range_constraint_2_shift,            // column 27
                              p_y_high_limbs_range_constraint_3_shift,            // column 28
                              p_y_high_limbs_range_constraint_4_shift,            // column 29
                              p_y_high_limbs_range_constraint_tail_shift,         // column 30
                              z_low_limbs_range_constraint_0_shift,               // column 32
                              z_low_limbs_range_constraint_1_shift,               // column 33
                              z_low_limbs_range_constraint_2_shift,               // column 34
                              z_low_limbs_range_constraint_3_shift,               // column 35
                              z_low_limbs_range_constraint_4_shift,               // column 36
                              z_low_limbs_range_constraint_tail_shift,            // column 37
                              z_high_limbs_range_constraint_0_shift,              // column 39
                              z_high_limbs_range_constraint_1_shift,              // column 40
                              z_high_limbs_range_constraint_2_shift,              // column 41
                              z_high_limbs_range_constraint_3_shift,              // column 42
                              z_high_limbs_range_constraint_4_shift,              // column 43
                              z_high_limbs_range_constraint_tail_shift,           // column 44
                              accumulator_low_limbs_range_constraint_0_shift,     // column 49
                              accumulator_low_limbs_range_constraint_1_shift,     // column 50
                              accumulator_low_limbs_range_constraint_2_shift,     // column 51
                              accumulator_low_limbs_range_constraint_3_shift,     // column 52
                              accumulator_low_limbs_range_constraint_4_shift,     // column 53
                              accumulator_low_limbs_range_constraint_tail_shift,  // column 54
                              accumulator_high_limbs_range_constraint_0_shift,    // column 55
                              accumulator_high_limbs_range_constraint_1_shift,    // column 56
                              accumulator_high_limbs_range_constraint_2_shift,    // column 57
                              accumulator_high_limbs_range_constraint_3_shift,    // column 58
                              accumulator_high_limbs_range_constraint_4_shift,    // column 59
                              accumulator_high_limbs_range_constraint_tail_shift, // column 60
                              quotient_low_limbs_range_constraint_0_shift,        // column 63
                              quotient_low_limbs_range_constraint_1_shift,        // column 64
                              quotient_low_limbs_range_constraint_2_shift,        // column 65
                              quotient_low_limbs_range_constraint_3_shift,        // column 66
                              quotient_low_limbs_range_constraint_4_shift,        // column 67
                              quotient_low_limbs_range_constraint_tail_shift,     // column 68
                              quotient_high_limbs_range_constraint_0_shift,       // column 69
                              quotient_high_limbs_range_constraint_1_shift,       // column 70
                              quotient_high_limbs_range_constraint_2_shift,       // column 71
                              quotient_high_limbs_range_constraint_3_shift,       // column 72
                              quotient_high_limbs_range_constraint_4_shift,       // column 73
                              quotient_high_limbs_range_constraint_tail_shift,    // column 74
                              relation_wide_limbs_range_constraint_0_shift,       // column 76
                              relation_wide_limbs_range_constraint_1_shift,       // column 77
                              relation_wide_limbs_range_constraint_2_shift,       // column 78
                              relation_wide_limbs_range_constraint_3_shift,       // column 79
                              ordered_range_constraints_0_shift,                  // column 80
                              ordered_range_constraints_1_shift,                  // column 81
                              ordered_range_constraints_2_shift,                  // column 82
                              ordered_range_constraints_3_shift,                  // column 83
                              ordered_range_constraints_4_shift,                  // column 84
                              z_perm_shift)                                       // column 85
    };

    /**
     * @brief A base class labelling all entities (for instance, all of the polynomials used by the prover during
     * sumcheck) in this Honk variant along with particular subsets of interest.
     * @details Used to build containers for: the prover's polynomial during sumcheck; the sumcheck's folded
     * polynomials; the univariates consturcted during during sumcheck; the evaluations produced by sumcheck.
     *
     * Symbolically we have: AllEntities = PrecomputedEntities + WitnessEntities + ShiftedEntities.
     */
    template <typename DataType>
    class AllEntities : public PrecomputedEntities<DataType>,
                        public WitnessEntities<DataType>,
                        public ShiftedEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(PrecomputedEntities<DataType>, WitnessEntities<DataType>, ShiftedEntities<DataType>)

        auto get_precomputed() const { return PrecomputedEntities<DataType>::get_all(); };

        /**
         * @brief Getter for entities constructed by interleaving
         */
        auto get_interleaved() { return InterleavedRangeConstraints<DataType>::get_all(); };

        /**
         * @brief Getter for the ordered entities used in computing the denominator of the grand product in the
         * permutation relation.
         */
        auto get_ordered_range_constraints() { return OrderedRangeConstraints<DataType>::get_all(); };

        auto get_unshifted()
        {
            return concatenate(PrecomputedEntities<DataType>::get_all(), WitnessEntities<DataType>::get_unshifted());
        }

        auto get_unshifted_without_interleaved()
        {
            return concatenate(PrecomputedEntities<DataType>::get_all(),
                               WitnessEntities<DataType>::get_unshifted_without_interleaved());
        }

        auto get_shifted() { return ShiftedEntities<DataType>::get_all(); };

        friend std::ostream& operator<<(std::ostream& os, const AllEntities& a)
        {
            os << "{ ";
            std::ios_base::fmtflags f(os.flags());
            auto entities = a.get_all();
            for (size_t i = 0; i < entities.size() - 1; i++) {
                os << "e[" << std::setw(2) << i << "] = " << (entities[i]) << ",\n";
            }
            os << "e[" << std::setw(2) << (entities.size() - 1) << "] = " << entities[entities.size() - 1] << " }";

            os.flags(f);
            return os;
        }
    };

    /**
     * @brief A field element for each entity of the flavor.  These entities represent the prover polynomials
     * evaluated at one point.
     */
    class AllValues : public AllEntities<FF> {
      public:
        using Base = AllEntities<FF>;
        using Base::Base;
    };
    /**
     * @brief A container for the prover polynomials handles.
     */
    class ProverPolynomials : public AllEntities<Polynomial> {
      public:
        /**
         * @brief ProverPolynomials constructor
         * @details Initialises wire polynomials efficiently to be only minicircuit size..
         */
        ProverPolynomials()
        {

            const size_t circuit_size = 1 << CONST_TRANSLATOR_LOG_N;
            for (auto& ordered_range_constraint : get_ordered_range_constraints()) {
                ordered_range_constraint = Polynomial{ /*size*/ circuit_size - 1,
                                                       /*largest possible index*/ circuit_size,
                                                       1 };
            }

            for (auto& interleaved : get_interleaved()) {
                interleaved = Polynomial{ /*size*/ circuit_size, circuit_size };
            }
            z_perm = Polynomial{ /*size*/ circuit_size - 1,
                                 /*virtual_size*/ circuit_size,
                                 /*start_index*/ 1 };

            // All to_be_shifted witnesses except the ordered range constraints and z_perm are only non-zero in the mini
            // circuit
            for (auto& poly : get_to_be_shifted()) {
                if (poly.is_empty()) {
                    poly = Polynomial{ /*size*/ MINI_CIRCUIT_SIZE - 1,
                                       /*virtual_size*/ circuit_size,
                                       /*start_index*/ 1 };
                }
            }

            // Initialize some one-off polys with special structure
            lagrange_first = Polynomial{ /*size*/ 1, /*virtual_size*/ circuit_size };
            lagrange_result_row = Polynomial{ /*size*/ 3, /*virtual_size*/ circuit_size };
            lagrange_even_in_minicircuit = Polynomial{ /*size*/ MINI_CIRCUIT_SIZE, /*virtual_size*/ circuit_size };
            lagrange_odd_in_minicircuit = Polynomial{ /*size*/ MINI_CIRCUIT_SIZE, /*virtual_size*/ circuit_size };

            for (auto& poly : get_unshifted()) {
                if (poly.is_empty()) {
                    // Not set above
                    poly = Polynomial{ circuit_size };
                }
            }
            set_shifted();
        }
        ProverPolynomials& operator=(const ProverPolynomials&) = delete;
        ProverPolynomials(const ProverPolynomials& o) = delete;
        ProverPolynomials(ProverPolynomials&& o) noexcept = default;
        ProverPolynomials& operator=(ProverPolynomials&& o) noexcept = default;
        ~ProverPolynomials() = default;
        [[nodiscard]] size_t get_polynomial_size() const { return this->op.size(); }
        /**
         * @brief Returns the evaluations of all prover polynomials at one point on the boolean
         * hypercube, which represents one row in the execution trace.
         */
        [[nodiscard]] AllValues get_row(size_t row_idx) const
        {
            PROFILE_THIS();
            AllValues result;
            for (auto [result_field, polynomial] : zip_view(result.get_all(), this->get_all())) {
                result_field = polynomial[row_idx];
            }
            return result;
        }
        // Set all shifted polynomials based on their to-be-shifted counterpart
        void set_shifted()
        {
            for (auto [shifted, to_be_shifted] : zip_view(get_shifted(), get_to_be_shifted())) {
                shifted = to_be_shifted.shifted();
            }
        }
    };

    /**
     * @brief The proving key is responsible for storing the polynomials used by the prover.
     *
     */
    class ProvingKey : public ProvingKey_<FF, CommitmentKey> {
      public:
        ProverPolynomials polynomials; // storage for all polynomials evaluated by the prover
        // Expose constructors on the base class
        using Base = ProvingKey_<FF, CommitmentKey>;
        using Base::Base;

        ProvingKey(CommitmentKey commitment_key = CommitmentKey())
            : Base(1UL << CONST_TRANSLATOR_LOG_N, 0, std::move(commitment_key))
        {}
    };

    /**
     * @brief The verification key is responsible for storing the commitments to the precomputed (non-witnessk)
     * polynomials used by the verifier.
     *
     * @note Note the discrepancy with what sort of data is stored here vs in the proving key. We may want to
     * resolve that, and split out separate PrecomputedPolynomials/Commitments data for clarity but also for
     * portability of our circuits.
     */
    class VerificationKey : public NativeVerificationKey_<PrecomputedEntities<Commitment>> {
      public:
        // Default constuct the fixed VK based on circuit size 1 << CONST_TRANSLATOR_LOG_N
        VerificationKey()
            : NativeVerificationKey_(1UL << CONST_TRANSLATOR_LOG_N, /*num_public_inputs=*/0)
        {
            this->pub_inputs_offset = 0;

            // Populate the commitments of the precomputed polynomials
            for (auto [vk_commitment, fixed_commitment] :
                 zip_view(this->get_all(), TranslatorFixedVKCommitments::get_all())) {
                vk_commitment = fixed_commitment;
            }
        }

        VerificationKey(const std::shared_ptr<ProvingKey>& proving_key)
        {
            this->circuit_size = 1UL << CONST_TRANSLATOR_LOG_N;
            this->log_circuit_size = CONST_TRANSLATOR_LOG_N;
            this->num_public_inputs = proving_key->num_public_inputs;
            this->pub_inputs_offset = proving_key->pub_inputs_offset;

            for (auto [polynomial, commitment] :
                 zip_view(proving_key->polynomials.get_precomputed(), this->get_all())) {
                commitment = proving_key->commitment_key.commit(polynomial);
            }
        }
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1324): Remove `circuit_size` and `log_circuit_size`
        // from MSGPACK and the verification key.
        MSGPACK_FIELDS(circuit_size,
                       log_circuit_size,
                       num_public_inputs,
                       pub_inputs_offset,
                       ordered_extra_range_constraints_numerator,
                       lagrange_first,
                       lagrange_last,
                       lagrange_odd_in_minicircuit,
                       lagrange_even_in_minicircuit,
                       lagrange_result_row,
                       lagrange_last_in_minicircuit,
                       lagrange_masking,
                       lagrange_mini_masking,
                       lagrange_real_last);
    };

    /**
     * @brief A container for storing the partially evaluated multivariates produced by sumcheck.
     */
    class PartiallyEvaluatedMultivariates : public AllEntities<Polynomial> {
      public:
        PartiallyEvaluatedMultivariates() = default;
        PartiallyEvaluatedMultivariates(const size_t circuit_size)
        {
            // Storage is only needed after the first partial evaluation, hence polynomials of size (n / 2)
            for (auto& poly : this->get_all()) {
                poly = Polynomial(circuit_size / 2);
            }
        }
        PartiallyEvaluatedMultivariates(const ProverPolynomials& full_polynomials, size_t circuit_size)
        {
            for (auto [poly, full_poly] : zip_view(get_all(), full_polynomials.get_all())) {
                // After the initial sumcheck round, the new size is CEIL(size/2).
                size_t desired_size = full_poly.end_index() / 2 + full_poly.end_index() % 2;
                poly = Polynomial(desired_size, circuit_size / 2);
            }
        }
    };

    /**
     * @brief A container for univariates used during sumcheck.
     */
    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;

    /**
     * @brief A container for univariates produced during the hot loop in sumcheck.
     */
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;

    /**
     * @brief A container for commitment labels.
     * @note It's debatable whether this should inherit from AllEntities. since most entries are not strictly
     * needed. It has, however, been useful during debugging to have these labels available.
     *
     */
    class CommitmentLabels : public AllEntities<std::string> {
      public:
        CommitmentLabels()
        {
            this->op = "OP";
            this->x_lo_y_hi = "X_LO_Y_HI";
            this->x_hi_z_1 = "X_HI_Z_1";
            this->y_lo_z_2 = "Y_LO_Z_2";
            this->p_x_low_limbs = "P_X_LOW_LIMBS";
            this->p_x_high_limbs = "P_X_HIGH_LIMBS";
            this->p_x_low_limbs_range_constraint_0 = "P_X_LOW_LIMBS_RANGE_CONSTRAINT_0";
            this->p_x_low_limbs_range_constraint_1 = "P_X_LOW_LIMBS_RANGE_CONSTRAINT_1";
            this->p_x_low_limbs_range_constraint_2 = "P_X_LOW_LIMBS_RANGE_CONSTRAINT_2";
            this->p_x_low_limbs_range_constraint_3 = "P_X_LOW_LIMBS_RANGE_CONSTRAINT_3";
            this->p_x_low_limbs_range_constraint_4 = "P_X_LOW_LIMBS_RANGE_CONSTRAINT_4";
            this->p_x_low_limbs_range_constraint_tail = "P_X_LOW_LIMBS_RANGE_CONSTRAINT_TAIL";
            this->p_x_high_limbs_range_constraint_0 = "P_X_HIGH_LIMBS_RANGE_CONSTRAINT_0";
            this->p_x_high_limbs_range_constraint_1 = "P_X_HIGH_LIMBS_RANGE_CONSTRAINT_1";
            this->p_x_high_limbs_range_constraint_2 = "P_X_HIGH_LIMBS_RANGE_CONSTRAINT_2";
            this->p_x_high_limbs_range_constraint_3 = "P_X_HIGH_LIMBS_RANGE_CONSTRAINT_3";
            this->p_x_high_limbs_range_constraint_4 = "P_X_HIGH_LIMBS_RANGE_CONSTRAINT_4";
            this->p_x_high_limbs_range_constraint_tail = "P_X_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL";
            this->p_y_low_limbs = "P_Y_LOW_LIMBS";
            this->p_y_low_limbs_range_constraint_0 = "P_Y_LOW_LIMBS_RANGE_CONSTRAINT_0";
            this->p_y_low_limbs_range_constraint_1 = "P_Y_LOW_LIMBS_RANGE_CONSTRAINT_1";
            this->p_y_low_limbs_range_constraint_2 = "P_Y_LOW_LIMBS_RANGE_CONSTRAINT_2";
            this->p_y_low_limbs_range_constraint_3 = "P_Y_LOW_LIMBS_RANGE_CONSTRAINT_3";
            this->p_y_low_limbs_range_constraint_4 = "P_Y_LOW_LIMBS_RANGE_CONSTRAINT_4";
            this->p_y_low_limbs_range_constraint_tail = "P_Y_LOW_LIMBS_RANGE_CONSTRAINT_TAIL";
            this->p_y_high_limbs = "P_Y_HIGH_LIMBS";
            this->p_y_high_limbs_range_constraint_0 = "P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_0";
            this->p_y_high_limbs_range_constraint_1 = "P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_1";
            this->p_y_high_limbs_range_constraint_2 = "P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_2";
            this->p_y_high_limbs_range_constraint_3 = "P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_3";
            this->p_y_high_limbs_range_constraint_4 = "P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_4";
            this->p_y_high_limbs_range_constraint_tail = "P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL";
            this->z_low_limbs = "Z_LOw_LIMBS";
            this->z_low_limbs_range_constraint_0 = "Z_LOW_LIMBS_RANGE_CONSTRAINT_0";
            this->z_low_limbs_range_constraint_1 = "Z_LOW_LIMBS_RANGE_CONSTRAINT_1";
            this->z_low_limbs_range_constraint_2 = "Z_LOW_LIMBS_RANGE_CONSTRAINT_2";
            this->z_low_limbs_range_constraint_3 = "Z_LOW_LIMBS_RANGE_CONSTRAINT_3";
            this->z_low_limbs_range_constraint_4 = "Z_LOW_LIMBS_RANGE_CONSTRAINT_4";
            this->z_low_limbs_range_constraint_tail = "Z_LOW_LIMBS_RANGE_CONSTRAINT_TAIL";
            this->z_high_limbs = "Z_HIGH_LIMBS";
            this->z_high_limbs_range_constraint_0 = "Z_HIGH_LIMBS_RANGE_CONSTRAINT_0";
            this->z_high_limbs_range_constraint_1 = "Z_HIGH_LIMBS_RANGE_CONSTRAINT_1";
            this->z_high_limbs_range_constraint_2 = "Z_HIGH_LIMBS_RANGE_CONSTRAINT_2";
            this->z_high_limbs_range_constraint_3 = "Z_HIGH_LIMBS_RANGE_CONSTRAINT_3";
            this->z_high_limbs_range_constraint_4 = "Z_HIGH_LIMBS_RANGE_CONSTRAINT_4";
            this->z_high_limbs_range_constraint_tail = "Z_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL";
            this->accumulators_binary_limbs_0 = "ACCUMULATORS_BINARY_LIMBS_0";
            this->accumulators_binary_limbs_1 = "ACCUMULATORS_BINARY_LIMBS_1";
            this->accumulators_binary_limbs_2 = "ACCUMULATORS_BINARY_LIMBS_2";
            this->accumulators_binary_limbs_3 = "ACCUMULATORS_BINARY_LIMBS_3";
            this->accumulator_low_limbs_range_constraint_0 = "ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_0";
            this->accumulator_low_limbs_range_constraint_1 = "ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_1";
            this->accumulator_low_limbs_range_constraint_2 = "ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_2";
            this->accumulator_low_limbs_range_constraint_3 = "ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_3";
            this->accumulator_low_limbs_range_constraint_4 = "ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_4";
            this->accumulator_low_limbs_range_constraint_tail = "ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_TAIL";
            this->accumulator_high_limbs_range_constraint_0 = "ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_0";
            this->accumulator_high_limbs_range_constraint_1 = "ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_1";
            this->accumulator_high_limbs_range_constraint_2 = "ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_2";
            this->accumulator_high_limbs_range_constraint_3 = "ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_3";
            this->accumulator_high_limbs_range_constraint_4 = "ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_4";
            this->accumulator_high_limbs_range_constraint_tail = "ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL";
            this->quotient_low_binary_limbs = "QUOTIENT_LOW_BINARY_LIMBS";
            this->quotient_high_binary_limbs = "QUOTIENT_HIGH_BINARY_LIMBS";
            this->quotient_low_limbs_range_constraint_0 = "QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_0";
            this->quotient_low_limbs_range_constraint_1 = "QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_1";
            this->quotient_low_limbs_range_constraint_2 = "QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_2";
            this->quotient_low_limbs_range_constraint_3 = "QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_3";
            this->quotient_low_limbs_range_constraint_4 = "QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_4";
            this->quotient_low_limbs_range_constraint_tail = "QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_TAIL";
            this->quotient_high_limbs_range_constraint_0 = "QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_0";
            this->quotient_high_limbs_range_constraint_1 = "QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_1";
            this->quotient_high_limbs_range_constraint_2 = "QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_2";
            this->quotient_high_limbs_range_constraint_3 = "QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_3";
            this->quotient_high_limbs_range_constraint_4 = "QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_4";
            this->quotient_high_limbs_range_constraint_tail = "QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL";
            this->relation_wide_limbs = "RELATION_WIDE_LIMBS";
            this->relation_wide_limbs_range_constraint_0 = "RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_0";
            this->relation_wide_limbs_range_constraint_1 = "RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_1";
            this->relation_wide_limbs_range_constraint_2 = "RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_2";
            this->relation_wide_limbs_range_constraint_3 = "RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_2";
            this->interleaved_range_constraints_0 = "INTERLEAVED_RANGE_CONSTRAINTS_0";
            this->interleaved_range_constraints_1 = "INTERLEAVED_RANGE_CONSTRAINTS_1";
            this->interleaved_range_constraints_2 = "INTERLEAVED_RANGE_CONSTRAINTS_2";
            this->interleaved_range_constraints_3 = "INTERLEAVED_RANGE_CONSTRAINTS_3";
            this->z_perm = "Z_PERM";
            // "__" are only used for debugging
            this->lagrange_first = "__LAGRANGE_FIRST";
            this->lagrange_last = "__LAGRANGE_LAST";
            this->lagrange_odd_in_minicircuit = "__LAGRANGE_ODD_IN_MINICIRCUIT";
            this->lagrange_even_in_minicircuit = "__LAGRANGE_EVEN_IN_MINICIRCUIT";
            this->lagrange_result_row = "__LAGRANGE_RESULT_ROW";
            this->lagrange_last_in_minicircuit = "__LAGRANGE_LAST_IN_MINICIRCUIT";
            this->ordered_extra_range_constraints_numerator = "__ORDERED_EXTRA_RANGE_CONSTRAINTS_NUMERATOR";
            this->lagrange_masking = "__LAGRANGE_MASKING";
            this->lagrange_mini_masking = "__LAGRANGE_MINI_MASKING";
            this->lagrange_real_last = "__LAGRANGE_REAL_LAST";
        };
    };

    template <typename Commitment, typename VerificationKey>
    class VerifierCommitments_ : public AllEntities<Commitment> {
      public:
        VerifierCommitments_(const std::shared_ptr<VerificationKey>& verification_key)
        {
            this->lagrange_first = verification_key->lagrange_first;
            this->lagrange_last = verification_key->lagrange_last;
            this->lagrange_odd_in_minicircuit = verification_key->lagrange_odd_in_minicircuit;
            this->lagrange_even_in_minicircuit = verification_key->lagrange_even_in_minicircuit;
            this->lagrange_result_row = verification_key->lagrange_result_row;
            this->lagrange_last_in_minicircuit = verification_key->lagrange_last_in_minicircuit;
            this->ordered_extra_range_constraints_numerator =
                verification_key->ordered_extra_range_constraints_numerator;
            this->lagrange_masking = verification_key->lagrange_masking;
            this->lagrange_mini_masking = verification_key->lagrange_mini_masking;
            this->lagrange_real_last = verification_key->lagrange_real_last;
        }
    }; // namespace bb
    using VerifierCommitments = VerifierCommitments_<Commitment, VerificationKey>;

    using Transcript = NativeTranscript;
};
} // namespace bb
