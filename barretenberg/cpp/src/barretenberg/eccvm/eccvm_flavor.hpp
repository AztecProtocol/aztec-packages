// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/common/std_array.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/eccvm//eccvm_fixed_vk.hpp"
#include "barretenberg/eccvm/eccvm_circuit_builder.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/flavor/relation_definitions.hpp"
#include "barretenberg/flavor/repeated_commitments_data.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/ecc_vm/ecc_bools_relation.hpp"
#include "barretenberg/relations/ecc_vm/ecc_lookup_relation.hpp"
#include "barretenberg/relations/ecc_vm/ecc_msm_relation.hpp"
#include "barretenberg/relations/ecc_vm/ecc_point_table_relation.hpp"
#include "barretenberg/relations/ecc_vm/ecc_set_relation.hpp"
#include "barretenberg/relations/ecc_vm/ecc_transcript_relation.hpp"
#include "barretenberg/relations/ecc_vm/ecc_wnaf_relation.hpp"
#include "barretenberg/relations/relation_parameters.hpp"

// NOLINTBEGIN(cppcoreguidelines-avoid-const-or-ref-data-members)

namespace bb {

class ECCVMFlavor {
  public:
    using CircuitBuilder = ECCVMCircuitBuilder;
    using CycleGroup = bb::g1;
    using Curve = curve::Grumpkin;
    using G1 = typename Curve::Group;
    using PCS = IPA<Curve>;
    using FF = typename Curve::ScalarField;
    using BF = typename Curve::BaseField;
    using Polynomial = bb::Polynomial<FF>;
    using GroupElement = typename G1::element;
    using Commitment = typename G1::affine_element;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<Curve>;
    using RelationSeparator = FF;
    using MSM = bb::eccvm::MSM<CycleGroup>;
    using Transcript = NativeTranscript;

    // indicates when evaluating sumcheck, edges must be extended to be MAX_TOTAL_RELATION_LENGTH
    static constexpr bool USE_SHORT_MONOMIALS = false;

    // Indicates that this flavor runs with ZK Sumcheck.
    static constexpr bool HasZK = true;
    // ECCVM proof size and its recursive verifier circuit are genuinely fixed, hence no padding is needed.
    static constexpr bool USE_PADDING = false;
    // Fixed size of the ECCVM circuits used in ClientIVC
    // Important: these constants cannot be  arbitrarily changes - please consult with a member of the Crypto team if
    // they become too small.
    static constexpr size_t ECCVM_FIXED_SIZE = 1UL << CONST_ECCVM_LOG_N;

    static constexpr size_t NUM_WIRES = 85;

    // The number of multivariate polynomials on which a sumcheck prover sumcheck operates (including shifts). We often
    // need containers of this size to hold related data, so we choose a name more agnostic than `NUM_POLYNOMIALS`.
    // Note: this number does not include the individual sorted list polynomials.
    static constexpr size_t NUM_ALL_ENTITIES = 116;
    // The number of polynomials precomputed to describe a circuit and to aid a prover in constructing a satisfying
    // assignment of witnesses. We again choose a neutral name.
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = 3;
    // The total number of witness entities not including shifts.
    static constexpr size_t NUM_WITNESS_ENTITIES = 87;
    // The number of entities in ShiftedEntities.
    static constexpr size_t NUM_SHIFTED_ENTITIES = 26;
    // The number of entities in DerivedWitnessEntities that are not going to be shifted.
    static constexpr size_t NUM_DERIVED_WITNESS_ENTITIES_NON_SHIFTED = 1;
    // A container to be fed to ShpleminiVerifier to avoid redundant scalar muls, the first number is the index of the
    // first witness to be shifted.
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS =
        RepeatedCommitmentsData(NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES -
                                    NUM_DERIVED_WITNESS_ENTITIES_NON_SHIFTED - NUM_SHIFTED_ENTITIES,
                                NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES,
                                NUM_SHIFTED_ENTITIES);

    using GrandProductRelations = std::tuple<ECCVMSetRelation<FF>>;
    // define the tuple of Relations that comprise the Sumcheck relation
    template <typename FF>
    using Relations_ = std::tuple<ECCVMTranscriptRelation<FF>,
                                  ECCVMPointTableRelation<FF>,
                                  ECCVMWnafRelation<FF>,
                                  ECCVMMSMRelation<FF>,
                                  ECCVMSetRelation<FF>,
                                  ECCVMLookupRelation<FF>,
                                  ECCVMBoolsRelation<FF>>;
    using Relations = Relations_<FF>;
    using LookupRelation = ECCVMLookupRelation<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();

    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3.
    // The degree has to be further increased by 1 because the relation is multiplied by the Row Disabling    //
    // Polynomial
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 2;
    static constexpr size_t NUM_RELATIONS = std::tuple_size<Relations>::value;

    // Instantiate the BarycentricData needed to extend each Relation Univariate

    // define the containers for storing the contributions from each relation in Sumcheck
    using SumcheckTupleOfTuplesOfUnivariates = decltype(create_sumcheck_tuple_of_tuples_of_univariates<Relations>());

    // The sub-protocol `compute_translation_opening_claims` outputs an opening claim for the batched univariate
    // evaluation of `op`, `Px`, `Py`, `z1`, and `z2`, and an array of opening claims for the evaluations of the
    // SmallSubgroupIPA witness polynomials.
    static constexpr size_t NUM_TRANSLATION_OPENING_CLAIMS = NUM_SMALL_IPA_EVALUATIONS + 1;
    using TupleOfArraysOfValues = decltype(create_tuple_of_arrays_of_values<Relations>());

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/989): refine access specifiers in flavors, this is
    // public as it is also used in the recursive flavor but the two could possibly me unified eventually
    /**
     * @brief A base class labelling precomputed entities and (ordered) subsets of interest.
     * @details Used to build the proving key and verification key.
     */
    template <typename DataType_> class PrecomputedEntities {
      public:
        bool operator==(const PrecomputedEntities& other) const = default;
        using DataType = DataType_;
        DEFINE_FLAVOR_MEMBERS(DataType,
                              lagrange_first,  // column 0
                              lagrange_second, // column 1
                              lagrange_last);  // column 2

        DataType get_selectors() { return get_all(); };
    };

