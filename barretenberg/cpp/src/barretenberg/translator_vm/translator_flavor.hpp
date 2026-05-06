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
#include "barretenberg/relations/relation_tuple_helpers.hpp"
#include "barretenberg/relations/translator_vm/translator_decomposition_relation.hpp"
#include "barretenberg/relations/translator_vm/translator_delta_range_constraint_relation.hpp"
#include "barretenberg/relations/translator_vm/translator_extra_relations.hpp"
#include "barretenberg/relations/translator_vm/translator_non_native_field_relation.hpp"
#include "barretenberg/relations/translator_vm/translator_permutation_relation.hpp"
#include "barretenberg/translator_vm/translator_circuit_builder.hpp"
#include "barretenberg/translator_vm/translator_fixed_vk.hpp"
#include "barretenberg/translator_vm/translator_selectors.hpp"

namespace bb {

#define DEFINE_ENTITY_DECL(name) DataType name;
#define DEFINE_ENTITY_REF(name) name,
#define DEFINE_ENTITY_LABEL(name) #name,
#define DEFINE_ENTITY_COUNT(name) +1

#define DEFINE_SHIFTED_ENTITY_DECL(name) DataType name##_shift;
#define DEFINE_SHIFTED_ENTITY_REF(name) name##_shift,
#define DEFINE_SHIFTED_ENTITY_LABEL(name) #name "_shift",

#define DEFINE_VIEW_FROM_LIST(method, LIST)                                                                            \
    [[nodiscard]] auto method()                                                                                        \
    {                                                                                                                  \
        return RefArray<std::remove_reference_t<DataType>, 0 LIST(DEFINE_ENTITY_COUNT)>{ LIST(DEFINE_ENTITY_REF) };    \
    }                                                                                                                  \
    [[nodiscard]] auto method() const                                                                                  \
    {                                                                                                                  \
        return RefArray<const std::remove_reference_t<DataType>, 0 LIST(DEFINE_ENTITY_COUNT)>{ LIST(                   \
            DEFINE_ENTITY_REF) };                                                                                      \
    }

#define DEFINE_SHIFTED_VIEW_FROM_LIST(method, LIST)                                                                    \
    [[nodiscard]] auto method()                                                                                        \
    {                                                                                                                  \
        return RefArray<std::remove_reference_t<DataType>, 0 LIST(DEFINE_ENTITY_COUNT)>{ LIST(                         \
            DEFINE_SHIFTED_ENTITY_REF) };                                                                              \
    }                                                                                                                  \
    [[nodiscard]] auto method() const                                                                                  \
    {                                                                                                                  \
        return RefArray<const std::remove_reference_t<DataType>, 0 LIST(DEFINE_ENTITY_COUNT)>{ LIST(                   \
            DEFINE_SHIFTED_ENTITY_REF) };                                                                              \
    }

// Generate a flat RefArray view that mixes entities named directly (from UNSHIFTED_LIST) with entities
// named with the `_shift` suffix (from SHIFTED_LIST). Used for views like get_all / get_full_circuit_entities
// that span both unshifted and shifted entities.
#define DEFINE_MIXED_VIEW_FROM_LIST(method, UNSHIFTED_LIST, SHIFTED_LIST)                                              \
    [[nodiscard]] auto method()                                                                                        \
    {                                                                                                                  \
        return RefArray<std::remove_reference_t<DataType>,                                                             \
                        0 UNSHIFTED_LIST(DEFINE_ENTITY_COUNT) SHIFTED_LIST(DEFINE_ENTITY_COUNT)>{ UNSHIFTED_LIST(      \
            DEFINE_ENTITY_REF) SHIFTED_LIST(DEFINE_SHIFTED_ENTITY_REF) };                                              \
    }                                                                                                                  \
    [[nodiscard]] auto method() const                                                                                  \
    {                                                                                                                  \
        return RefArray<const std::remove_reference_t<DataType>,                                                       \
                        0 UNSHIFTED_LIST(DEFINE_ENTITY_COUNT) SHIFTED_LIST(DEFINE_ENTITY_COUNT)>{ UNSHIFTED_LIST(      \
            DEFINE_ENTITY_REF) SHIFTED_LIST(DEFINE_SHIFTED_ENTITY_REF) };                                              \
    }

#define DEFINE_FIELDS_FROM_LIST(DataType, LIST) LIST(DEFINE_ENTITY_DECL)
#define DEFINE_SHIFTED_FIELDS_FROM_LIST(DataType, LIST) LIST(DEFINE_SHIFTED_ENTITY_DECL)

#define LIST_SIZE(LIST) (0 LIST(DEFINE_ENTITY_COUNT))

#define PRECOMPUTED_COLUMNS(M)                                                                                         \
    M(ordered_extra_range_constraints_numerator)                                                                       \
    M(lagrange_first)                                                                                                  \
    M(lagrange_last)                                                                                                   \
    M(lagrange_odd_in_minicircuit)                                                                                     \
    M(lagrange_even_in_minicircuit)                                                                                    \
    M(lagrange_result_row)                                                                                             \
    M(lagrange_last_in_minicircuit)                                                                                    \
    M(lagrange_masking)                                                                                                \
    M(lagrange_mini_masking)                                                                                           \
    M(lagrange_real_last)                                                                                              \
    M(lagrange_ordered_masking)

#define VK_COLUMNS(M) M(ordered_extra_range_constraints_numerator)

#define CONCATENATED_COLUMNS(M)                                                                                        \
    M(concatenated_range_constraints_0)                                                                                \
    M(concatenated_range_constraints_1)                                                                                \
    M(concatenated_range_constraints_2)                                                                                \
    M(concatenated_range_constraints_3)                                                                                \
    M(concatenated_non_range)

#define OP_QUEUE_SHIFT_SOURCE_COLUMNS(M)                                                                               \
    M(x_lo_y_hi)                                                                                                       \
    M(x_hi_z_1)                                                                                                        \
    M(y_lo_z_2)

#define ORDERED_RANGE_COLUMNS(M)                                                                                       \
    M(ordered_range_constraints_0)                                                                                     \
    M(ordered_range_constraints_1)                                                                                     \
    M(ordered_range_constraints_2)                                                                                     \
    M(ordered_range_constraints_3)                                                                                     \
    M(ordered_range_constraints_4)

#define OP_QUEUE_WIRE_COLUMNS(M) M(op)

#define GRAND_PRODUCT_COLUMNS(M) M(z_perm)

// PCS column lists — each derived view textually contains the shared PCS_SHIFT_SOURCE_COLUMNS
// (and CONCATENATED_COLUMNS where applicable). The "every shift source is also opened
// unshifted" invariant is therefore structural: any entity added to PCS_SHIFT_SOURCE_COLUMNS
// flows automatically into both PCS_UNSHIFTED_COLUMNS and PCS_REPEATED_COLUMNS.

// Polynomials whose unshifted commitment is registered in BOTH PCS batches because their relations read
// them at row i AND row i+1 (op-queue split wires via the decomposition relation; ordered/grand-product
// via their permutation/grand-product structure). These do NOT include concatenated polys (whose
// evaluations are reconstructed from minicircuit-wire evals rather than committed and sent directly).
#define PCS_SHIFT_SOURCE_COLUMNS(M)                                                                                    \
    OP_QUEUE_SHIFT_SOURCE_COLUMNS(M)                                                                                   \
    ORDERED_RANGE_COLUMNS(M)                                                                                           \
    GRAND_PRODUCT_COLUMNS(M)

// All polynomials registered in the shifted PCS batch (= every shift source plus the concatenated polys).
// 14 entries: op_queue_split(3) + ordered(5) + z_perm(1) + concat(5).
#define PCS_REPEATED_COLUMNS(M)                                                                                        \
    PCS_SHIFT_SOURCE_COLUMNS(M)                                                                                        \
    CONCATENATED_COLUMNS(M)

// All unshifted PCS entities except the concatenated polys (whose evaluations the verifier reconstructs
// from minicircuit-wire evals rather than reading from the proof). Used as the unshifted-named prefix of
// get_full_circuit_entities. 12 entries: masking(1) + vk(1) + op(1) + shift_source(9).
#define PCS_UNSHIFTED_EXCLUDING_CONCAT_COLUMNS(M)                                                                      \
    MASKING_COLUMNS(M)                                                                                                 \
    VK_COLUMNS(M)                                                                                                      \
    OP_QUEUE_WIRE_COLUMNS(M)                                                                                           \
    PCS_SHIFT_SOURCE_COLUMNS(M)

// All unshifted PCS entities (excludes computable precomputed selectors). 17 entries: the prefix above
// plus concatenated(5). Contains PCS_REPEATED_COLUMNS as a contiguous suffix, structurally
// enforcing "to-be-shifted ⊆ unshifted".
#define PCS_UNSHIFTED_COLUMNS(M)                                                                                       \
    PCS_UNSHIFTED_EXCLUDING_CONCAT_COLUMNS(M)                                                                          \
    CONCATENATED_COLUMNS(M)

// All polynomials whose shift-by-1 enters Sumcheck. Layout:
// op_queue_split(3) + minicircuit(77) + ordered(5) + grand_product(1) = 86.
#define ALL_TO_BE_SHIFTED_COLUMNS(M)                                                                                   \
    OP_QUEUE_SHIFT_SOURCE_COLUMNS(M)                                                                                   \
    NON_OP_QUEUE_SHIFT_SOURCE_COLUMNS(M)                                                                               \
    ORDERED_RANGE_COLUMNS(M)                                                                                           \
    GRAND_PRODUCT_COLUMNS(M)

// Unshifted half of get_all: masking + precomputed + witness, contiguous prefix in the AllEntities layout.
#define NON_SHIFTED_COLUMNS(M)                                                                                         \
    MASKING_COLUMNS(M)                                                                                                 \
    PRECOMPUTED_COLUMNS(M)                                                                                             \
    WITNESS_COLUMNS(M)

// All wire columns (op-queue + minicircuit). Layout: op(1) + op_queue_split(3) + minicircuit(77) = 81.
#define WIRES_COLUMNS(M)                                                                                               \
    OP_QUEUE_WIRE_COLUMNS(M)                                                                                           \
    OP_QUEUE_SHIFT_SOURCE_COLUMNS(M)                                                                                   \
    NON_OP_QUEUE_SHIFT_SOURCE_COLUMNS(M)

// Concatenated + ordered range (committed in the wire-round). Layout: concat(5) + ordered(5) = 10.
#define NON_OPQUEUE_WIRES_AND_ORDERED_RANGE_COLUMNS(M)                                                                 \
    CONCATENATED_COLUMNS(M)                                                                                            \
    ORDERED_RANGE_COLUMNS(M)

#define MASKING_COLUMNS(M) M(gemini_masking_poly)

// ---- Concat-group chunks ----
// Each chunk lists the minicircuit wires that fold into one concatenated polynomial. The "non_range"
// chunk lists 13 real wires; the runtime padder zeros it out to CONCATENATION_GROUP_SIZE.
#define CONCAT_GROUP_NON_RANGE(M)                                                                                      \
    M(p_x_low_limbs)                                                                                                   \
    M(p_x_high_limbs)                                                                                                  \
    M(p_y_low_limbs)                                                                                                   \
    M(p_y_high_limbs)                                                                                                  \
    M(z_low_limbs)                                                                                                     \
    M(z_high_limbs)                                                                                                    \
    M(accumulators_binary_limbs_0)                                                                                     \
    M(accumulators_binary_limbs_1)                                                                                     \
    M(accumulators_binary_limbs_2)                                                                                     \
    M(accumulators_binary_limbs_3)                                                                                     \
    M(quotient_low_binary_limbs)                                                                                       \
    M(quotient_high_binary_limbs)                                                                                      \
    M(relation_wide_limbs)

#define CONCAT_GROUP_RANGE_0(M)                                                                                        \
    M(p_x_low_limbs_range_constraint_0)                                                                                \
    M(p_x_low_limbs_range_constraint_1)                                                                                \
    M(p_x_low_limbs_range_constraint_2)                                                                                \
    M(p_x_low_limbs_range_constraint_3)                                                                                \
    M(p_x_low_limbs_range_constraint_4)                                                                                \
    M(p_x_low_limbs_range_constraint_tail)                                                                             \
    M(p_x_high_limbs_range_constraint_0)                                                                               \
    M(p_x_high_limbs_range_constraint_1)                                                                               \
    M(p_x_high_limbs_range_constraint_2)                                                                               \
    M(p_x_high_limbs_range_constraint_3)                                                                               \
    M(p_x_high_limbs_range_constraint_4)                                                                               \
    M(p_x_high_limbs_range_constraint_tail)                                                                            \
    M(p_y_low_limbs_range_constraint_0)                                                                                \
    M(p_y_low_limbs_range_constraint_1)                                                                                \
    M(p_y_low_limbs_range_constraint_2)                                                                                \
    M(p_y_low_limbs_range_constraint_3)

#define CONCAT_GROUP_RANGE_1(M)                                                                                        \
    M(p_y_low_limbs_range_constraint_4)                                                                                \
    M(p_y_low_limbs_range_constraint_tail)                                                                             \
    M(p_y_high_limbs_range_constraint_0)                                                                               \
    M(p_y_high_limbs_range_constraint_1)                                                                               \
    M(p_y_high_limbs_range_constraint_2)                                                                               \
    M(p_y_high_limbs_range_constraint_3)                                                                               \
    M(p_y_high_limbs_range_constraint_4)                                                                               \
    M(p_y_high_limbs_range_constraint_tail)                                                                            \
    M(z_low_limbs_range_constraint_0)                                                                                  \
    M(z_low_limbs_range_constraint_1)                                                                                  \
    M(z_low_limbs_range_constraint_2)                                                                                  \
    M(z_low_limbs_range_constraint_3)                                                                                  \
    M(z_low_limbs_range_constraint_4)                                                                                  \
    M(z_low_limbs_range_constraint_tail)                                                                               \
    M(z_high_limbs_range_constraint_0)                                                                                 \
    M(z_high_limbs_range_constraint_1)

#define CONCAT_GROUP_RANGE_2(M)                                                                                        \
    M(z_high_limbs_range_constraint_2)                                                                                 \
    M(z_high_limbs_range_constraint_3)                                                                                 \
    M(z_high_limbs_range_constraint_4)                                                                                 \
    M(z_high_limbs_range_constraint_tail)                                                                              \
    M(accumulator_low_limbs_range_constraint_0)                                                                        \
    M(accumulator_low_limbs_range_constraint_1)                                                                        \
    M(accumulator_low_limbs_range_constraint_2)                                                                        \
    M(accumulator_low_limbs_range_constraint_3)                                                                        \
    M(accumulator_low_limbs_range_constraint_4)                                                                        \
    M(accumulator_low_limbs_range_constraint_tail)                                                                     \
    M(accumulator_high_limbs_range_constraint_0)                                                                       \
    M(accumulator_high_limbs_range_constraint_1)                                                                       \
    M(accumulator_high_limbs_range_constraint_2)                                                                       \
    M(accumulator_high_limbs_range_constraint_3)                                                                       \
    M(accumulator_high_limbs_range_constraint_4)                                                                       \
    M(accumulator_high_limbs_range_constraint_tail)

#define CONCAT_GROUP_RANGE_3(M)                                                                                        \
    M(quotient_low_limbs_range_constraint_0)                                                                           \
    M(quotient_low_limbs_range_constraint_1)                                                                           \
    M(quotient_low_limbs_range_constraint_2)                                                                           \
    M(quotient_low_limbs_range_constraint_3)                                                                           \
    M(quotient_low_limbs_range_constraint_4)                                                                           \
    M(quotient_low_limbs_range_constraint_tail)                                                                        \
    M(quotient_high_limbs_range_constraint_0)                                                                          \
    M(quotient_high_limbs_range_constraint_1)                                                                          \
    M(quotient_high_limbs_range_constraint_2)                                                                          \
    M(quotient_high_limbs_range_constraint_3)                                                                          \
    M(quotient_high_limbs_range_constraint_4)                                                                          \
    M(quotient_high_limbs_range_constraint_tail)                                                                       \
    M(relation_wide_limbs_range_constraint_0)                                                                          \
    M(relation_wide_limbs_range_constraint_1)                                                                          \
    M(relation_wide_limbs_range_constraint_2)                                                                          \
    M(relation_wide_limbs_range_constraint_3)

// Single source of truth: each row pairs a concatenated polynomial name with its chunk macro.
// Iteration order matches the output order of get_groups_to_be_concatenated().
#define CONCAT_MAP(ROW)                                                                                                \
    ROW(concatenated_range_constraints_0, CONCAT_GROUP_RANGE_0)                                                        \
    ROW(concatenated_range_constraints_1, CONCAT_GROUP_RANGE_1)                                                        \
    ROW(concatenated_range_constraints_2, CONCAT_GROUP_RANGE_2)                                                        \
    ROW(concatenated_range_constraints_3, CONCAT_GROUP_RANGE_3)                                                        \
    ROW(concatenated_non_range, CONCAT_GROUP_NON_RANGE)

// Flat list of all 77 minicircuit wires. Order: non-range first, then range groups in order — matches
// the historical AllEntities field layout.
#define NON_OP_QUEUE_SHIFT_SOURCE_COLUMNS(M)                                                                           \
    CONCAT_GROUP_NON_RANGE(M)                                                                                          \
    CONCAT_GROUP_RANGE_0(M)                                                                                            \
    CONCAT_GROUP_RANGE_1(M)                                                                                            \
    CONCAT_GROUP_RANGE_2(M)                                                                                            \
    CONCAT_GROUP_RANGE_3(M)

#define WITNESS_COLUMNS(M)                                                                                             \
    OP_QUEUE_WIRE_COLUMNS(M)                                                                                           \
    OP_QUEUE_SHIFT_SOURCE_COLUMNS(M)                                                                                   \
    NON_OP_QUEUE_SHIFT_SOURCE_COLUMNS(M)                                                                               \
    ORDERED_RANGE_COLUMNS(M)                                                                                           \
    GRAND_PRODUCT_COLUMNS(M)                                                                                           \
    CONCATENATED_COLUMNS(M)

#define SHIFTED_COLUMNS(M)                                                                                             \
    OP_QUEUE_SHIFT_SOURCE_COLUMNS(M)                                                                                   \
    NON_OP_QUEUE_SHIFT_SOURCE_COLUMNS(M)                                                                               \
    ORDERED_RANGE_COLUMNS(M)                                                                                           \
    GRAND_PRODUCT_COLUMNS(M)

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
    // Translator has no disabled rows at the top of the trace.
    static constexpr size_t TRACE_OFFSET = 0;
    // Translator proof size and its recursive verifier circuit are genuinely fixed, hence no padding is needed.
    static constexpr bool USE_PADDING = false;
    // Important: these constants cannot be arbitrarily changed - please consult with a member of the Crypto team if
    // they become too small.

