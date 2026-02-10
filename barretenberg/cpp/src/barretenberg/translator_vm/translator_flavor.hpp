// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/flavor/partially_evaluated_multivariates.hpp"
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
#include "barretenberg/translator_vm/translator_selectors.hpp"

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
    using Codec = FrCodec;
    using HashFunction = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;
    using Transcript = BaseTranscript<Codec, HashFunction>;

    // indicates when evaluating sumcheck, edges must be extended to be MAX_PARTIAL_RELATION_LENGTH
    static constexpr bool USE_SHORT_MONOMIALS = false;

    // Indicates that this flavor runs with ZK Sumcheck.
    static constexpr bool HasZK = true;
    // Translator proof size and its recursive verifier circuit are genuinely fixed, hence no padding is needed.
    static constexpr bool USE_PADDING = false;
    // Important: these constants cannot be arbitrarily changed - please consult with a member of the Crypto team if
    // they become too small.

    // The number of entities added for ZK (gemini_masking_poly)
    static constexpr size_t NUM_MASKING_POLYNOMIALS = 1;

    // 11 of 12 precomputed selectors are structured multilinear polynomials whose evaluations at the
    // sumcheck challenge can be computed in O(d) field ops (all except ordered_extra_range_constraints_numerator).
    static constexpr size_t NUM_COMPUTABLE_PRECOMPUTED = 11;

    // None of this parameters can be changed
    // Number of wires representing the op queue whose commitments are going to be checked against those from the
    // final round of merge
    static constexpr size_t NUM_OP_QUEUE_WIRES = 4;

    // How many mini_circuit_size polynomials are concatenated in one concatenated poly
    static constexpr size_t CONCATENATION_GROUP_SIZE = 16;

    // The fixed log size of Translator mini circuit. It should be determined by the size of the EccOpQueue.
    static constexpr size_t LOG_MINI_CIRCUIT_SIZE = CONST_TRANSLATOR_MINI_CIRCUIT_LOG_SIZE;

    // Log of size of concatenated and ordered polynomials
    static constexpr size_t CONST_TRANSLATOR_LOG_N = LOG_MINI_CIRCUIT_SIZE + numeric::get_msb(CONCATENATION_GROUP_SIZE);

    // For the translator, the genuine and virtual log circuit size coincide
    static constexpr size_t VIRTUAL_LOG_N = CONST_TRANSLATOR_LOG_N;

    static constexpr size_t MINI_CIRCUIT_SIZE = 1UL << LOG_MINI_CIRCUIT_SIZE;

    // The number of concatenated polynomials (4 range constraint groups + 1 non-range group)
    static constexpr size_t NUM_CONCATENATED_POLYS = 5;

    // The step in the DeltaRangeConstraint relation i.e. the maximum difference between two consecutive values
    static constexpr size_t SORT_STEP = 3;

    // Number of wires
    static constexpr size_t NUM_WIRES = CircuitBuilder::NUM_WIRES;

    // The result of evaluating the polynomials in the nonnative form in translator circuit, stored as limbs and
    // referred to as accumulated_result. This is reconstructed in it's base field form and sent to the verifier
    // responsible for checking it against the evaluations received from ECCVM.
    static constexpr size_t RESULT_ROW = CircuitBuilder::RESULT_ROW;

    // Number of random ops found at he end of Translator trace multiplied by 2 as each accumulation gates occupies two
    // rows.
    static constexpr size_t NUM_MASKED_ROWS_END = CircuitBuilder::NUM_RANDOM_OPS_END * 2;

    // Maximum number of random masking values any ordered polynomial will have at the end
    // Total scattered masking positions = CONCATENATION_GROUP_SIZE * NUM_MASKED_ROWS_END
    // This is the space reserved at the end of each ordered polynomial (contiguous)
    static constexpr size_t MAX_RANDOM_VALUES_PER_ORDERED = CONCATENATION_GROUP_SIZE * NUM_MASKED_ROWS_END;

    // Index at which random coefficients start (for zk) within Translator trace
    static constexpr size_t RANDOMNESS_START = 2 * CircuitBuilder::NUM_NO_OPS_START;

    // The bitness of the range constraint
    static constexpr size_t MICRO_LIMB_BITS = CircuitBuilder::MICRO_LIMB_BITS;

    // The number of "steps" inserted in ordered range constraint polynomials to ensure that the
    // DeltaRangeConstraintRelation can always be satisfied if the polynomial is within the appropriate range.
    static constexpr size_t SORTED_STEPS_COUNT = ((1 << MICRO_LIMB_BITS) / SORT_STEP) + 1;
    static_assert(SORTED_STEPS_COUNT * (NUM_CONCATENATED_POLYS + 1) < MINI_CIRCUIT_SIZE * CONCATENATION_GROUP_SIZE,
                  "Translator circuit is too small for defined number of steps "
                  "(TranslatorDeltaRangeConstraintRelation). ");

    // Number of bits in a binary limb
    // This is not a configurable value. Relations are sepcifically designed for it to be 68
    static constexpr size_t NUM_LIMB_BITS = CircuitBuilder::NUM_LIMB_BITS;

    // Lowest possible size of the Translator mini circuit due to the desing of range constraints.
    static constexpr size_t MINIMUM_MINI_CIRCUIT_SIZE = 2048;
    static_assert(MINI_CIRCUIT_SIZE > MINIMUM_MINI_CIRCUIT_SIZE);

    // The number of multivariate polynomials on which a sumcheck prover sumcheck operates (including shifts). We
    // often need containers of this size to hold related data, so we choose a name more agnostic than
    // `NUM_POLYNOMIALS`. Note: this number does not include the individual sorted list polynomials.
    // = MaskingEntities(1) + Precomputed(12) + Witness(92) + Shifted(86) = 191
    static constexpr size_t NUM_ALL_ENTITIES = 191;

    // Number of evaluations sent in proof (all minus computable precomputed)
    static constexpr size_t NUM_SENT_EVALUATIONS = NUM_ALL_ENTITIES - NUM_COMPUTABLE_PRECOMPUTED;

    // The number of polynomials precomputed to describe a circuit and to aid a prover in constructing a satisfying
    // assignment of witnesses. We again choose a neutral name.
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = 12;

    // The total number of witness entities not including shifts.
    // = WireNonshifted(1) + WireToBeShifted(80) + OrderedRange(5) + Derived(1) + Concatenated(5) = 92
    static constexpr size_t NUM_WITNESS_ENTITIES = 92;
    static constexpr size_t NUM_WIRES_NON_SHIFTED = 1; // only the opcode wire
    static constexpr size_t NUM_SHIFTED_ENTITIES = 86;

    // 77 unshifted + 77 shifted minicircuit wire evaluations are sent mid-sumcheck (after round
    // LOG_MINI_CIRCUIT_SIZE-1)
    static constexpr size_t NUM_MINICIRCUIT_WIRES = 77; // NonRangeMain(13) + RangeConstraint(64)
    static constexpr size_t NUM_MINICIRCUIT_EVALUATIONS = 2 * NUM_MINICIRCUIT_WIRES;                           // 154
    static constexpr size_t NUM_FULL_CIRCUIT_EVALUATIONS = NUM_SENT_EVALUATIONS - NUM_MINICIRCUIT_EVALUATIONS; // 26

    // Total number of minicircuit wires across all concatenation groups (5 groups × 16 wires each)
    static constexpr size_t NUM_CONCATENATED_WIRES = NUM_CONCATENATED_POLYS * CONCATENATION_GROUP_SIZE;

    // Number of non-concatenated witness polynomials in PCS unshifted batch
    // = WireNonshifted/op(1) + OrderedRange(5) + Derived/z_perm(1) = 7
    static constexpr size_t NUM_UNSHIFTED_WITNESSES_WITHOUT_CONCATENATED = 7;

    // Number of to-be-shifted polynomials for PCS
    // = OpQueueWiresToBeShifted(3) + OrderedRange(5) + Derived(1) = 9
    static constexpr size_t NUM_TO_BE_SHIFTED = 9;

    // Number of unshifted polynomials in PCS: masking + non-computable precomputed + witness base + concatenated
    static constexpr size_t NUM_PCS_UNSHIFTED = NUM_MASKING_POLYNOMIALS +
                                                (NUM_PRECOMPUTED_ENTITIES - NUM_COMPUTABLE_PRECOMPUTED) +
                                                NUM_UNSHIFTED_WITNESSES_WITHOUT_CONCATENATED + NUM_CONCATENATED_POLYS;

    // Number of to-be-shifted polynomials in PCS: base to-be-shifted + concatenated
    static constexpr size_t NUM_PCS_TO_BE_SHIFTED = NUM_TO_BE_SHIFTED + NUM_CONCATENATED_POLYS;

    // The index of the first unshifted witness that is going to be shifted when AllEntities are partitioned
    static constexpr size_t TO_BE_SHIFTED_WITNESSES_START = NUM_PRECOMPUTED_ENTITIES + NUM_WIRES_NON_SHIFTED;

    // The index of the shift of the first to be shifted witness
    static constexpr size_t SHIFTED_WITNESSES_START = NUM_SHIFTED_ENTITIES + TO_BE_SHIFTED_WITNESSES_START;

    // A container to be fed to ShpleminiVerifier to avoid redundant scalar muls.
    // Identifies commitments that appear in both the unshifted and shifted batches:
    //   Unshifted batch (14): masking(1) + ordered_extra(1) + op(1) + ordered(5) + z_perm(1) + concat(5)
    //   Shifted batch (14):   op_queue(3) + ordered(5) + z_perm(1) + concat(5)
    // Range 1: ordered(5) + z_perm(1) — stored indices 2..7 (unshifted) ↔ 16..21 (shifted)
    // Range 2: concatenated(5)        — stored indices 8..12 (unshifted) ↔ 22..26 (shifted)
    // (Stored indices are 0-based after ZK offset; offset=2 accounts for Q_commitment + gemini_masking_poly)
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = RepeatedCommitmentsData(2, 16, 6, 8, 22, 5);

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

    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    using SubrelationSeparators = std::array<FF, NUM_SUBRELATIONS - 1>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();

    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3.
    // The degree has to be further increased because the relation is multiplied by the Row Disabling Polynomial
    // total degree = sumcheck relation degree + 1 (PowZeta) + 1 (masking)
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 2;
    static_assert(BATCHED_RELATION_PARTIAL_LENGTH == Curve::LIBRA_UNIVARIATES_LENGTH,
                  "LIBRA_UNIVARIATES_LENGTH must be equal to Translator::BATCHED_RELATION_PARTIAL_LENGTH");
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    static constexpr size_t num_frs_comm = FrCodec::calc_num_fields<Commitment>();
    static constexpr size_t num_frs_fr = FrCodec::calc_num_fields<FF>();
    static constexpr size_t num_frs_fq = FrCodec::calc_num_fields<BF>();

    // Number of ordered range constraint polynomials: 4 (one per range constraint group) + 1 (overflow)
    static constexpr size_t NUM_ORDERED_RANGE = 5;

    // Commitments sent in wire round: concatenated + ordered range constraints
    // (not counting gemini masking, z_perm, op queue which are sent separately)
    static constexpr size_t NUM_COMMITMENTS_IN_PROOF = NUM_CONCATENATED_POLYS + NUM_ORDERED_RANGE;
    static constexpr size_t PROOF_LENGTH =
        /* 1. Gemini masking poly commitment */ (num_frs_comm) +
        /* 2. Wire commitments: concatenated(5) + ordered(5) = 10 */
        (NUM_COMMITMENTS_IN_PROOF * num_frs_comm) +
        /* 3. Z_PERM commitment */ (num_frs_comm) +
        /* 4. Libra concatenation commitment*/ (num_frs_comm) +
        /* 5. Libra sum */ (num_frs_fr) +
        /* 4. CONST_TRANSLATOR_LOG_N sumcheck univariates */
        (CONST_TRANSLATOR_LOG_N * BATCHED_RELATION_PARTIAL_LENGTH * num_frs_fr) +
        /* 5. sumcheck evaluations (computable precomputed excluded) */ (NUM_SENT_EVALUATIONS * num_frs_fr) +
        /* 6. Libra claimed evaluation */ (num_frs_fr) +
        /* 7. Libra grand sum commitment */ (num_frs_comm) +
        /* 8. Libra quotient commitment */ (num_frs_comm) +
        /* 9. CONST_TRANSLATOR_LOG_N - 1 Gemini Fold commitments */
        ((CONST_TRANSLATOR_LOG_N - 1) * num_frs_comm) +
        /* 10. CONST_TRANSLATOR_LOG_N Gemini a evaluations */
        (CONST_TRANSLATOR_LOG_N * num_frs_fr) +
        /* 11. NUM_SMALL_IPA_EVALUATIONS libra evals */ (NUM_SMALL_IPA_EVALUATIONS * num_frs_fr) +
        /* 12. Shplonk Q commitment */ (num_frs_comm) +
        /* 13. KZG W commitment */ (num_frs_comm);

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
                              lagrange_odd_in_minicircuit,               // column 3
                              lagrange_even_in_minicircuit,              // column 4
                              lagrange_result_row,                       // column 5
                              lagrange_last_in_minicircuit,              // column 6
                              lagrange_masking,                          // column 7
                              lagrange_mini_masking,                     // column 8
                              lagrange_real_last,                        // column 9
                              lagrange_masking_adjacent,                 // column 10
                              lagrange_ordered_masking);                 // column 11
    };

    template <typename DataType> class ConcatenatedPolynomials {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              concatenated_range_constraints_0, // column 0
                              concatenated_range_constraints_1, // column 1
                              concatenated_range_constraints_2, // column 2
                              concatenated_range_constraints_3, // column 3
                              concatenated_non_range)           // column 4
    };
    /**
     * @brief Non-range main wires (13 wires that go into concatenated group 4)
     */
    template <typename DataType> class NonRangeMainWires {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              p_x_low_limbs,               // column 0
                              p_x_high_limbs,              // column 1
                              p_y_low_limbs,               // column 2
                              p_y_high_limbs,              // column 3
                              z_low_limbs,                 // column 4
                              z_high_limbs,                // column 5
                              accumulators_binary_limbs_0, // column 6
                              accumulators_binary_limbs_1, // column 7
                              accumulators_binary_limbs_2, // column 8
                              accumulators_binary_limbs_3, // column 9
                              quotient_low_binary_limbs,   // column 10
                              quotient_high_binary_limbs,  // column 11
                              relation_wide_limbs)         // column 12
    };

    /**
     * @brief Range constraint wires (64 wires that go into concatenated groups 0-3)
     */
    template <typename DataType> class RangeConstraintWires {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              p_x_low_limbs_range_constraint_0,             // column 0
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
                              relation_wide_limbs_range_constraint_2,       // column 62
                              relation_wide_limbs_range_constraint_3);      // column 63
    };

    /**
     * @brief All non-op-queue wires that need to be shifted (composed of non-range main + range constraint)
     */
    template <typename DataType>
    class NonOpQueueWiresToBeShiftedEntities : public NonRangeMainWires<DataType>,
                                               public RangeConstraintWires<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(NonRangeMainWires<DataType>, RangeConstraintWires<DataType>)
    };

    /**
     * @brief Op queue wires (to be shifted): first 3 wires of the to-be-shifted group
     */
    template <typename DataType> class OpQueueWiresToBeShiftedEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              x_lo_y_hi, // column 0
                              x_hi_z_1,  // column 1
                              y_lo_z_2)  // column 2
    };

    /**
     * @brief All wires to be shifted (op queue + non-op-queue)
     */
    template <typename DataType>
    class WireToBeShiftedEntities : public OpQueueWiresToBeShiftedEntities<DataType>,
                                    public NonOpQueueWiresToBeShiftedEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(OpQueueWiresToBeShiftedEntities<DataType>, NonOpQueueWiresToBeShiftedEntities<DataType>)
    };

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

    /**
     * @brief Op queue wires (non-shifted): these represent the op queue and are provided by the merge protocol
     */
    template <typename DataType> class OpQueueWireNonshiftedEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              op // column 0
        );
    };

    /**
     * @brief All wire entities that are not shifted (currently just the op queue wire)
     */
    template <typename DataType> class WireNonshiftedEntities : public OpQueueWireNonshiftedEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(OpQueueWireNonshiftedEntities<DataType>)
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
                            public ConcatenatedPolynomials<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(WireNonshiftedEntities<DataType>,
                                WireToBeShiftedEntities<DataType>,
                                OrderedRangeConstraints<DataType>,
                                DerivedWitnessEntities<DataType>,
                                ConcatenatedPolynomials<DataType>)

        /**
         * @brief Entities constructed from circuit data.
         *
         */
        auto get_wires()
        {
            return concatenate(WireNonshiftedEntities<DataType>::get_all(),
                               WireToBeShiftedEntities<DataType>::get_all());
        };

        /**
         * @brief Concatenated polynomials and ordered range constraints (committed to by translator prover).
         * @details 5 concatenated + 5 ordered = 10 commitments.
         */
        auto get_non_opqueue_wires_and_ordered_range_constraints()
        {
            return concatenate(ConcatenatedPolynomials<DataType>::get_all(),
                               OrderedRangeConstraints<DataType>::get_all());
        };

        /**
         * @brief All polys that need shifted views for Sumcheck (corresponds 1:1 with ShiftedEntities).
         * @details WireToBeShifted(80) + OrderedRangeConstraints(5) + DerivedWitness(1) = 86
         */
        auto get_all_to_be_shifted()
        {
            return concatenate(WireToBeShiftedEntities<DataType>::get_all(),
                               OrderedRangeConstraints<DataType>::get_all(),
                               DerivedWitnessEntities<DataType>::get_all());
        };

        /**
         * @brief Get the concatenated polynomials.
         */
        auto get_concatenated() { return ConcatenatedPolynomials<DataType>::get_all(); }

        /**
         * @brief Get all minicircuit wire polynomials that are concatenated into the 5 concatenated polys.
         * @details Returns 5 groups of 16 wires each. Groups 0-3 are range constraint wires; group 4 is
         * 13 non-range main wires + 3 null padding slots (nullptr).
         */
        std::vector<RefVector<DataType>> get_groups_to_be_concatenated()
        {
            // Static zero value for null padding slots (evaluations use 0, polynomials use zero poly)
            static DataType zero_value = DataType(0);

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
                {
                    this->p_x_low_limbs,
                    this->p_x_high_limbs,
                    this->p_y_low_limbs,
                    this->p_y_high_limbs,
                    this->z_low_limbs,
                    this->z_high_limbs,
                    this->accumulators_binary_limbs_0,
                    this->accumulators_binary_limbs_1,
                    this->accumulators_binary_limbs_2,
                    this->accumulators_binary_limbs_3,
                    this->quotient_low_binary_limbs,
                    this->quotient_high_binary_limbs,
                    this->relation_wide_limbs,
                    zero_value, // null padding slot 0
                    zero_value, // null padding slot 1
                    zero_value, // null padding slot 2
                },
            };
        };
    };

    /**
     * @brief Op queue shifted entities (mirrors OpQueueWiresToBeShiftedEntities)
     */
    template <typename DataType> class OpQueueShiftedEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              x_lo_y_hi_shift, // column 0
                              x_hi_z_1_shift,  // column 1
                              y_lo_z_2_shift)  // column 2
    };

    /**
     * @brief Non-op-queue minicircuit wire shifted entities (mirrors NonOpQueueWiresToBeShiftedEntities)
     */
    template <typename DataType> class NonOpQueueShiftedEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
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
                              relation_wide_limbs_range_constraint_3_shift)       // column 79
    };

    /**
     * @brief Ordered range constraint + z_perm shifted entities
     */
    template <typename DataType> class DerivedShiftedEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              ordered_range_constraints_0_shift, // column 80
                              ordered_range_constraints_1_shift, // column 81
                              ordered_range_constraints_2_shift, // column 82
                              ordered_range_constraints_3_shift, // column 83
                              ordered_range_constraints_4_shift, // column 84
                              z_perm_shift)                      // column 85
    };

    /**
     * @brief Represents polynomials shifted by 1 or their evaluations, defined relative to WireToBeShiftedEntities.
     */
    template <typename DataType>
    class ShiftedEntities : public OpQueueShiftedEntities<DataType>,
                            public NonOpQueueShiftedEntities<DataType>,
                            public DerivedShiftedEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(OpQueueShiftedEntities<DataType>,
                                NonOpQueueShiftedEntities<DataType>,
                                DerivedShiftedEntities<DataType>)

        /**
         * @brief PCS-level shifted evaluations matching get_to_be_shifted():
         * op_queue(3) + ordered_range(5) + z_perm(1) = 9
         */
        auto get_pcs_shifted()
        {
            return concatenate(OpQueueShiftedEntities<DataType>::get_all(),
                               DerivedShiftedEntities<DataType>::get_all());
        }

        /**
         * @brief Get the shifted versions of minicircuit wires organized into 5 concatenation groups.
         * @details Returns 5 groups of 16 shifted wires each, mirroring the structure of
         * get_groups_to_be_concatenated(). Groups 0-3 are range constraint wires; group 4 is
         * 13 non-range main wires (zero values used for null padding).
         */
        std::vector<RefVector<DataType>> get_groups_to_be_concatenated_shifted()
        {
            // For null padding slots, we use DataType(0) which works for FF evaluations.
            // The verifier only operates on evaluations, not polynomials.
            static DataType zero_value = DataType(0);

            return {
                {
                    this->p_x_low_limbs_range_constraint_0_shift,
                    this->p_x_low_limbs_range_constraint_1_shift,
                    this->p_x_low_limbs_range_constraint_2_shift,
                    this->p_x_low_limbs_range_constraint_3_shift,
                    this->p_x_low_limbs_range_constraint_4_shift,
                    this->p_x_low_limbs_range_constraint_tail_shift,
                    this->p_x_high_limbs_range_constraint_0_shift,
                    this->p_x_high_limbs_range_constraint_1_shift,
                    this->p_x_high_limbs_range_constraint_2_shift,
                    this->p_x_high_limbs_range_constraint_3_shift,
                    this->p_x_high_limbs_range_constraint_4_shift,
                    this->p_x_high_limbs_range_constraint_tail_shift,
                    this->p_y_low_limbs_range_constraint_0_shift,
                    this->p_y_low_limbs_range_constraint_1_shift,
                    this->p_y_low_limbs_range_constraint_2_shift,
                    this->p_y_low_limbs_range_constraint_3_shift,
                },
                {
                    this->p_y_low_limbs_range_constraint_4_shift,
                    this->p_y_low_limbs_range_constraint_tail_shift,
                    this->p_y_high_limbs_range_constraint_0_shift,
                    this->p_y_high_limbs_range_constraint_1_shift,
                    this->p_y_high_limbs_range_constraint_2_shift,
                    this->p_y_high_limbs_range_constraint_3_shift,
                    this->p_y_high_limbs_range_constraint_4_shift,
                    this->p_y_high_limbs_range_constraint_tail_shift,
                    this->z_low_limbs_range_constraint_0_shift,
                    this->z_low_limbs_range_constraint_1_shift,
                    this->z_low_limbs_range_constraint_2_shift,
                    this->z_low_limbs_range_constraint_3_shift,
                    this->z_low_limbs_range_constraint_4_shift,
                    this->z_low_limbs_range_constraint_tail_shift,
                    this->z_high_limbs_range_constraint_0_shift,
                    this->z_high_limbs_range_constraint_1_shift,
                },
                {
                    this->z_high_limbs_range_constraint_2_shift,
                    this->z_high_limbs_range_constraint_3_shift,
                    this->z_high_limbs_range_constraint_4_shift,
                    this->z_high_limbs_range_constraint_tail_shift,
                    this->accumulator_low_limbs_range_constraint_0_shift,
                    this->accumulator_low_limbs_range_constraint_1_shift,
                    this->accumulator_low_limbs_range_constraint_2_shift,
                    this->accumulator_low_limbs_range_constraint_3_shift,
                    this->accumulator_low_limbs_range_constraint_4_shift,
                    this->accumulator_low_limbs_range_constraint_tail_shift,
                    this->accumulator_high_limbs_range_constraint_0_shift,
                    this->accumulator_high_limbs_range_constraint_1_shift,
                    this->accumulator_high_limbs_range_constraint_2_shift,
                    this->accumulator_high_limbs_range_constraint_3_shift,
                    this->accumulator_high_limbs_range_constraint_4_shift,
                    this->accumulator_high_limbs_range_constraint_tail_shift,
                },
                {
                    this->quotient_low_limbs_range_constraint_0_shift,
                    this->quotient_low_limbs_range_constraint_1_shift,
                    this->quotient_low_limbs_range_constraint_2_shift,
                    this->quotient_low_limbs_range_constraint_3_shift,
                    this->quotient_low_limbs_range_constraint_4_shift,
                    this->quotient_low_limbs_range_constraint_tail_shift,
                    this->quotient_high_limbs_range_constraint_0_shift,
                    this->quotient_high_limbs_range_constraint_1_shift,
                    this->quotient_high_limbs_range_constraint_2_shift,
                    this->quotient_high_limbs_range_constraint_3_shift,
                    this->quotient_high_limbs_range_constraint_4_shift,
                    this->quotient_high_limbs_range_constraint_tail_shift,
                    this->relation_wide_limbs_range_constraint_0_shift,
                    this->relation_wide_limbs_range_constraint_1_shift,
                    this->relation_wide_limbs_range_constraint_2_shift,
                    this->relation_wide_limbs_range_constraint_3_shift,
                },
                {
                    this->p_x_low_limbs_shift,
                    this->p_x_high_limbs_shift,
                    this->p_y_low_limbs_shift,
                    this->p_y_high_limbs_shift,
                    this->z_low_limbs_shift,
                    this->z_high_limbs_shift,
                    this->accumulators_binary_limbs_0_shift,
                    this->accumulators_binary_limbs_1_shift,
                    this->accumulators_binary_limbs_2_shift,
                    this->accumulators_binary_limbs_3_shift,
                    this->quotient_low_binary_limbs_shift,
                    this->quotient_high_binary_limbs_shift,
                    this->relation_wide_limbs_shift,
                    zero_value, // null padding slot 0
                    zero_value, // null padding slot 1
                    zero_value, // null padding slot 2
                },
            };
        };
    };

    /**
     * @brief Container for ZK entities (gemini masking polynomial for ZK-PCS)
     * @details Translator is always ZK, so this always contains the masking polynomial
     */
    template <typename DataType> class MaskingEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType, gemini_masking_poly)
    };

    /**
     * @brief A base class labelling all entities (for instance, all of the polynomials used by the prover during
     * sumcheck) in this Honk variant along with particular subsets of interest.
     * @details Used to build containers for: the prover's polynomial during sumcheck; the sumcheck's folded
     * polynomials; the univariates consturcted during during sumcheck; the evaluations produced by sumcheck.
     *
     * Symbolically we have: AllEntities = PrecomputedEntities + WitnessEntities + ShiftedEntities + MaskingEntities.
     */
    template <typename DataType>
    class AllEntities : public MaskingEntities<DataType>,
                        public PrecomputedEntities<DataType>,
                        public WitnessEntities<DataType>,
                        public ShiftedEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(MaskingEntities<DataType>,
                                PrecomputedEntities<DataType>,
                                WitnessEntities<DataType>,
                                ShiftedEntities<DataType>)

        auto get_precomputed() const { return PrecomputedEntities<DataType>::get_all(); };

        /**
         * @brief Getter for concatenated polynomials
         */
        auto get_concatenated() { return ConcatenatedPolynomials<DataType>::get_all(); };

        /**
         * @brief Getter for the ordered entities used in computing the denominator of the grand product in the
         * permutation relation.
         */
        auto get_ordered_range_constraints() { return OrderedRangeConstraints<DataType>::get_all(); };

        /**
         * @brief All unshifted polynomials for PCS (excludes computable precomputed, includes concatenated).
         * @details masking(1) + ordered_extra(1) + op(1) + ordered(5) + z_perm(1) + concat(5) = 14
         */
        auto get_pcs_unshifted()
        {
            return concatenate(
                MaskingEntities<DataType>::get_all(),                                     // gemini_masking_poly
                RefArray<DataType, 1>{ this->ordered_extra_range_constraints_numerator }, // non-computable precomputed
                WireNonshiftedEntities<DataType>::get_all(),                              // op (from merge protocol)
                OrderedRangeConstraints<DataType>::get_all(),                             // ordered_0..4
                DerivedWitnessEntities<DataType>::get_all(),                              // z_perm
                ConcatenatedPolynomials<DataType>::get_all());                            // concat_0..4
        }

        /**
         * @brief All to-be-shifted polynomials for PCS (base to-be-shifted + concatenated).
         * @details op_queue_shifted(3) + ordered(5) + z_perm(1) + concat(5) = 14
         */
        auto get_pcs_to_be_shifted()
        {
            return concatenate(OpQueueWiresToBeShiftedEntities<DataType>::get_all(), // x_lo_y_hi, x_hi_z_1, y_lo_z_2
                               OrderedRangeConstraints<DataType>::get_all(),         // ordered_0..4
                               DerivedWitnessEntities<DataType>::get_all(),          // z_perm
                               ConcatenatedPolynomials<DataType>::get_all());        // concat_0..4
        }

        auto get_shifted() { return ShiftedEntities<DataType>::get_all(); };
        auto get_pcs_shifted() { return ShiftedEntities<DataType>::get_pcs_shifted(); };

        /**
         * @brief The 26 full-circuit entities: everything except computable precomputed and minicircuit wires/shifts.
         * @details Masking(1) + ordered_extra(1) + op(1) + OpQueueTBS(3) + OrderedRange(5) + z_perm(1)
         *          + Concatenated(5) + pcs_shifted(9) = 26
         */
        auto get_full_circuit_entities()
        {
            return concatenate(MaskingEntities<DataType>::get_all(),
                               RefArray<DataType, 1>{ this->ordered_extra_range_constraints_numerator },
                               WireNonshiftedEntities<DataType>::get_all(),
                               OpQueueWiresToBeShiftedEntities<DataType>::get_all(),
                               OrderedRangeConstraints<DataType>::get_all(),
                               DerivedWitnessEntities<DataType>::get_all(),
                               ConcatenatedPolynomials<DataType>::get_all(),
                               ShiftedEntities<DataType>::get_pcs_shifted());
        }

        /**
         * @brief The 77 minicircuit wires (unshifted): NonRangeMain(13) + RangeConstraint(64).
         */
        auto get_minicircuit_wires() { return NonOpQueueWiresToBeShiftedEntities<DataType>::get_all(); }

        /**
         * @brief The 77 minicircuit wire shifts: corresponds 1:1 with get_minicircuit_wires().
         */
        auto get_minicircuit_wires_shifted() { return NonOpQueueShiftedEntities<DataType>::get_all(); }

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

    // Static consistency checks for entity counts
    static_assert(PrecomputedEntities<FF>::_members_size == NUM_PRECOMPUTED_ENTITIES);
    static_assert(NUM_ALL_ENTITIES ==
                  NUM_MASKING_POLYNOMIALS + NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES + NUM_SHIFTED_ENTITIES);
    static_assert(NUM_COMPUTABLE_PRECOMPUTED == NUM_PRECOMPUTED_ENTITIES - 1,
                  "All precomputed selectors except ordered_extra_range_constraints_numerator are computable");

    /**
     * @brief Compute the computable precomputed selector evaluations and write them into AllEntities.
     */
    template <typename FFType>
    static void compute_computable_precomputed(AllEntities<FFType>& evals, std::span<const FFType> challenge)
    {
        TranslatorSelectorEvaluations<FFType, LOG_MINI_CIRCUIT_SIZE>::compute(challenge).populate(evals);
    }

    /**
     * @brief Prover: read the 154 minicircuit wire evaluations from partially-evaluated polynomials.
     * @details After LOG_MINI_CIRCUIT_SIZE rounds, each polynomial has been folded to a single value at index [0].
     * We extract the 77 unshifted + 77 shifted minicircuit wire evaluations.
     */
    template <typename PolyContainer>
    static std::array<FF, NUM_MINICIRCUIT_EVALUATIONS> get_minicircuit_evaluations(PolyContainer& polys)
    {
        std::array<FF, NUM_MINICIRCUIT_EVALUATIONS> result;
        size_t dst = 0;
        for (auto& wire : polys.get_minicircuit_wires()) {
            result[dst++] = wire[0];
        }
        for (auto& wire : polys.get_minicircuit_wires_shifted()) {
            result[dst++] = wire[0];
        }
        return result;
    }

    /**
     * @brief Verifier: place the 154 raw mid-sumcheck minicircuit wire evaluations into AllEntities.
     * @details These are evaluations after LOG_MINI_CIRCUIT_SIZE rounds of partial evaluation (before the
     * top-4 rounds). They must be scaled by L_0(u_top) before the relation check — see complete_claimed_evaluations.
     */
    template <typename FFType>
    static void set_minicircuit_evaluations(AllEntities<FFType>& evals,
                                            const std::array<FFType, NUM_MINICIRCUIT_EVALUATIONS>& mid)
    {
        size_t src = 0;
        for (auto& wire : evals.get_minicircuit_wires()) {
            wire = mid[src++];
        }
        for (auto& wire : evals.get_minicircuit_wires_shifted()) {
            wire = mid[src++];
        }
    }

    /**
     * @brief Verifier: complete the claimed evaluations for the sumcheck relation check.
     * @details After set_full_circuit_evaluations and set_minicircuit_evaluations have placed raw values,
     * this method:
     *   1. Computes the 12 structured precomputed selector evaluations from the challenge.
     *   2. Multiplies the 154 minicircuit wire entries by L_0(u_top) = Π(1 - u_i) for the top 4
     *      challenges, converting mid-sumcheck values to full evaluations at the sumcheck point.
     */
    template <typename FFType>
    static void complete_claimed_evaluations(AllEntities<FFType>& evals, std::span<const FFType> challenge)
    {
        // 1. Compute the computable precomputed selector evaluations
        compute_computable_precomputed(evals, challenge);

        // 2. Scale minicircuit wire evaluations by L_0(u_top) = Π_{i=0}^{3} (1 - u_{LOG_MINI + i})
        FFType l0 = FFType(1);
        for (size_t i = 0; i < CONST_TRANSLATOR_LOG_N - LOG_MINI_CIRCUIT_SIZE; i++) {
            l0 *= (FFType(1) - challenge[LOG_MINI_CIRCUIT_SIZE + i]);
        }
        for (auto& wire : evals.get_minicircuit_wires()) {
            wire *= l0;
        }
        for (auto& wire : evals.get_minicircuit_wires_shifted()) {
            wire *= l0;
        }
    }

    /**
     * @brief Verifier: complete full-circuit evaluations from received array and challenge.
     * @details Assumes minicircuit wire evaluations have already been placed into evals
     * via set_minicircuit_evaluations. This method sets the full-circuit evaluations and then completes
     * all evaluations (computable precomputed selectors + L_0 scaling of minicircuit wires).
     */
    template <typename FFType>
    static void complete_full_circuit_evaluations(AllEntities<FFType>& evals,
                                                  const std::array<FFType, NUM_FULL_CIRCUIT_EVALUATIONS>& full_circuit,
                                                  std::span<const FFType> challenge)
    {
        set_full_circuit_evaluations(evals, full_circuit);
        complete_claimed_evaluations(evals, challenge);
    }

    /**
     * @brief Prover: extract the 26 full-circuit evaluations via get_full_circuit_entities().
     */
    template <typename FFType>
    static std::array<FFType, NUM_FULL_CIRCUIT_EVALUATIONS> get_full_circuit_evaluations(AllEntities<FFType>& evals)
    {
        std::array<FFType, NUM_FULL_CIRCUIT_EVALUATIONS> result;
        size_t dst = 0;
        for (auto& entity : evals.get_full_circuit_entities()) {
            result[dst++] = entity;
        }
        return result;
    }

    /**
     * @brief Verifier: write the 26 full-circuit evaluations back via get_full_circuit_entities().
     */
    template <typename FFType>
    static void set_full_circuit_evaluations(AllEntities<FFType>& evals,
                                             const std::array<FFType, NUM_FULL_CIRCUIT_EVALUATIONS>& full_circuit)
    {
        size_t src = 0;
        for (auto& entity : evals.get_full_circuit_entities()) {
            entity = full_circuit[src++];
        }
    }

    /**
     * @brief A container for the prover polynomials handles.
     */
    class ProverPolynomials : public AllEntities<Polynomial> {
      public:
        /**
         * @brief ProverPolynomials constructor
         * @details Initializes wire polynomials efficiently to be only minicircuit size..
         */
        ProverPolynomials()
        {

            const size_t circuit_size = 1 << CONST_TRANSLATOR_LOG_N;
            for (auto& ordered_range_constraint : get_ordered_range_constraints()) {
                ordered_range_constraint = Polynomial{ /*size*/ circuit_size - 1,
                                                       /*largest possible index*/ circuit_size,
                                                       1 };
            }

            // Initialize 5 concatenated polynomials (full circuit_size, shiftable with start_index=1)
            // Row 0 of block 0 is the no-op row where all values are zero.
            for (auto& concat_poly : get_concatenated()) {
                concat_poly = Polynomial{ /*size*/ circuit_size - 1,
                                          /*virtual_size*/ circuit_size,
                                          /*start_index*/ 1 };
            }
            z_perm = Polynomial{ /*size*/ circuit_size - 1,
                                 /*virtual_size*/ circuit_size,
                                 /*start_index*/ 1 };

            op = Polynomial{ MINI_CIRCUIT_SIZE, circuit_size };

            // All minicircuit wires (non-op-queue) are only non-zero in [1, MINI_CIRCUIT_SIZE)
            for (auto& poly : NonOpQueueWiresToBeShiftedEntities<Polynomial>::get_all()) {
                if (poly.is_empty()) {
                    poly = Polynomial{ /*size*/ MINI_CIRCUIT_SIZE - 1,
                                       /*virtual_size*/ circuit_size,
                                       /*start_index*/ 1 };
                }
            }

            // Op queue wires to be shifted
            for (auto& poly : OpQueueWiresToBeShiftedEntities<Polynomial>::get_all()) {
                if (poly.is_empty()) {
                    poly = Polynomial{ /*size*/ MINI_CIRCUIT_SIZE - 1,
                                       /*virtual_size*/ circuit_size,
                                       /*start_index*/ 1 };
                }
            }

            // Initialize lagrange polynomials and the ordered extra range constraints numerator (the precomputed
            // polynomials) within the appropriate range they operate on
            lagrange_first = Polynomial{ /*size*/ 1, /*virtual_size*/ circuit_size };
            lagrange_result_row = Polynomial{ /*size*/ 1, /*virtual_size*/ circuit_size, /*start_index*/ RESULT_ROW };
            lagrange_even_in_minicircuit = Polynomial{ /*size*/ MINI_CIRCUIT_SIZE - RESULT_ROW - NUM_MASKED_ROWS_END,
                                                       /*virtual_size*/ circuit_size,
                                                       /*start_index=*/RESULT_ROW };
            lagrange_odd_in_minicircuit = Polynomial{ /*size*/ MINI_CIRCUIT_SIZE - RESULT_ROW - NUM_MASKED_ROWS_END - 1,
                                                      /*virtual_size*/ circuit_size,
                                                      /*start_index=*/RESULT_ROW + 1 };
            lagrange_last_in_minicircuit = Polynomial{ /*size*/ 1,
                                                       /*virtual_size*/ circuit_size,
                                                       /*start_index=*/MINI_CIRCUIT_SIZE - NUM_MASKED_ROWS_END - 1 };
            lagrange_mini_masking = Polynomial{ /*size*/ MINI_CIRCUIT_SIZE - RANDOMNESS_START,
                                                /*virtual_size*/ circuit_size,
                                                /*start_index=*/RANDOMNESS_START };
            // With concatenation, masking rows are scattered in concatenated polys: end of each of the 16 blocks
            // Must span full circuit since values go up to position 15*MINI+(MINI-1)
            lagrange_masking = Polynomial{ circuit_size, circuit_size };
            lagrange_masking_adjacent = Polynomial{ circuit_size, circuit_size };
            // Ordered masking: contiguous at the end (marks masking positions in ordered polynomials)
            lagrange_ordered_masking = Polynomial{ /*size*/ MAX_RANDOM_VALUES_PER_ORDERED,
                                                   /*virtual_size*/ circuit_size,
                                                   /*start_index*/ circuit_size - MAX_RANDOM_VALUES_PER_ORDERED };
            lagrange_last = Polynomial{ /*size*/ 1,
                                        /*virtual_size*/ circuit_size,
                                        /*start_index*/ circuit_size - 1 };
            // lagrange_real_last marks the last position with sorted values in ordered polynomials
            // (where we check maximum value = 2^14 - 1). With contiguous masking at the end,
            // this is at position circuit_size - MAX_RANDOM_VALUES_PER_ORDERED - 1.
            lagrange_real_last = Polynomial{ /*size*/ 1,
                                             /*virtual_size*/ circuit_size,
                                             /*start_index*/ circuit_size - MAX_RANDOM_VALUES_PER_ORDERED - 1 };
            ordered_extra_range_constraints_numerator =
                Polynomial{ /*size*/ SORTED_STEPS_COUNT * (NUM_CONCATENATED_POLYS + 1),
                            /*virtual_size*/ circuit_size,
                            /*start_index*/ 0 };

            set_shifted();
        }
        ProverPolynomials& operator=(const ProverPolynomials&) = delete;
        ProverPolynomials(const ProverPolynomials& o) = delete;
        ProverPolynomials(ProverPolynomials&& o) noexcept = default;
        ProverPolynomials& operator=(ProverPolynomials&& o) noexcept = default;
        ~ProverPolynomials() = default;
        [[nodiscard]] static size_t get_polynomial_size() { return 1UL << CONST_TRANSLATOR_LOG_N; }
        /**
         * @brief Returns the evaluations of all prover polynomials at one point on the boolean
         * hypercube, which represents one row in the execution trace.
         */
        [[nodiscard]] AllValues get_row(size_t row_idx) const
        {
            AllValues result;
            for (auto [result_field, polynomial] : zip_view(result.get_all(), this->get_all())) {
                // Translator polynomials have different support regions (start_index/end_index)
                // Return 0 for out-of-bounds access (which is the correct value outside support)
                if (row_idx >= polynomial.start_index() && row_idx < polynomial.end_index()) {
                    result_field = polynomial[row_idx];
                } else {
                    result_field = FF(0);
                }
            }
            return result;
        }
        // Set all shifted polynomials based on their to-be-shifted counterpart.
        // Uses get_all_to_be_shifted() (86 entries for Sumcheck), not get_to_be_shifted() (9 entries for PCS).
        void set_shifted()
        {
            for (auto [shifted, to_be_shifted] : zip_view(get_shifted(), get_all_to_be_shifted())) {
                shifted = to_be_shifted.shifted();
            }
        }
    };

    /**
     * @brief The proving key is responsible for storing the polynomials used by the prover.
     *
     */
    class ProvingKey {
      public:
        size_t circuit_size = 1UL << CONST_TRANSLATOR_LOG_N;
        size_t log_circuit_size = CONST_TRANSLATOR_LOG_N;

        ProverPolynomials polynomials; // storage for all polynomials evaluated by the prover
        CommitmentKey commitment_key;

        ProvingKey(const CommitmentKey& commitment_key = CommitmentKey())
            : commitment_key(commitment_key)
        {}
    };

    /**
     * @brief The only precomputed commitment the verifier needs for PCS.
     * @details All other precomputed selectors are computable (evaluations derived from the sumcheck challenge),
     * so they never enter PCS and don't need commitments in the VK.
     */
    template <typename DataType_> class VKEntities {
      public:
        bool operator==(const VKEntities& other) const = default;
        using DataType = DataType_;
        DEFINE_FLAVOR_MEMBERS(DataType, ordered_extra_range_constraints_numerator);
    };

    /**
     * @brief The verification key stores commitments to the precomputed polynomials used by the verifier.
     * @details Translator has a fixed circuit size, so the VK is hardcoded in recursive verifiers.
     * Only ordered_extra_range_constraints_numerator needs a commitment — all other precomputed
     * selectors are structured multilinear polynomials whose evaluations the verifier computes analytically.
     */
    using VerificationKey = FixedVKAndHash_<VKEntities<Commitment>, FF, TranslatorHardcodedVKAndHash>;

    /**
     * @brief A container for storing the partially evaluated multivariates produced by sumcheck.
     */
    using PartiallyEvaluatedMultivariates =
        PartiallyEvaluatedMultivariatesBase<AllEntities<Polynomial>, ProverPolynomials, Polynomial>;

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
            this->relation_wide_limbs_range_constraint_3 = "RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_3";
            this->ordered_range_constraints_0 = "ORDERED_RANGE_CONSTRAINTS_0";
            this->ordered_range_constraints_1 = "ORDERED_RANGE_CONSTRAINTS_1";
            this->ordered_range_constraints_2 = "ORDERED_RANGE_CONSTRAINTS_2";
            this->ordered_range_constraints_3 = "ORDERED_RANGE_CONSTRAINTS_3";
            this->ordered_range_constraints_4 = "ORDERED_RANGE_CONSTRAINTS_4";
            this->z_perm = "Z_PERM";
            this->concatenated_range_constraints_0 = "CONCATENATED_RANGE_CONSTRAINTS_0";
            this->concatenated_range_constraints_1 = "CONCATENATED_RANGE_CONSTRAINTS_1";
            this->concatenated_range_constraints_2 = "CONCATENATED_RANGE_CONSTRAINTS_2";
            this->concatenated_range_constraints_3 = "CONCATENATED_RANGE_CONSTRAINTS_3";
            this->concatenated_non_range = "CONCATENATED_NON_RANGE";

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
            this->lagrange_masking_adjacent = "__LAGRANGE_MASKING_ADJACENT";
            this->lagrange_ordered_masking = "__LAGRANGE_ORDERED_MASKING";
        };
    };

    template <typename Commitment, typename VerificationKey>
    class VerifierCommitments_ : public AllEntities<Commitment> {
      public:
        VerifierCommitments_(const std::shared_ptr<VerificationKey>& verification_key)
        {
            // Only ordered_extra_range_constraints_numerator needs a VK commitment for PCS.
            // All other precomputed selectors are computable (evaluations derived from sumcheck challenge).
            this->ordered_extra_range_constraints_numerator =
                verification_key->ordered_extra_range_constraints_numerator;
        }
    };

    /**
     * @brief When evaluating the sumcheck protocol - can we skip evaluation of all relations for a given row?
     *
     * @details When used in Chonk, the Translator has a large fixed size, which is often not fully utilized.
     *          If a row is completely empty, the values of z_perm and z_perm_shift will match,
     *          we can use this as a proxy to determine if we can skip Sumcheck::compute_univariate
     **/
    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates, typename EdgeType>
    static bool skip_entire_row([[maybe_unused]] const ProverPolynomialsOrPartiallyEvaluatedMultivariates& polynomials,
                                [[maybe_unused]] const EdgeType edge_idx)
    {
        auto s0 = polynomials.ordered_range_constraints_0_shift[edge_idx];
        auto s1 = polynomials.ordered_range_constraints_1_shift[edge_idx];
        auto s2 = polynomials.ordered_range_constraints_2_shift[edge_idx];
        auto s3 = polynomials.ordered_range_constraints_3_shift[edge_idx];
        auto s4 = polynomials.ordered_range_constraints_4_shift[edge_idx];
        auto s5 = polynomials.ordered_range_constraints_0_shift[edge_idx + 1];
        auto s6 = polynomials.ordered_range_constraints_1_shift[edge_idx + 1];
        auto s7 = polynomials.ordered_range_constraints_2_shift[edge_idx + 1];
        auto s8 = polynomials.ordered_range_constraints_3_shift[edge_idx + 1];
        auto s9 = polynomials.ordered_range_constraints_4_shift[edge_idx + 1];
        auto shift_0 = (s0 == 0) && (s1 == 0) && (s2 == 0) && (s3 == 0) && (s4 == 0) && (s5 == 0) && (s6 == 0) &&
                       (s7 == 0) && (s8 == 0) && (s9 == 0);
        return shift_0 && (polynomials.z_perm[edge_idx] == polynomials.z_perm_shift[edge_idx]) &&
               (polynomials.z_perm[edge_idx + 1] == polynomials.z_perm_shift[edge_idx + 1]) &&
               polynomials.lagrange_last[edge_idx] == 0 && polynomials.lagrange_last[edge_idx + 1] == 0;
    }
    using VerifierCommitments = VerifierCommitments_<Commitment, VerificationKey>;
};

} // namespace bb