    /**
     * @brief Container for all derived witness polynomials used/constructed by the prover.
     * @details Shifts are not included here since they do not occupy their own memory.
     */
    template <typename DataType> struct DerivedWitnessEntities {
        DEFINE_FLAVOR_MEMBERS(DataType,
                              z_perm,           // column 0
                              lookup_inverses); // column 1
    };
    template <typename DataType> class WireNonShiftedEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              transcript_add,                             // column 0
                              transcript_eq,                              // column 1
                              transcript_msm_transition,                  // column 2
                              transcript_Px,                              // column 3
                              transcript_Py,                              // column 4
                              transcript_z1,                              // column 5
                              transcript_z2,                              // column 6
                              transcript_z1zero,                          // column 7
                              transcript_z2zero,                          // column 8
                              transcript_op,                              // column 9
                              transcript_msm_x,                           // column 10
                              transcript_msm_y,                           // column 11
                              precompute_point_transition,                // column 12
                              precompute_s1lo,                            // column 13
                              precompute_s2hi,                            // column 14
                              precompute_s2lo,                            // column 15
                              precompute_s3hi,                            // column 16
                              precompute_s3lo,                            // column 17
                              precompute_s4hi,                            // column 18
                              precompute_s4lo,                            // column 19
                              precompute_skew,                            // column 20
                              msm_size_of_msm,                            // column 21
                              msm_add2,                                   // column 22
                              msm_add3,                                   // column 23
                              msm_add4,                                   // column 24
                              msm_x1,                                     // column 25
                              msm_y1,                                     // column 26
                              msm_x2,                                     // column 27
                              msm_y2,                                     // column 28
                              msm_x3,                                     // column 29
                              msm_y3,                                     // column 30
                              msm_x4,                                     // column 31
                              msm_y4,                                     // column 32
                              msm_collision_x1,                           // column 33
                              msm_collision_x2,                           // column 34
                              msm_collision_x3,                           // column 35
                              msm_collision_x4,                           // column 36
                              msm_lambda1,                                // column 37
                              msm_lambda2,                                // column 38
                              msm_lambda3,                                // column 39
                              msm_lambda4,                                // column 40
                              msm_slice1,                                 // column 41
                              msm_slice2,                                 // column 42
                              msm_slice3,                                 // column 43
                              msm_slice4,                                 // column 44
                              transcript_reset_accumulator,               // column 45
                              lookup_read_counts_0,                       // column 46
                              lookup_read_counts_1,                       // column 47
                              transcript_base_infinity,                   // column 48
                              transcript_base_x_inverse,                  // column 49
                              transcript_base_y_inverse,                  // column 50
                              transcript_add_x_equal,                     // column 51
                              transcript_add_y_equal,                     // column 52
                              transcript_add_lambda,                      // column 53
                              transcript_msm_intermediate_x,              // column 54
                              transcript_msm_intermediate_y,              // column 55
                              transcript_msm_infinity,                    // column 56
                              transcript_msm_x_inverse,                   // column 57
                              transcript_msm_count_zero_at_transition,    // column 58
                              transcript_msm_count_at_transition_inverse) // column 59
    };

    /**
     * @brief Container for all to-be-shifted witness polynomials excluding the accumulators used/constructed by the
     * prover.
     * @details Shifts are not included here since they do not occupy their own memory.
     */
    template <typename DataType> class WireToBeShiftedWithoutAccumulatorsEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              transcript_mul,        // column 60
                              transcript_msm_count,  // column 61
                              precompute_scalar_sum, // column 62
                              precompute_s1hi,       // column 63
                              precompute_dx,         // column 64
                              precompute_dy,         // column 65
                              precompute_tx,         // column 66
                              precompute_ty,         // column 67
                              msm_transition,        // column 68
                              msm_add,               // column 69
                              msm_double,            // column 70
                              msm_skew,              // column 71
                              msm_accumulator_x,     // column 72
                              msm_accumulator_y,     // column 73
                              msm_count,             // column 74
                              msm_round,             // column 75
                              msm_add1,              // column 76
                              msm_pc,                // column 77
                              precompute_pc,         // column 78
                              transcript_pc,         // column 79
                              precompute_round,      // column 80
                              precompute_select)     // column 81
    };

    /**
     * @brief Containter for transcript accumulators, they stand out as the only to-be-shifted wires that are always
     * populated until the dyadic size of the circuit.
     */
    template <typename DataType> class WireToBeShiftedAccumulatorEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              transcript_accumulator_empty, // column 82
                              transcript_accumulator_x,     // column 83
                              transcript_accumulator_y)     // column 84
    };

    /**
     * @brief Container for all witness polynomials used/constructed by the prover.
     * @details Shifts are not included here since they do not occupy their own memory.
     */
    template <typename DataType>
    class WitnessEntities : public WireNonShiftedEntities<DataType>,
                            public WireToBeShiftedWithoutAccumulatorsEntities<DataType>,
                            public WireToBeShiftedAccumulatorEntities<DataType>,
                            public DerivedWitnessEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(WireNonShiftedEntities<DataType>,
                                WireToBeShiftedWithoutAccumulatorsEntities<DataType>,
                                WireToBeShiftedAccumulatorEntities<DataType>,
                                DerivedWitnessEntities<DataType>)
        auto get_wires()
        {
            return concatenate(WireNonShiftedEntities<DataType>::get_all(),
                               WireToBeShiftedWithoutAccumulatorsEntities<DataType>::get_all(),
                               WireToBeShiftedAccumulatorEntities<DataType>::get_all());
        };

        // Used to amortize the commitment time when the ECCVM size is fixed
        auto get_accumulators() { return WireToBeShiftedAccumulatorEntities<DataType>::get_all(); };
        auto get_wires_without_accumulators()
        {
            return concatenate(WireNonShiftedEntities<DataType>::get_all(),
                               WireToBeShiftedWithoutAccumulatorsEntities<DataType>::get_all());
        }
    };

    /**
     * @brief Represents polynomials shifted by 1 or their evaluations, defined relative to WitnessEntities.
     */
    template <typename DataType> class ShiftedEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              transcript_mul_shift,               // column 0
                              transcript_msm_count_shift,         // column 1
                              precompute_scalar_sum_shift,        // column 2
                              precompute_s1hi_shift,              // column 3
                              precompute_dx_shift,                // column 4
                              precompute_dy_shift,                // column 5
                              precompute_tx_shift,                // column 6
                              precompute_ty_shift,                // column 7
                              msm_transition_shift,               // column 8
                              msm_add_shift,                      // column 9
                              msm_double_shift,                   // column 10
                              msm_skew_shift,                     // column 11
                              msm_accumulator_x_shift,            // column 12
                              msm_accumulator_y_shift,            // column 13
                              msm_count_shift,                    // column 14
                              msm_round_shift,                    // column 15
                              msm_add1_shift,                     // column 16
                              msm_pc_shift,                       // column 17
                              precompute_pc_shift,                // column 18
                              transcript_pc_shift,                // column 19
                              precompute_round_shift,             // column 20
                              precompute_select_shift,            // column 21
                              transcript_accumulator_empty_shift, // column 22
                              transcript_accumulator_x_shift,     // column 23
                              transcript_accumulator_y_shift,     // column 24
                              z_perm_shift);                      // column 25
    };

    template <typename DataType, typename PrecomputedAndWitnessEntitiesSuperset>
    static auto get_to_be_shifted(PrecomputedAndWitnessEntitiesSuperset& entities)
    {
        // NOTE: must match order of ShiftedEntities above!
        return RefArray{ entities.transcript_mul,               // column 0
                         entities.transcript_msm_count,         // column 1
                         entities.precompute_scalar_sum,        // column 2
                         entities.precompute_s1hi,              // column 3
                         entities.precompute_dx,                // column 4
                         entities.precompute_dy,                // column 5
                         entities.precompute_tx,                // column 6
                         entities.precompute_ty,                // column 7
                         entities.msm_transition,               // column 8
                         entities.msm_add,                      // column 9
                         entities.msm_double,                   // column 10
                         entities.msm_skew,                     // column 11
                         entities.msm_accumulator_x,            // column 12
                         entities.msm_accumulator_y,            // column 13
                         entities.msm_count,                    // column 14
                         entities.msm_round,                    // column 15
                         entities.msm_add1,                     // column 16
                         entities.msm_pc,                       // column 17
                         entities.precompute_pc,                // column 18
                         entities.transcript_pc,                // column 19
                         entities.precompute_round,             // column 20
                         entities.precompute_select,            // column 21
                         entities.transcript_accumulator_empty, // column 22
                         entities.transcript_accumulator_x,     // column 23
                         entities.transcript_accumulator_y,     // column 24
                         entities.z_perm };                     // column 25
    }

    /**
     * @brief A base class labelling all entities (for instance, all of the polynomials used by the prover during
     * sumcheck) in this Honk variant along with particular subsets of interest
     * @details Used to build containers for: the prover's polynomial during sumcheck; the sumcheck's folded
     * polynomials; the univariates consturcted during during sumcheck; the evaluations produced by sumcheck.
     *
     * Symbolically we have: AllEntities = PrecomputedEntities + WitnessEntities + ShiftedEntities.
     * TODO(https://github.com/AztecProtocol/barretenberg/issues/788): Move to normal composition once comfortable
     * updating usage sites.
     */
    template <typename DataType>
    class AllEntities : public PrecomputedEntities<DataType>,
                        public WitnessEntities<DataType>,
                        public ShiftedEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(PrecomputedEntities<DataType>, WitnessEntities<DataType>, ShiftedEntities<DataType>)
        auto get_unshifted()
        {
            return concatenate(PrecomputedEntities<DataType>::get_all(), WitnessEntities<DataType>::get_all());
        };
        auto get_to_be_shifted() { return ECCVMFlavor::get_to_be_shifted<DataType>(*this); }
        auto get_shifted() { return ShiftedEntities<DataType>::get_all(); };
        auto get_precomputed() { return PrecomputedEntities<DataType>::get_all(); };
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
     * @brief A container for univariates used during sumcheck.
     */
    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;

    /**
     * @brief A container for univariates produced during the hot loop in sumcheck.
     */
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;

    /**
     * @brief A container for the prover polynomials.
     */
    class ProverPolynomials : public AllEntities<Polynomial> {
      public:
        // Define all operations as default, except copy construction/assignment
        ProverPolynomials() = default;
        ProverPolynomials& operator=(const ProverPolynomials&) = delete;
        ProverPolynomials(const ProverPolynomials& o) = delete;
        ProverPolynomials(ProverPolynomials&& o) noexcept = default;
        ProverPolynomials& operator=(ProverPolynomials&& o) noexcept = default;
        ~ProverPolynomials() = default;
        [[nodiscard]] size_t get_polynomial_size() const { return this->lagrange_first.size(); }

        /**
         * @brief Returns the evaluations of all prover polynomials at one point on the boolean hypercube, which
         * represents one row in the execution trace.
         */
        AllValues get_row(const size_t row_idx) const
        {
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

        /**
         * @brief Compute the ECCVM flavor polynomial data required to generate an ECCVM Proof
         *
         * @details RawPolynomial member polynomials that this fn must populate described below
         *          For full details see `eccvm/eccvm_flavor.hpp`
         *
         *          lagrange_first: lagrange_first[0] = 1, 0 elsewhere
         *          lagrange_second: lagrange_second[1] = 1, 0 elsewhere
         *          lagrange_last: lagrange_last[lagrange_last.size() - 1] = 1, 0 elsewhere
         *          transcript_add/mul/eq/reset_accumulator: boolean selectors that toggle add/mul/eq/reset opcodes
         trigger
         * incomplete addition rules
         *          transcript_msm_transition: is current transcript row the final `mul` opcode of a multiscalar
         multiplication?
         *          transcript_pc: point counter for transcript columns
         *          transcript_msm_count: counts number of muls processed in an ongoing multiscalar multiplication
         *          transcript_Px: input transcript point, x-coordinate
         *          transcript_Py: input transcriot point, y-coordinate
         *          transcript_op: input transcript opcode value
         *          transcript_z1: input transcript scalar multiplier (low component, 128 bits max)
         *          transcript_z2: input transcript scalar multipplier (high component, 128 bits max)
         * N.B. scalar multiplier = transcript_z1 + \lambda * transcript_z2. \lambda = cube root of unity in scalar
         field
         *          transcript_z1zero: if 1, transcript_z1 must equal 0
         *          transcript_z2zero: if 1, transcript_z2 must equal 0
         *          transcript_accumulator_x: x-coordinate of eccvm accumulator register
         *          transcript_accumulator_y: y-coordinate of eccvm accumulator register
         *          transcript_msm_x: x-coordinate of MSM output
         *          transcript_msm_y: y-coordinate of MSM output
         *          transcript_accumulator_empty: if 1, transcript_accumulator = point at infinity
         *          transcript_base_infinity: if 1, transcript_Px, transcript_Py is a point at infinity
         *          transcript_add_x_equal: if adding a point into the accumulator, is 1 if x-coordinates are equal
         *          transcript_add_y_equal: if adding a point into the accumulator, is 1 if y-coordinates are equal
         *          transcript_base_x_inverse: to check transcript_add_x_equal (if x-vals not equal inverse exists)
         *          transcript_base_y_inverse: to check transcript_add_x_equal (if y-vals not equal inverse exists)
         *          transcript_add_lambda: if adding a point into the accumulator, contains the lambda gradient
         *          transcript_msm_intermediate_x: if add MSM result into accumulator, is msm_output - offset_generator
         *          transcript_msm_intermediate_y: if add MSM result into accumulator, is msm_output - offset_generator
         *          transcript_msm_infinity: is MSM result the point at infinity?
         *          transcript_msm_x_inverse: used to validate transcript_msm_infinity correct
         *          transcript_msm_count_zero_at_transition: does an MSM only contain points at infinity/zero scalars
         *          transcript_msm_count_at_transition_inverse: used to validate transcript_msm_count_zero_at_transition
         *          precompute_pc: point counter for Straus precomputation columns
         *          precompute_select: if 1, evaluate Straus precomputation algorithm at current row
         *          precompute_point_transition: 1 if current row operating on a different point to previous row
         *          precompute_round: round counter for Straus precomputation algorithm
         *          precompute_scalar_sum: accumulating sum of Straus scalar slices
         *          precompute_s1hi/lo: 2-bit hi/lo components of a Straus 4-bit scalar slice
         *          precompute_s2hilo/precompute_s3hi/loprecompute_s4hi/lo: same as above but for a total of 4 Straus
         4-bit scalar slices
         *          precompute_skew: Straus WNAF skew parameter for a single scalar multiplier
         *          precompute_tx: x-coordinate of point accumulator used to generate Straus lookup table for an input
         point (from transcript)
         *          precompute_tx: x-coordinate of point accumulator used to generate Straus lookup table for an input
         point (from transcript)
         *          precompute_dx: x-coordinate of D = 2 * input point we are evaluating Straus over
         *          precompute_dy: y-coordinate of D
         *          msm_pc: point counter for Straus MSM columns
         *          msm_transition: 1 if current row evaluates different MSM to previous row
         *          msm_add: 1 if we are adding points in Straus MSM algorithm at current row
         *          msm_double: 1 if we are doubling accumulator in Straus MSM algorithm at current row
         *          msm_skew: 1 if we are adding skew points in Straus MSM algorithm at current row
         *          msm_size_of_msm: size of multiscalar multiplication current row is a part of
         *          msm_round: describes which round of the Straus MSM algorithm the current row represents
         *          msm_count: number of points processed for the round indicated by `msm_round`
         *          msm_x1: x-coordinate of potential point in Straus MSM round
         *          msm_y1: y-coordinate of potential point in Straus MSM round
         *          msm_x2: x-coordinate of potential point in Straus MSM round
         *          msm_y2: y-coordinate of potential point in Straus MSM round
         *          msm_x3: x-coordinate of potential point in Straus MSM round
         *          msm_y3: y-coordinate of potential point in Straus MSM round
         *          msm_x4: x-coordinate of potential point in Straus MSM round
         *          msm_y4: y-coordinate of potential point in Straus MSM round
         *          msm_add1: are we adding msm_x1/msm_y1 into accumulator at current round?
         *          msm_add2: are we adding msm_x2/msm_y2 into accumulator at current round?
         *          msm_add3: are we adding msm_x3/msm_y3 into accumulator at current round?
         *          msm_add4: are we adding msm_x4/msm_y4 into accumulator at current round?
         *          msm_lambda1: temp variable used for ecc point addition algorithm if msm_add1 = 1
         *          msm_lambda2: temp variable used for ecc point addition algorithm if msm_add2 = 1
         *          msm_lambda3: temp variable used for ecc point addition algorithm if msm_add3 = 1
         *          msm_lambda4: temp variable used for ecc point addition algorithm if msm_add4 = 1
         *          msm_collision_x1: used to ensure incomplete ecc addition exceptions not triggered if msm_add1 = 1
         *          msm_collision_x2: used to ensure incomplete ecc addition exceptions not triggered if msm_add2 = 1
         *          msm_collision_x3: used to ensure incomplete ecc addition exceptions not triggered if msm_add3 = 1
         *          msm_collision_x4: used to ensure incomplete ecc addition exceptions not triggered if msm_add4 = 1
         *          lookup_read_counts_0: stores number of times a point has been read from a Straus precomputation
         table (reads come from msm_x/y1, msm_x/y2)
         *          lookup_read_counts_1: stores number of times a point has been read from a Straus precomputation
         table (reads come from msm_x/y3, msm_x/y4)
         * @return ProverPolynomials
         */
        ProverPolynomials(const CircuitBuilder& builder)
        {
            // compute rows for the three different sections of the ECCVM execution trace
            const auto transcript_rows =
                ECCVMTranscriptBuilder::compute_rows(builder.op_queue->get_eccvm_ops(), builder.get_number_of_muls());
            const std::vector<MSM> msms = builder.get_msms();
            const auto point_table_rows =
                ECCVMPointTablePrecomputationBuilder::compute_rows(CircuitBuilder::get_flattened_scalar_muls(msms));
            const auto result = ECCVMMSMMBuilder::compute_rows(
                msms, builder.get_number_of_muls(), builder.op_queue->get_num_msm_rows());
            const auto& msm_rows = std::get<0>(result);
            const auto& point_table_read_counts = std::get<1>(result);

            const size_t num_rows = std::max({ point_table_rows.size(), msm_rows.size(), transcript_rows.size() }) +
                                    NUM_DISABLED_ROWS_IN_SUMCHECK;
            const auto log_num_rows = static_cast<size_t>(numeric::get_msb64(num_rows));
            size_t dyadic_num_rows = 1UL << (log_num_rows + (1UL << log_num_rows == num_rows ? 0 : 1));
            if (ECCVM_FIXED_SIZE < dyadic_num_rows) {
                throw_or_abort("The ECCVM circuit size has exceeded the fixed upper bound! Fixed size: " +
                               std::to_string(ECCVM_FIXED_SIZE) + " actual size: " + std::to_string(dyadic_num_rows));
            }

            dyadic_num_rows = ECCVM_FIXED_SIZE;
            size_t unmasked_witness_size = dyadic_num_rows - NUM_DISABLED_ROWS_IN_SUMCHECK;

            for (auto& poly : get_to_be_shifted()) {
                poly = Polynomial{ /*memory size*/ dyadic_num_rows - 1,
                                   /*largest possible index*/ dyadic_num_rows,
                                   /* offset */ 1 };
            }
            // allocate polynomials; define lagrange and lookup read count polynomials
            for (auto& poly : get_all()) {
                if (poly.is_empty()) {
                    poly = Polynomial(dyadic_num_rows);
                }
            }
            lagrange_first.at(0) = 1;
            lagrange_second.at(1) = 1;
            lagrange_last.at(unmasked_witness_size - 1) = 1;
            for (size_t i = 0; i < point_table_read_counts[0].size(); ++i) {
                // Explanation of off-by-one offset:
                // When computing the WNAF slice for a point at point counter value `pc` and a round index `round`, the
                // row number that computes the slice can be derived. This row number is then mapped to the index of
                // `lookup_read_counts`. We do this mapping in `ecc_msm_relation`. We are off-by-one because we add an
                // empty row at the start of the WNAF columns that is not accounted for (index of lookup_read_counts
                // maps to the row in our WNAF columns that computes a slice for a given value of pc and round)
                lookup_read_counts_0.at(i + 1) = point_table_read_counts[0][i];
                lookup_read_counts_1.at(i + 1) = point_table_read_counts[1][i];
            }

            // compute polynomials for transcript columns
            parallel_for_range(transcript_rows.size(), [&](size_t start, size_t end) {
                for (size_t i = start; i < end; i++) {
                    transcript_accumulator_empty.set_if_valid_index(i, transcript_rows[i].accumulator_empty);
                    transcript_add.set_if_valid_index(i, transcript_rows[i].q_add);
                    transcript_mul.set_if_valid_index(i, transcript_rows[i].q_mul);
                    transcript_eq.set_if_valid_index(i, transcript_rows[i].q_eq);
                    transcript_reset_accumulator.set_if_valid_index(i, transcript_rows[i].q_reset_accumulator);
                    transcript_msm_transition.set_if_valid_index(i, transcript_rows[i].msm_transition);
                    transcript_pc.set_if_valid_index(i, transcript_rows[i].pc);
                    transcript_msm_count.set_if_valid_index(i, transcript_rows[i].msm_count);
                    transcript_Px.set_if_valid_index(i, transcript_rows[i].base_x);
                    transcript_Py.set_if_valid_index(i, transcript_rows[i].base_y);
                    transcript_z1.set_if_valid_index(i, transcript_rows[i].z1);
                    transcript_z2.set_if_valid_index(i, transcript_rows[i].z2);
                    transcript_z1zero.set_if_valid_index(i, transcript_rows[i].z1_zero);
                    transcript_z2zero.set_if_valid_index(i, transcript_rows[i].z2_zero);
                    transcript_op.set_if_valid_index(i, transcript_rows[i].opcode);
                    transcript_accumulator_x.set_if_valid_index(i, transcript_rows[i].accumulator_x);
                    transcript_accumulator_y.set_if_valid_index(i, transcript_rows[i].accumulator_y);
                    transcript_msm_x.set_if_valid_index(i, transcript_rows[i].msm_output_x);
                    transcript_msm_y.set_if_valid_index(i, transcript_rows[i].msm_output_y);
                    transcript_base_infinity.set_if_valid_index(i, transcript_rows[i].base_infinity);
                    transcript_base_x_inverse.set_if_valid_index(i, transcript_rows[i].base_x_inverse);
                    transcript_base_y_inverse.set_if_valid_index(i, transcript_rows[i].base_y_inverse);
                    transcript_add_x_equal.set_if_valid_index(i, transcript_rows[i].transcript_add_x_equal);
                    transcript_add_y_equal.set_if_valid_index(i, transcript_rows[i].transcript_add_y_equal);
                    transcript_add_lambda.set_if_valid_index(i, transcript_rows[i].transcript_add_lambda);
                    transcript_msm_intermediate_x.set_if_valid_index(i,
                                                                     transcript_rows[i].transcript_msm_intermediate_x);
                    transcript_msm_intermediate_y.set_if_valid_index(i,
                                                                     transcript_rows[i].transcript_msm_intermediate_y);
                    transcript_msm_infinity.set_if_valid_index(i, transcript_rows[i].transcript_msm_infinity);
                    transcript_msm_x_inverse.set_if_valid_index(i, transcript_rows[i].transcript_msm_x_inverse);
                    transcript_msm_count_zero_at_transition.set_if_valid_index(
                        i, transcript_rows[i].msm_count_zero_at_transition);
                    transcript_msm_count_at_transition_inverse.set_if_valid_index(
                        i, transcript_rows[i].msm_count_at_transition_inverse);
                }
            });

            // TODO(@zac-williamson) if final opcode resets accumulator, all subsequent "is_accumulator_empty" row
            // values must be 1. Ideally we find a way to tweak this so that empty rows that do nothing have column
            // values that are all zero (issue #2217)
            if (transcript_rows[transcript_rows.size() - 1].accumulator_empty) {
                for (size_t i = transcript_rows.size(); i < unmasked_witness_size; ++i) {
                    transcript_accumulator_empty.set_if_valid_index(i, 1);
                }
            }
            // in addition, unless the accumulator is reset, it contains the value from the previous row so this
            // must be propagated
            for (size_t i = transcript_rows.size(); i < unmasked_witness_size; ++i) {
                transcript_accumulator_x.set_if_valid_index(i, transcript_accumulator_x[i - 1]);
                transcript_accumulator_y.set_if_valid_index(i, transcript_accumulator_y[i - 1]);
            }

            parallel_for_range(point_table_rows.size(), [&](size_t start, size_t end) {
                for (size_t i = start; i < end; i++) {
                    // first row is always an empty row (to accommodate shifted polynomials which must have 0 as 1st
                    // coefficient). All other rows in the point_table_rows represent active wnaf gates (i.e.
                    // precompute_select = 1)
                    precompute_select.set_if_valid_index(i, (i != 0) ? 1 : 0);
                    precompute_pc.set_if_valid_index(i, point_table_rows[i].pc);
                    precompute_point_transition.set_if_valid_index(
                        i, static_cast<uint64_t>(point_table_rows[i].point_transition));
                    precompute_round.set_if_valid_index(i, point_table_rows[i].round);
                    precompute_scalar_sum.set_if_valid_index(i, point_table_rows[i].scalar_sum);
                    precompute_s1hi.set_if_valid_index(i, point_table_rows[i].s1);
                    precompute_s1lo.set_if_valid_index(i, point_table_rows[i].s2);
                    precompute_s2hi.set_if_valid_index(i, point_table_rows[i].s3);
                    precompute_s2lo.set_if_valid_index(i, point_table_rows[i].s4);
                    precompute_s3hi.set_if_valid_index(i, point_table_rows[i].s5);
                    precompute_s3lo.set_if_valid_index(i, point_table_rows[i].s6);
                    precompute_s4hi.set_if_valid_index(i, point_table_rows[i].s7);
                    precompute_s4lo.set_if_valid_index(i, point_table_rows[i].s8);
                    // If skew is active (i.e. we need to subtract a base point from the msm result),
                    // write `7` into rows.precompute_skew. `7`, in binary representation, equals `-1` when converted
                    // into WNAF form
                    precompute_skew.set_if_valid_index(i, point_table_rows[i].skew ? 7 : 0);
                    precompute_dx.set_if_valid_index(i, point_table_rows[i].precompute_double.x);
                    precompute_dy.set_if_valid_index(i, point_table_rows[i].precompute_double.y);
                    precompute_tx.set_if_valid_index(i, point_table_rows[i].precompute_accumulator.x);
                    precompute_ty.set_if_valid_index(i, point_table_rows[i].precompute_accumulator.y);
                }
            });

            // compute polynomials for the msm columns
            parallel_for_range(msm_rows.size(), [&](size_t start, size_t end) {
                for (size_t i = start; i < end; i++) {
                    msm_transition.set_if_valid_index(i, static_cast<int>(msm_rows[i].msm_transition));
                    msm_add.set_if_valid_index(i, static_cast<int>(msm_rows[i].q_add));
                    msm_double.set_if_valid_index(i, static_cast<int>(msm_rows[i].q_double));
                    msm_skew.set_if_valid_index(i, static_cast<int>(msm_rows[i].q_skew));
                    msm_accumulator_x.set_if_valid_index(i, msm_rows[i].accumulator_x);
                    msm_accumulator_y.set_if_valid_index(i, msm_rows[i].accumulator_y);
                    msm_pc.set_if_valid_index(i, msm_rows[i].pc);
                    msm_size_of_msm.set_if_valid_index(i, msm_rows[i].msm_size);
                    msm_count.set_if_valid_index(i, msm_rows[i].msm_count);
                    msm_round.set_if_valid_index(i, msm_rows[i].msm_round);
                    msm_add1.set_if_valid_index(i, static_cast<int>(msm_rows[i].add_state[0].add));
                    msm_add2.set_if_valid_index(i, static_cast<int>(msm_rows[i].add_state[1].add));
                    msm_add3.set_if_valid_index(i, static_cast<int>(msm_rows[i].add_state[2].add));
                    msm_add4.set_if_valid_index(i, static_cast<int>(msm_rows[i].add_state[3].add));
                    msm_x1.set_if_valid_index(i, msm_rows[i].add_state[0].point.x);
                    msm_y1.set_if_valid_index(i, msm_rows[i].add_state[0].point.y);
                    msm_x2.set_if_valid_index(i, msm_rows[i].add_state[1].point.x);
                    msm_y2.set_if_valid_index(i, msm_rows[i].add_state[1].point.y);
                    msm_x3.set_if_valid_index(i, msm_rows[i].add_state[2].point.x);
                    msm_y3.set_if_valid_index(i, msm_rows[i].add_state[2].point.y);
                    msm_x4.set_if_valid_index(i, msm_rows[i].add_state[3].point.x);
                    msm_y4.set_if_valid_index(i, msm_rows[i].add_state[3].point.y);
                    msm_collision_x1.set_if_valid_index(i, msm_rows[i].add_state[0].collision_inverse);
                    msm_collision_x2.set_if_valid_index(i, msm_rows[i].add_state[1].collision_inverse);
                    msm_collision_x3.set_if_valid_index(i, msm_rows[i].add_state[2].collision_inverse);
                    msm_collision_x4.set_if_valid_index(i, msm_rows[i].add_state[3].collision_inverse);
                    msm_lambda1.set_if_valid_index(i, msm_rows[i].add_state[0].lambda);
                    msm_lambda2.set_if_valid_index(i, msm_rows[i].add_state[1].lambda);
                    msm_lambda3.set_if_valid_index(i, msm_rows[i].add_state[2].lambda);
                    msm_lambda4.set_if_valid_index(i, msm_rows[i].add_state[3].lambda);
                    msm_slice1.set_if_valid_index(i, msm_rows[i].add_state[0].slice);
                    msm_slice2.set_if_valid_index(i, msm_rows[i].add_state[1].slice);
                    msm_slice3.set_if_valid_index(i, msm_rows[i].add_state[2].slice);
                    msm_slice4.set_if_valid_index(i, msm_rows[i].add_state[3].slice);
                }
            });
            this->set_shifted();
        }
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
     * @brief The proving key is responsible for storing the polynomials used by the prover.
     *
     */
    class ProvingKey {
      public:
        size_t circuit_size = ECCVM_FIXED_SIZE; // The circuit size is fixed for the ECCVM.
        size_t log_circuit_size = CONST_ECCVM_LOG_N;

        // Used to amortize the commitment time if the `fixed size` > `real_size`.
        size_t real_size = 0;

        ProverPolynomials polynomials; // storage for all polynomials evaluated by the prover
        CommitmentKey commitment_key;

        // Constructor for fixed size ProvingKey
        ProvingKey(const CircuitBuilder& builder)
            : real_size(builder.get_circuit_subgroup_size(builder.get_estimated_num_finalized_gates()))
            , polynomials(builder)
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
    class VerificationKey : public NativeVerificationKey_<PrecomputedEntities<Commitment>, Transcript> {
      public:
        bool operator==(const VerificationKey&) const = default;

        // IPA verification key requires one more point.
        VerifierCommitmentKey pcs_verification_key = VerifierCommitmentKey(ECCVM_FIXED_SIZE + 1);

        // Default construct the fixed VK that results from ECCVM_FIXED_SIZE
        VerificationKey()
            : NativeVerificationKey_(ECCVM_FIXED_SIZE, /*num_public_inputs=*/0)
        {
            this->pub_inputs_offset = 0;

            // Populate the commitments of the precomputed polynomials using the fixed VK data
            for (auto [vk_commitment, fixed_commitment] :
                 zip_view(this->get_all(), ECCVMFixedVKCommitments::get_all())) {
                vk_commitment = fixed_commitment;
            }
        }

        VerificationKey(const size_t circuit_size, const size_t num_public_inputs)
            : NativeVerificationKey_(circuit_size, num_public_inputs)
        {}

        VerificationKey(const std::shared_ptr<ProvingKey>& proving_key)
        {
            this->circuit_size = 1UL << CONST_ECCVM_LOG_N;
            this->log_circuit_size = CONST_ECCVM_LOG_N;
            this->num_public_inputs = 0;
            this->pub_inputs_offset = 0;

            for (auto [polynomial, commitment] :
                 zip_view(proving_key->polynomials.get_precomputed(), this->get_all())) {
                commitment = proving_key->commitment_key.commit(polynomial);
            }
        }

        /**
         * @brief Serialize verification key to field elements
         *
         * @return std::vector<FF>
         */
        std::vector<fr> to_field_elements() const override
        {
            using namespace bb::field_conversion;

            auto serialize_to_field_buffer = []<typename T>(const T& input, std::vector<fr>& buffer) {
                std::vector<fr> input_fields = convert_to_bn254_frs<T>(input);
                buffer.insert(buffer.end(), input_fields.begin(), input_fields.end());
            };

            std::vector<fr> elements;

            serialize_to_field_buffer(this->circuit_size, elements);
            serialize_to_field_buffer(this->num_public_inputs, elements);
            serialize_to_field_buffer(this->pub_inputs_offset, elements);

            for (const Commitment& commitment : this->get_all()) {
                serialize_to_field_buffer(commitment, elements);
            }

            return elements;
        }

        /**
         * @brief Adds the verification key hash to the transcript and returns the hash.
         * @details Needed to make sure the Origin Tag system works. See the base class function for
         * more details.
         *
         * @param domain_separator
         * @param transcript
         * @returns The hash of the verification key
         */
        fr add_hash_to_transcript([[maybe_unused]] const std::string& domain_separator,
                                  [[maybe_unused]] Transcript& transcript) const override
        {
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1466): Implement this function.
            throw_or_abort("Not implemented yet!");
        }

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1324): Remove `circuit_size` and `log_circuit_size`
        // from MSGPACK and the verification key.
        MSGPACK_FIELDS(circuit_size,
                       log_circuit_size,
                       num_public_inputs,
                       pub_inputs_offset,
                       lagrange_first,
                       lagrange_second,
                       lagrange_last);
    };

    /**
     * @brief A container for commitment labels.
     * @note It's debatable whether this should inherit from AllEntities. since most entries are not strictly
     * needed. It has, however, been useful during debugging to have these labels available.
     *
     */
    class CommitmentLabels : public AllEntities<std::string> {
      private:
        using Base = AllEntities<std::string>;

      public:
        CommitmentLabels()
            : AllEntities<std::string>()
        {
            Base::transcript_add = "TRANSCRIPT_ADD";
            Base::transcript_mul = "TRANSCRIPT_MUL";
            Base::transcript_eq = "TRANSCRIPT_EQ";
            Base::transcript_msm_transition = "TRANSCRIPT_MSM_TRANSITION";
            Base::transcript_pc = "TRANSCRIPT_PC";
            Base::transcript_msm_count = "TRANSCRIPT_MSM_COUNT";
            Base::transcript_Px = "TRANSCRIPT_PX";
            Base::transcript_Py = "TRANSCRIPT_PY";
            Base::transcript_z1 = "TRANSCRIPT_Z1";
            Base::transcript_z2 = "TRANSCRIPT_Z2";
            Base::transcript_z1zero = "TRANSCRIPT_Z1ZERO";
            Base::transcript_z2zero = "TRANSCRIPT_Z2ZERO";
            Base::transcript_op = "TRANSCRIPT_OP";
            Base::transcript_accumulator_x = "TRANSCRIPT_ACCUMULATOR_X";
            Base::transcript_accumulator_y = "TRANSCRIPT_ACCUMULATOR_Y";
            Base::transcript_msm_x = "TRANSCRIPT_MSM_X";
            Base::transcript_msm_y = "TRANSCRIPT_MSM_Y";
            Base::precompute_pc = "PRECOMPUTE_PC";
            Base::precompute_point_transition = "PRECOMPUTE_POINT_TRANSITION";
            Base::precompute_round = "PRECOMPUTE_ROUND";
            Base::precompute_scalar_sum = "PRECOMPUTE_SCALAR_SUM";
            Base::precompute_s1hi = "PRECOMPUTE_S1HI";
            Base::precompute_s1lo = "PRECOMPUTE_S1LO";
            Base::precompute_s2hi = "PRECOMPUTE_S2HI";
            Base::precompute_s2lo = "PRECOMPUTE_S2LO";
            Base::precompute_s3hi = "PRECOMPUTE_S3HI";
            Base::precompute_s3lo = "PRECOMPUTE_S3LO";
            Base::precompute_s4hi = "PRECOMPUTE_S4HI";
            Base::precompute_s4lo = "PRECOMPUTE_S4LO";
            Base::precompute_skew = "PRECOMPUTE_SKEW";
            Base::precompute_dx = "PRECOMPUTE_DX";
            Base::precompute_dy = "PRECOMPUTE_DY";
            Base::precompute_tx = "PRECOMPUTE_TX";
            Base::precompute_ty = "PRECOMPUTE_TY";
            Base::msm_transition = "MSM_TRANSITION";
            Base::msm_add = "MSM_ADD";
            Base::msm_double = "MSM_DOUBLE";
            Base::msm_skew = "MSM_SKEW";
            Base::msm_accumulator_x = "MSM_ACCUMULATOR_X";
            Base::msm_accumulator_y = "MSM_ACCUMULATOR_Y";
            Base::msm_pc = "MSM_PC";
            Base::msm_size_of_msm = "MSM_SIZE_OF_MSM";
            Base::msm_count = "MSM_COUNT";
            Base::msm_round = "MSM_ROUND";
            Base::msm_add1 = "MSM_ADD1";
            Base::msm_add2 = "MSM_ADD2";
            Base::msm_add3 = "MSM_ADD3";
            Base::msm_add4 = "MSM_ADD4";
            Base::msm_x1 = "MSM_X1";
            Base::msm_y1 = "MSM_Y1";
            Base::msm_x2 = "MSM_X2";
            Base::msm_y2 = "MSM_Y2";
            Base::msm_x3 = "MSM_X3";
            Base::msm_y3 = "MSM_Y3";
            Base::msm_x4 = "MSM_X4";
            Base::msm_y4 = "MSM_Y4";
            Base::msm_collision_x1 = "MSM_COLLISION_X1";
            Base::msm_collision_x2 = "MSM_COLLISION_X2";
            Base::msm_collision_x3 = "MSM_COLLISION_X3";
            Base::msm_collision_x4 = "MSM_COLLISION_X4";
            Base::msm_lambda1 = "MSM_LAMBDA1";
            Base::msm_lambda2 = "MSM_LAMBDA2";
            Base::msm_lambda3 = "MSM_LAMBDA3";
            Base::msm_lambda4 = "MSM_LAMBDA4";
            Base::msm_slice1 = "MSM_SLICE1";
            Base::msm_slice2 = "MSM_SLICE2";
            Base::msm_slice3 = "MSM_SLICE3";
            Base::msm_slice4 = "MSM_SLICE4";
            Base::transcript_accumulator_empty = "TRANSCRIPT_ACCUMULATOR_EMPTY";
            Base::transcript_reset_accumulator = "TRANSCRIPT_RESET_ACCUMULATOR";
            Base::precompute_select = "PRECOMPUTE_SELECT";
            Base::lookup_read_counts_0 = "LOOKUP_READ_COUNTS_0";
            Base::lookup_read_counts_1 = "LOOKUP_READ_COUNTS_1";
            Base::transcript_base_infinity = "TRANSCRIPT_BASE_INFINITY";
            Base::transcript_base_x_inverse = "TRANSCRIPT_BASE_X_INVERSE";
            Base::transcript_base_y_inverse = "TRANSCRIPT_BASE_Y_INVERSE";
            Base::transcript_add_x_equal = "TRANSCRIPT_ADD_X_EQUAL";
            Base::transcript_add_y_equal = "TRANSCRIPT_ADD_Y_EQUAL";
            Base::transcript_add_lambda = "TRANSCRIPT_ADD_LAMBDA";
            Base::transcript_msm_intermediate_x = "TRANSCRIPT_MSM_INTERMEDIATE_X";
            Base::transcript_msm_intermediate_y = "TRANSCRIPT_MSM_INTERMEDIATE_Y";
            Base::transcript_msm_infinity = "TRANSCRIPT_MSM_INFINITY";
            Base::transcript_msm_x_inverse = "TRANSCRIPT_MSM_X_INVERSE";
            Base::transcript_msm_count_zero_at_transition = "TRANSCRIPT_MSM_COUNT_ZERO_AT_TRANSITION";
            Base::transcript_msm_count_at_transition_inverse = "TRANSCRIPT_MSM_COUNT_AT_TRANSITION_INVERSE";
            Base::z_perm = "Z_PERM";
            Base::lookup_inverses = "LOOKUP_INVERSES";
            // The ones beginning with "__" are only used for debugging
            Base::lagrange_first = "__LAGRANGE_FIRST";
            Base::lagrange_second = "__LAGRANGE_SECOND";
            Base::lagrange_last = "__LAGRANGE_LAST";
        };
    };

    template <typename Commitment, typename VerificationKey>
    class VerifierCommitments_ : public AllEntities<Commitment> {
      public:
        VerifierCommitments_(const std::shared_ptr<VerificationKey>& verification_key)
        {
            this->lagrange_first = verification_key->lagrange_first;
            this->lagrange_second = verification_key->lagrange_second;
            this->lagrange_last = verification_key->lagrange_last;
        }
    };

    using VerifierCommitments = VerifierCommitments_<Commitment, VerificationKey>;

    /**
     * @brief Derived class that defines proof structure for ECCVM IPA proof, as well as supporting functions.
     *
     */
    class IPATranscript : public NativeTranscript {
      public:
        uint32_t ipa_poly_degree;
        std::vector<Commitment> ipa_l_comms;
        std::vector<Commitment> ipa_r_comms;
        Commitment ipa_G_0_eval;
        FF ipa_a_0_eval;

        IPATranscript() = default;

        void deserialize_full_transcript()
        {
            // take current proof and put them into the struct
            size_t num_frs_read = 0;
            ipa_poly_degree = NativeTranscript::template deserialize_from_buffer<uint32_t>(NativeTranscript::proof_data,
                                                                                           num_frs_read);

            for (size_t i = 0; i < CONST_ECCVM_LOG_N; ++i) {
                ipa_l_comms.emplace_back(NativeTranscript::template deserialize_from_buffer<Commitment>(
                    NativeTranscript::proof_data, num_frs_read));
                ipa_r_comms.emplace_back(NativeTranscript::template deserialize_from_buffer<Commitment>(
                    NativeTranscript::proof_data, num_frs_read));
            }
            ipa_G_0_eval = NativeTranscript::template deserialize_from_buffer<Commitment>(NativeTranscript::proof_data,
                                                                                          num_frs_read);
            ipa_a_0_eval =
                NativeTranscript::template deserialize_from_buffer<FF>(NativeTranscript::proof_data, num_frs_read);
        }

        void serialize_full_transcript()
        {
            size_t old_proof_length = NativeTranscript::proof_data.size();
            NativeTranscript::proof_data.clear();

            NativeTranscript::template serialize_to_buffer(ipa_poly_degree, NativeTranscript::proof_data);
            for (size_t i = 0; i < CONST_ECCVM_LOG_N; ++i) {
                NativeTranscript::template serialize_to_buffer(ipa_l_comms[i], NativeTranscript::proof_data);
                NativeTranscript::template serialize_to_buffer(ipa_r_comms[i], NativeTranscript::proof_data);
            }

            serialize_to_buffer(ipa_G_0_eval, proof_data);
            serialize_to_buffer(ipa_a_0_eval, proof_data);

            ASSERT(NativeTranscript::proof_data.size() == old_proof_length);
        }
    };
};

// NOLINTEND(cppcoreguidelines-avoid-const-or-ref-data-members)

} // namespace bb