    // The number of entities added for ZK (gemini_masking_poly)
    static constexpr size_t NUM_MASKING_POLYNOMIALS = 1;

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

    // Index at which random coefficients start (for zk) within Translator trace.
    // The first 2 rows are zeros for polynomial shiftability (one op's worth of rows).
    static constexpr size_t RANDOMNESS_START = 2;

    // The bitness of the range constraint
    static constexpr size_t MICRO_LIMB_BITS = CircuitBuilder::MICRO_LIMB_BITS;

    // Number of bits in a binary limb
    // This is not a configurable value. Relations are sepcifically designed for it to be 68
    static constexpr size_t NUM_LIMB_BITS = CircuitBuilder::NUM_LIMB_BITS;

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

    template <typename DataType_> class AllEntities {
      public:
        using DataType = DataType_;
        DEFINE_FIELDS_FROM_LIST(DataType, MASKING_COLUMNS)
        DEFINE_FIELDS_FROM_LIST(DataType, PRECOMPUTED_COLUMNS)
        DEFINE_FIELDS_FROM_LIST(DataType, WITNESS_COLUMNS)
        DEFINE_SHIFTED_FIELDS_FROM_LIST(DataType, SHIFTED_COLUMNS)

        // ---- Public views consumed by the prover/verifier and external flavor framework ----
        DEFINE_VIEW_FROM_LIST(get_precomputed, PRECOMPUTED_COLUMNS)
        DEFINE_VIEW_FROM_LIST(get_witness, WITNESS_COLUMNS)
        DEFINE_VIEW_FROM_LIST(get_concatenated, CONCATENATED_COLUMNS)
        DEFINE_VIEW_FROM_LIST(get_op_queue_split_wires, OP_QUEUE_SHIFT_SOURCE_COLUMNS)
        DEFINE_VIEW_FROM_LIST(get_minicircuit_wires, NON_OP_QUEUE_SHIFT_SOURCE_COLUMNS)
        DEFINE_VIEW_FROM_LIST(get_ordered_range_constraints, ORDERED_RANGE_COLUMNS)
        DEFINE_VIEW_FROM_LIST(get_wires, WIRES_COLUMNS)
        DEFINE_VIEW_FROM_LIST(get_all_to_be_shifted, ALL_TO_BE_SHIFTED_COLUMNS)
        DEFINE_VIEW_FROM_LIST(get_non_opqueue_wires_and_ordered_range_constraints,
                              NON_OPQUEUE_WIRES_AND_ORDERED_RANGE_COLUMNS)

        DEFINE_SHIFTED_VIEW_FROM_LIST(get_shifted, SHIFTED_COLUMNS)
        DEFINE_SHIFTED_VIEW_FROM_LIST(get_minicircuit_wires_shifted, NON_OP_QUEUE_SHIFT_SOURCE_COLUMNS)
        DEFINE_SHIFTED_VIEW_FROM_LIST(get_pcs_shifted, PCS_SHIFT_SOURCE_COLUMNS)

        /**
         * @brief All unshifted polynomials for PCS (excludes computable precomputed).
         * @details masking(1) + vk_precomputed(1) + op_queue_wire(1) + op_queue_split(3) + ordered(5)
         *          + grand_product(1) + concat(5) = 17. The trailing 14 entries (PCS_REPEATED_COLUMNS)
         *          are also registered as shift sources — see get_pcs_to_be_shifted.
         */
        DEFINE_VIEW_FROM_LIST(get_pcs_unshifted, PCS_UNSHIFTED_COLUMNS)

        /**
         * @brief All to-be-shifted polynomials for PCS. Each entity here also lives in get_pcs_unshifted
         *        (PCS_REPEATED_COLUMNS is a contiguous suffix of PCS_UNSHIFTED_COLUMNS).
         */
        DEFINE_VIEW_FROM_LIST(get_pcs_to_be_shifted, PCS_REPEATED_COLUMNS)

        DEFINE_MIXED_VIEW_FROM_LIST(get_all, NON_SHIFTED_COLUMNS, SHIFTED_COLUMNS)
        constexpr std::size_t size() const { return get_all().size(); }
        static const std::vector<std::string>& get_labels()
        {
            static const auto labels =
                concatenate(std::vector<std::string>{ NON_SHIFTED_COLUMNS(DEFINE_ENTITY_LABEL) },
                            std::vector<std::string>{ SHIFTED_COLUMNS(DEFINE_SHIFTED_ENTITY_LABEL) });
            return labels;
        }

        /**
         * @brief Full-circuit entities sent in the proof (excludes computable precomputed, minicircuit wires,
         * and concatenated polys whose evals are reconstructed from wire evals).
         * @details PCS_UNSHIFTED_EXCLUDING_CONCAT_COLUMNS (12, unshifted-named) + PCS_SHIFT_SOURCE_COLUMNS
         *          (9, `_shift`-suffixed) = 21.
         */
        DEFINE_MIXED_VIEW_FROM_LIST(get_full_circuit_entities,
                                    PCS_UNSHIFTED_EXCLUDING_CONCAT_COLUMNS,
                                    PCS_SHIFT_SOURCE_COLUMNS)

        // Build the partition driven by CONCAT_MAP. Each row of the map declares a concatenated
        // polynomial together with the chunk macro listing its constituent minicircuit wires. The chunks
        // are emitted directly into a RefVector and zero-padded to CONCATENATION_GROUP_SIZE.
        std::vector<RefVector<DataType>> get_groups_to_be_concatenated()
        {
            static DataType zero_value = DataType(0);
            std::vector<RefVector<DataType>> groups;
#define PUSH_REF(name) group.push_back(name);
#define PUSH_GROUP(concat_name, group_macro)                                                                           \
    {                                                                                                                  \
        RefVector<DataType> group;                                                                                     \
        group_macro(PUSH_REF) while (group.size() < CONCATENATION_GROUP_SIZE) group.push_back(zero_value);             \
        groups.emplace_back(std::move(group));                                                                         \
    }
            CONCAT_MAP(PUSH_GROUP)
#undef PUSH_REF
#undef PUSH_GROUP
            return groups;
        }
        std::vector<RefVector<DataType>> get_groups_to_be_concatenated_shifted()
        {
            static DataType zero_value = DataType(0);
            std::vector<RefVector<DataType>> groups;
#define PUSH_SHIFT_REF(name) group.push_back(name##_shift);
#define PUSH_SHIFT_GROUP(concat_name, group_macro)                                                                     \
    {                                                                                                                  \
        RefVector<DataType> group;                                                                                     \
        group_macro(PUSH_SHIFT_REF) while (group.size() < CONCATENATION_GROUP_SIZE) group.push_back(zero_value);       \
        groups.emplace_back(std::move(group));                                                                         \
    }
            CONCAT_MAP(PUSH_SHIFT_GROUP)
#undef PUSH_SHIFT_REF
#undef PUSH_SHIFT_GROUP
            return groups;
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

    // ========================================
    // Entity counts (from entity class sizes)
    // ========================================
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = LIST_SIZE(PRECOMPUTED_COLUMNS);
    static constexpr size_t NUM_OP_QUEUE_WIRES_NOT_SHIFT_SOURCE = LIST_SIZE(OP_QUEUE_WIRE_COLUMNS);
    static constexpr size_t NUM_ORDERED_RANGE = LIST_SIZE(ORDERED_RANGE_COLUMNS);

    static constexpr size_t NUM_WITNESS_ENTITIES = LIST_SIZE(WITNESS_COLUMNS);

    static constexpr size_t NUM_SHIFTED_ENTITIES = LIST_SIZE(SHIFTED_COLUMNS);

    static constexpr size_t NUM_ALL_ENTITIES =
        NUM_MASKING_POLYNOMIALS + NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES + NUM_SHIFTED_ENTITIES;

    // All precomputed selectors except ordered_extra_range_constraints_numerator are computable
    static constexpr size_t NUM_COMPUTABLE_PRECOMPUTED = NUM_PRECOMPUTED_ENTITIES - 1;

    // Minicircuit wires: NonRangeMain + RangeConstraint (the non-op-queue wires that get shifted)
    static constexpr size_t NUM_MINICIRCUIT_WIRES = LIST_SIZE(NON_OP_QUEUE_SHIFT_SOURCE_COLUMNS);
    // 77 unshifted + 77 shifted minicircuit wire evaluations are sent mid-sumcheck
    static constexpr size_t NUM_MINICIRCUIT_EVALUATIONS = 2 * NUM_MINICIRCUIT_WIRES;

    // Number of evaluations sent in proof (all minus computable precomputed minus reconstructed concat evals)
    static constexpr size_t NUM_SENT_EVALUATIONS =
        NUM_ALL_ENTITIES - NUM_COMPUTABLE_PRECOMPUTED - NUM_CONCATENATED_POLYS;
    static constexpr size_t NUM_FULL_CIRCUIT_EVALUATIONS = NUM_SENT_EVALUATIONS - NUM_MINICIRCUIT_EVALUATIONS;

    // Total number of minicircuit wires across all concatenation groups
    static constexpr size_t NUM_CONCATENATED_WIRES = NUM_CONCATENATED_POLYS * CONCATENATION_GROUP_SIZE;
    static_assert(LIST_SIZE(CONCATENATED_COLUMNS) == NUM_CONCATENATED_POLYS);
    static_assert(LIST_SIZE(CONCAT_GROUP_RANGE_0) == CONCATENATION_GROUP_SIZE);
    static_assert(LIST_SIZE(CONCAT_GROUP_RANGE_1) == CONCATENATION_GROUP_SIZE);
    static_assert(LIST_SIZE(CONCAT_GROUP_RANGE_2) == CONCATENATION_GROUP_SIZE);
    static_assert(LIST_SIZE(CONCAT_GROUP_RANGE_3) == CONCATENATION_GROUP_SIZE);
    static_assert(LIST_SIZE(CONCAT_GROUP_NON_RANGE) <= CONCATENATION_GROUP_SIZE,
                  "Non-range concat group must fit in one concatenation group (zero-padded at runtime)");

    // PCS batch sizes derived directly from the column-list macros. Op-queue to-be-shifted wires
    // (x_lo_y_hi, x_hi_z_1, y_lo_z_2) are registered in BOTH the unshifted and shifted PCS batches
    // because the decomposition relation reads them in both forms.
    static constexpr size_t NUM_TO_BE_SHIFTED = LIST_SIZE(PCS_SHIFT_SOURCE_COLUMNS);
    static constexpr size_t NUM_PCS_UNSHIFTED = LIST_SIZE(PCS_UNSHIFTED_COLUMNS);
    static constexpr size_t NUM_PCS_TO_BE_SHIFTED = LIST_SIZE(PCS_REPEATED_COLUMNS);

    // Indices for partitioning AllEntities
    static constexpr size_t TO_BE_SHIFTED_WITNESSES_START =
        NUM_PRECOMPUTED_ENTITIES + NUM_OP_QUEUE_WIRES_NOT_SHIFT_SOURCE;
    static constexpr size_t SHIFTED_WITNESSES_START = NUM_SHIFTED_ENTITIES + TO_BE_SHIFTED_WITNESSES_START;

    // Commitments sent in wire round: concatenated + ordered range constraints
    static constexpr size_t NUM_COMMITMENTS_IN_PROOF = NUM_CONCATENATED_POLYS + NUM_ORDERED_RANGE;

    // A container to be fed to ShpleminiVerifier to avoid redundant scalar muls.
    // Identifies commitments that appear in both the unshifted and shifted batches:
    //   Unshifted batch: masking(1) + ordered_extra(1) + op(1) + op_queue_tbs(3) + ordered(5) + z_perm(1) + concat(5)
    //                  = 17
    //   Shifted batch:   op_queue(3) + ordered(5) + z_perm(1) + concat(5) = 14
    // Range 1: op_queue_tbs(3) + ordered(5) + z_perm(1) = 9 (contiguous in both batches)
    //          stored indices 2..10 (unshifted) ↔ 16..24 (shifted)
    // Range 2: concatenated(5) — stored indices 11..15 (unshifted) ↔ 25..29 (shifted)
    // (Stored indices are 0-based after ZK offset; offset=2 accounts for Q_commitment + gemini_masking_poly)
    static constexpr size_t PCS_REPEATED_NON_CONCAT_START = LIST_SIZE(VK_COLUMNS) + NUM_OP_QUEUE_WIRES_NOT_SHIFT_SOURCE;
    static constexpr size_t PCS_REPEATED_CONCATENATED_START = PCS_REPEATED_NON_CONCAT_START + NUM_TO_BE_SHIFTED;
    static constexpr size_t PCS_REPEATED_NON_CONCAT_SHIFTED_START =
        PCS_REPEATED_NON_CONCAT_START + NUM_PCS_TO_BE_SHIFTED;
    static constexpr size_t PCS_REPEATED_CONCATENATED_SHIFTED_START =
        PCS_REPEATED_NON_CONCAT_SHIFTED_START + NUM_TO_BE_SHIFTED;
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS =
        RepeatedCommitmentsData(PCS_REPEATED_NON_CONCAT_START,
                                PCS_REPEATED_NON_CONCAT_SHIFTED_START,
                                NUM_TO_BE_SHIFTED,
                                PCS_REPEATED_CONCATENATED_START,
                                PCS_REPEATED_CONCATENATED_SHIFTED_START,
                                NUM_CONCATENATED_POLYS);

    static constexpr size_t PROOF_LENGTH =
        /* 1. Gemini masking poly commitment */ (num_frs_comm) +
        /* 2. Wire commitments: concatenated + ordered */
        (NUM_COMMITMENTS_IN_PROOF * num_frs_comm) +
        /* 3. Z_PERM commitment */ (num_frs_comm) +
        /* 4. Libra concatenation commitment */ (num_frs_comm) +
        /* 5. Libra sum */ (num_frs_fr) +
        /* 6. CONST_TRANSLATOR_LOG_N sumcheck univariates */
        (CONST_TRANSLATOR_LOG_N * BATCHED_RELATION_PARTIAL_LENGTH * num_frs_fr) +
        /* 7. sumcheck evaluations (computable precomputed and concat evals excluded) */
        (NUM_SENT_EVALUATIONS * num_frs_fr) +
        /* 8. Libra claimed evaluation */ (num_frs_fr) +
        /* 9. Libra grand sum commitment */ (num_frs_comm) +
        /* 10. Libra quotient commitment */ (num_frs_comm) +
        /* 11. CONST_TRANSLATOR_LOG_N - 1 Gemini Fold commitments */
        ((CONST_TRANSLATOR_LOG_N - 1) * num_frs_comm) +
        /* 12. CONST_TRANSLATOR_LOG_N Gemini a evaluations */
        (CONST_TRANSLATOR_LOG_N * num_frs_fr) +
        /* 13. NUM_SMALL_IPA_EVALUATIONS libra evals */ (NUM_SMALL_IPA_EVALUATIONS * num_frs_fr) +
        /* 14. Shplonk Q commitment */ (num_frs_comm) +
        /* 15. KZG W commitment */ (num_frs_comm);

    // Proof length when using committed sumcheck: each round sends a commitment + 2 scalar evaluations
    // instead of BATCHED_RELATION_PARTIAL_LENGTH scalars.
    static constexpr size_t COMMITTED_SUMCHECK_PROOF_LENGTH =
        PROOF_LENGTH +
        CONST_TRANSLATOR_LOG_N * (num_frs_comm + 2 * num_frs_fr - BATCHED_RELATION_PARTIAL_LENGTH * num_frs_fr);

    // ===== Static assert to ensure a valid trace can be proven ======

    // The number of "steps" inserted in ordered range constraint polynomials to ensure that the
    // DeltaRangeConstraintRelation can always be satisfied if the polynomial is within the appropriate range.
    static constexpr size_t SORTED_STEPS_COUNT = ((1 << MICRO_LIMB_BITS) / SORT_STEP) + 1;

    // The number of masking values in the overflow columns used for the ordered range constraint
    static constexpr size_t MASKING_OVERFLOW_COLUMN =
        MAX_RANDOM_VALUES_PER_ORDERED * (NUM_ORDERED_RANGE - 1) / NUM_ORDERED_RANGE;

    static_assert(SORTED_STEPS_COUNT * NUM_ORDERED_RANGE + MASKING_OVERFLOW_COLUMN <
                      MINI_CIRCUIT_SIZE * CONCATENATION_GROUP_SIZE,
                  "Translator circuit is too small for defined number of steps "
                  "(TranslatorDeltaRangeConstraintRelation). ");

    // ================================================================

    /**
     * @brief Compute the computable precomputed selector evaluations and write them into AllEntities.
     */
    template <typename FFType>
    static void compute_computable_precomputed(AllEntities<FFType>& evals, std::span<const FFType> challenge);

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
                                            const std::array<FFType, NUM_MINICIRCUIT_EVALUATIONS>& mid);

    /**
     * @brief Verifier: complete the claimed evaluations for the sumcheck relation check.
     * @details After set_full_circuit_evaluations and set_minicircuit_evaluations have placed raw values,
     * this method:
     *   1. Computes the 10 structured precomputed selector evaluations from the challenge.
     *   2. Multiplies the 154 minicircuit wire entries by L_0(u_top) = Π(1 - u_i) for the top 4
     *      challenges, converting mid-sumcheck values to full evaluations at the sumcheck point.
     */
    template <typename FFType>
    static void complete_claimed_evaluations(AllEntities<FFType>& evals, std::span<const FFType> challenge);

    /**
     * @brief Verifier: complete full-circuit evaluations from received array and challenge.
     * @details Assumes minicircuit wire evaluations have already been placed into evals
     * via set_minicircuit_evaluations. This method:
     *   1. Sets the received full-circuit evaluations (excluding concatenated poly evals).
     *   2. Completes claimed evaluations (computable precomputed selectors + L_0 scaling).
     *   3. Reconstructs the 5 concatenated polynomial evaluations from individual wire evaluations.
     */
    template <typename FFType>
    static void complete_full_circuit_evaluations(AllEntities<FFType>& evals,
                                                  const std::array<FFType, NUM_FULL_CIRCUIT_EVALUATIONS>& full_circuit,
                                                  std::span<const FFType> challenge);

    /**
     * @brief Reconstruct concatenated polynomial evaluations from individual wire evaluations
     * using the Lagrange basis over the top log2(CONCATENATION_GROUP_SIZE) challenges.
     * @details The concatenated polynomial F(X) is laid out in CONCATENATION_GROUP_SIZE sequential blocks.
     * Given evaluations of the individual wires f_j(u) at the sumcheck challenge u, the evaluation of F(u)
     * is reconstructed as: F(u) = [1/L_0(u_top)] * Σ_j L_j(u_top) * f_j(u), where L_j are the Lagrange
     * basis polynomials over the top challenges and L_0 is the "padding" factor.
     *
     * Wire evaluations are read directly from `evals` via CONCAT_MAP — the chunk per concat
     * polynomial is named by the map and accessed by field name (with `_shift` suffix when Shifted=true),
     * so no intermediate `std::vector<RefVector>` is materialised.
     *
     * @tparam Shifted If true, accumulate from `name##_shift` fields instead of `name`.
     * @param evals AllEntities holding wire evaluations.
     * @param challenge The full sumcheck challenge vector.
     * @return Array of 5 reconstructed concatenated evaluations.
     */
    template <bool Shifted, typename FFType>
    static std::array<FFType, NUM_CONCATENATED_POLYS> reconstruct_concatenated_evaluations(
        AllEntities<FFType>& evals, std::span<const FFType> challenge);

    /**
     * @brief Prover: extract the full-circuit evaluations via get_full_circuit_entities().
     */
    template <typename FFType>
    static std::array<FFType, NUM_FULL_CIRCUIT_EVALUATIONS> get_full_circuit_evaluations(AllEntities<FFType>& evals);

    /**
     * @brief Verifier: write the full-circuit evaluations back via get_full_circuit_entities().
     */
    template <typename FFType>
    static void set_full_circuit_evaluations(AllEntities<FFType>& evals,
                                             const std::array<FFType, NUM_FULL_CIRCUIT_EVALUATIONS>& full_circuit);

    /**
     * @brief A container for the prover polynomials handles.
     */
    class ProverPolynomials : public AllEntities<Polynomial> {
      public:
        /**
         * @brief ProverPolynomials constructor
         * @details Initializes wire polynomials efficiently to be only minicircuit size..
         */
        ProverPolynomials();
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
        [[nodiscard]] AllValues get_row(size_t row_idx) const;
        // Set all shifted polynomials based on their to-be-shifted counterpart.
        // Uses get_all_to_be_shifted() (86 entries for Sumcheck), not get_pcs_to_be_shifted() (14 entries for PCS).
        void set_shifted();
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

        ProvingKey() = default;
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
        DEFINE_FIELDS_FROM_LIST(DataType, VK_COLUMNS)
        DEFINE_VIEW_FROM_LIST(get_all, VK_COLUMNS)
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
     * @details Only labels accessed by the prover/verifier are set: the 5 concatenated polynomials,
     * 5 ordered range constraints, and z_perm. All other AllEntities fields remain empty strings.
     */
    class CommitmentLabels : public AllEntities<std::string> {
      public:
        CommitmentLabels();
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
    using VerifierCommitments = AllEntities<Commitment>;
};

} // namespace bb
