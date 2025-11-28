// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/flavor/relation_definitions.hpp"
#include "barretenberg/flavor/repeated_commitments_data.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/delta_range_constraint_relation.hpp"
#include "barretenberg/relations/ecc_op_queue_relation.hpp"
#include "barretenberg/relations/non_native_field_relation.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/relations/ultra_arithmetic_relation.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

/**
 * @brief A lightweight ZK flavor for BigfieldTranslator.
 *
 * @details Uses MegaCircuitBuilder but without lookups, databus, poseidon2, or memory relations.
 * This significantly reduces the number of polynomials and proof size.
 *
 * Relations: Arithmetic, Permutation, DeltaRange, NNF, EccOpQueue
 *
 * Polynomials removed from Mega:
 * - Precomputed: q_busread, q_lookup, q_memory, q_poseidon2_*, table_1-4, databus_id
 * - Witness: lookup_*, calldata/secondary_calldata/return_data + counts/tags/inverses
 */
class LightZKFlavor {
  public:
    using CircuitBuilder = MegaCircuitBuilder;
    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using GroupElement = Curve::Element;
    using Commitment = Curve::AffineElement;
    using PCS = KZG<Curve>;
    using Polynomial = bb::Polynomial<FF>;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<Curve>;
    using TraceBlocks = MegaExecutionTraceBlocks;
    using Transcript = NativeTranscript;

    // BigfieldTranslator circuit finalizes to ~301K gates -> 2^19 dyadic
    static constexpr size_t VIRTUAL_LOG_N = 19;
    static constexpr bool USE_SHORT_MONOMIALS = true;
    static constexpr bool HasZK = true;
    static constexpr bool USE_PADDING = true;
    static constexpr size_t NUM_WIRES = CircuitBuilder::NUM_WIRES;

    // Entity counts (significantly reduced from Mega's 60/31/24)
    // PrecomputedEntities: 20 (selectors + sigmas + ids + lagranges, no q_elliptic)
    // WitnessEntities: 9 (4 wires + z_perm + 4 ecc_op_wires)
    // MaskingEntities: 1 (gemini_masking_poly for ZK)
    // ShiftedEntities: 5 (w_l, w_r, w_o, w_4, z_perm shifts)
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = 20;
    static constexpr size_t NUM_WITNESS_ENTITIES = 9;
    static constexpr size_t NUM_MASKING_ENTITIES = 1;
    static constexpr size_t NUM_SHIFTED_ENTITIES = 5;
    static constexpr size_t NUM_ALL_ENTITIES =
        NUM_MASKING_ENTITIES + NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES + NUM_SHIFTED_ENTITIES;
    static constexpr size_t NUM_FOLDED_ENTITIES = NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES =
        NUM_MASKING_ENTITIES + NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES;

    // Empty repeated commitments - no optimization for shifted polynomials
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = RepeatedCommitmentsData();

    // Relations - no lookups, databus, poseidon2, memory, or elliptic
    template <typename FF>
    using Relations_ = std::tuple<bb::ArithmeticRelation<FF>,
                                  bb::UltraPermutationRelation<FF>,
                                  bb::DeltaRangeConstraintRelation<FF>,
                                  bb::NonNativeFieldRelation<FF>,
                                  bb::EccOpQueueRelation<FF>>;
    using Relations = Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    // For ZK flavors, BATCHED_RELATION_PARTIAL_LENGTH must equal Curve::LIBRA_UNIVARIATES_LENGTH
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = Curve::LIBRA_UNIVARIATES_LENGTH;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;
    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    using SubrelationSeparator = FF;

    static constexpr size_t num_frs_comm = FrCodec::calc_num_fields<Commitment>();
    static constexpr size_t num_frs_fr = FrCodec::calc_num_fields<FF>();

    static constexpr size_t PROOF_LENGTH_WITHOUT_PUB_INPUTS(size_t virtual_log_n = VIRTUAL_LOG_N)
    {
        return /* 1. NUM_WITNESS_ENTITIES commitments */ (NUM_WITNESS_ENTITIES * num_frs_comm) +
               /* 2. Libra concatenation commitment*/ (num_frs_comm) +
               /* 3. Libra sum */ (num_frs_fr) +
               /* 4. virtual_log_n sumcheck univariates */
               (virtual_log_n * BATCHED_RELATION_PARTIAL_LENGTH * num_frs_fr) +
               /* 5. NUM_ALL_ENTITIES sumcheck evaluations*/ (NUM_ALL_ENTITIES * num_frs_fr) +
               /* 6. Libra claimed evaluation */ (num_frs_fr) +
               /* 7. Libra grand sum commitment */ (num_frs_comm) +
               /* 8. Libra quotient commitment */ (num_frs_comm) +
               /* 9. virtual_log_n - 1 Gemini Fold commitments */
               ((virtual_log_n - 1) * num_frs_comm) +
               /* 10. virtual_log_n Gemini a evaluations */
               (virtual_log_n * num_frs_fr) +
               /* 11. NUM_SMALL_IPA_EVALUATIONS libra evals */ (NUM_SMALL_IPA_EVALUATIONS * num_frs_fr) +
               /* 12. Shplonk Q commitment */ (num_frs_comm) +
               /* 13. KZG W commitment */ (num_frs_comm);
    }

    static constexpr bool has_zero_row = true;

    /**
     * @brief Precomputed polynomials
     */
    template <typename DataType_> class PrecomputedEntities {
      public:
        bool operator==(const PrecomputedEntities&) const = default;
        using DataType = DataType_;
        DEFINE_FLAVOR_MEMBERS(DataType,
                              q_m,             // column 0
                              q_c,             // column 1
                              q_l,             // column 2
                              q_r,             // column 3
                              q_o,             // column 4
                              q_4,             // column 5
                              q_arith,         // column 6
                              q_delta_range,   // column 7
                              q_nnf,           // column 8
                              sigma_1,         // column 9
                              sigma_2,         // column 10
                              sigma_3,         // column 11
                              sigma_4,         // column 12
                              id_1,            // column 13
                              id_2,            // column 14
                              id_3,            // column 15
                              id_4,            // column 16
                              lagrange_first,  // column 17
                              lagrange_last,   // column 18
                              lagrange_ecc_op) // column 19

        auto get_non_gate_selectors() { return RefArray{ q_m, q_c, q_l, q_r, q_o, q_4 }; };
        auto get_gate_selectors() { return RefArray{ q_arith, q_delta_range, q_nnf }; }
        auto get_selectors() { return concatenate(get_non_gate_selectors(), get_gate_selectors()); }

        auto get_sigmas() { return RefArray{ sigma_1, sigma_2, sigma_3, sigma_4 }; };
        auto get_ids() { return RefArray{ id_1, id_2, id_3, id_4 }; };
        auto get_tables() { return RefArray<DataType, 0>{}; };
    };

    template <typename DataType> class WireEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType, w_l, w_r, w_o, w_4);
    };

    template <typename DataType> class DerivedEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType, z_perm, ecc_op_wire_1, ecc_op_wire_2, ecc_op_wire_3, ecc_op_wire_4);
        auto get_to_be_shifted() { return RefArray{ z_perm }; };
    };

    template <typename DataType> class MaskingEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType, gemini_masking_poly)
    };

    template <typename DataType>
    class WitnessEntities_ : public WireEntities<DataType>, public DerivedEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(WireEntities<DataType>, DerivedEntities<DataType>)

        auto get_wires() { return WireEntities<DataType>::get_all(); };
        auto get_ecc_op_wires()
        {
            return RefArray{ this->ecc_op_wire_1, this->ecc_op_wire_2, this->ecc_op_wire_3, this->ecc_op_wire_4 };
        }
        auto get_databus_entities() { return RefArray<DataType, 0>{}; }
        auto get_databus_inverses() { return RefArray<DataType, 0>{}; }
        auto get_to_be_shifted()
        {
            return concatenate(WireEntities<DataType>::get_all(), DerivedEntities<DataType>::get_to_be_shifted());
        }

        MSGPACK_FIELDS(this->w_l,
                       this->w_r,
                       this->w_o,
                       this->w_4,
                       this->z_perm,
                       this->ecc_op_wire_1,
                       this->ecc_op_wire_2,
                       this->ecc_op_wire_3,
                       this->ecc_op_wire_4);
    };

    template <typename DataType> using WitnessEntities = WitnessEntities_<DataType>;

    template <typename DataType> class ShiftedEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType, w_l_shift, w_r_shift, w_o_shift, w_4_shift, z_perm_shift)
    };

    template <typename DataType>
    class AllEntities_ : public MaskingEntities<DataType>,
                         public PrecomputedEntities<DataType>,
                         public WitnessEntities_<DataType>,
                         public ShiftedEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(MaskingEntities<DataType>,
                                PrecomputedEntities<DataType>,
                                WitnessEntities_<DataType>,
                                ShiftedEntities<DataType>)

        auto get_unshifted()
        {
            return concatenate(MaskingEntities<DataType>::get_all(),
                               PrecomputedEntities<DataType>::get_all(),
                               WitnessEntities_<DataType>::get_all());
        };
        auto get_precomputed() { return PrecomputedEntities<DataType>::get_all(); }
        auto get_witness() { return WitnessEntities_<DataType>::get_all(); };
        auto get_witness() const { return WitnessEntities_<DataType>::get_all(); };
        auto get_shifted() { return ShiftedEntities<DataType>::get_all(); };
    };

    template <typename DataType> using AllEntities = AllEntities_<DataType>;

    class AllValues : public AllEntities_<FF> {
      public:
        using Base = AllEntities_<FF>;
        using Base::Base;
    };

    class ProverPolynomials : public AllEntities_<Polynomial> {
      public:
        ProverPolynomials() = default;
        ProverPolynomials(size_t circuit_size)
        {
            for (auto& poly : this->get_to_be_shifted()) {
                poly = Polynomial{ circuit_size - 1, circuit_size, 1 };
            }
            for (auto& poly : this->get_unshifted()) {
                if (poly.is_empty()) {
                    poly = Polynomial{ circuit_size, circuit_size };
                }
            }
            set_shifted();
        }
        ProverPolynomials& operator=(const ProverPolynomials&) = delete;
        ProverPolynomials(const ProverPolynomials&) = delete;
        ProverPolynomials(ProverPolynomials&&) noexcept = default;
        ProverPolynomials& operator=(ProverPolynomials&&) noexcept = default;
        ~ProverPolynomials() = default;

        [[nodiscard]] size_t get_polynomial_size() const { return this->q_c.size(); }
        [[nodiscard]] AllValues get_row(size_t row_idx) const
        {
            AllValues result;
            for (auto [result_field, polynomial] : zip_view(result.get_all(), this->get_all())) {
                result_field = polynomial[row_idx];
            }
            return result;
        }

        [[nodiscard]] AllValues get_row_for_permutation_arg(size_t row_idx)
        {
            AllValues result;
            for (auto [result_field, polynomial] : zip_view(result.get_sigmas(), this->get_sigmas())) {
                result_field = polynomial[row_idx];
            }
            for (auto [result_field, polynomial] : zip_view(result.get_ids(), this->get_ids())) {
                result_field = polynomial[row_idx];
            }
            for (auto [result_field, polynomial] : zip_view(result.get_wires(), this->get_wires())) {
                result_field = polynomial[row_idx];
            }
            return result;
        }

        void set_shifted()
        {
            for (auto [shifted, to_be_shifted] : zip_view(this->get_shifted(), this->get_to_be_shifted())) {
                shifted = to_be_shifted.shifted();
            }
        }

        void increase_polynomials_virtual_size(const size_t size_in)
        {
            for (auto& polynomial : this->get_all()) {
                polynomial.increase_virtual_size(size_in);
            }
        }
    };

    using PrecomputedData = PrecomputedData_<Polynomial, NUM_PRECOMPUTED_ENTITIES>;

    class VerificationKey : public NativeVerificationKey_<PrecomputedEntities<Commitment>, Transcript> {
      public:
        VerificationKey() = default;
        VerificationKey(const size_t circuit_size, const size_t num_public_inputs)
            : NativeVerificationKey_(circuit_size, num_public_inputs)
        {}

        VerificationKey(const VerificationKey& vk) = default;

        void set_metadata(const MetaData& metadata)
        {
            this->log_circuit_size = numeric::get_msb(metadata.dyadic_size);
            this->num_public_inputs = metadata.num_public_inputs;
            this->pub_inputs_offset = metadata.pub_inputs_offset;
        }

        VerificationKey(const PrecomputedData& precomputed)
        {
            set_metadata(precomputed.metadata);

            CommitmentKey commitment_key{ precomputed.metadata.dyadic_size };
            for (auto [polynomial, commitment] : zip_view(precomputed.polynomials, this->get_all())) {
                commitment = commitment_key.commit(polynomial);
            }
        }
    };

    class PartiallyEvaluatedMultivariates : public AllEntities_<Polynomial> {
      public:
        PartiallyEvaluatedMultivariates() = default;
        PartiallyEvaluatedMultivariates(const size_t circuit_size)
        {
            for (auto& poly : this->get_all()) {
                poly = Polynomial(circuit_size / 2);
            }
        }
        PartiallyEvaluatedMultivariates(const ProverPolynomials& full_polynomials, size_t circuit_size)
        {
            for (auto [poly, full_poly] : zip_view(this->get_all(), full_polynomials.get_all())) {
                // After the initial sumcheck round, the new size is CEIL(size/2).
                size_t desired_size = full_poly.end_index() / 2 + full_poly.end_index() % 2;
                poly = Polynomial(desired_size, circuit_size / 2);
            }
        }
    };

    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;

    using WitnessCommitments = WitnessEntities_<Commitment>;
    using CommitmentLabels = AllEntities_<std::string>;

    class VerifierCommitments : public AllEntities_<Commitment> {
      public:
        VerifierCommitments() = default;
        VerifierCommitments(const std::shared_ptr<VerificationKey>& verification_key,
                            const std::optional<WitnessCommitments>& witness_commitments = std::nullopt)
        {
            // Copy the precomputed polynomial commitments into this
            for (auto [precomputed, precomputed_in] : zip_view(this->get_precomputed(), verification_key->get_all())) {
                precomputed = precomputed_in;
            }

            // If provided, copy the witness polynomial commitments into this
            if (witness_commitments.has_value()) {
                for (auto [witness, witness_in] :
                     zip_view(this->get_witness(), witness_commitments.value().get_all())) {
                    witness = witness_in;
                }

                // Set shifted commitments
                this->w_l_shift = witness_commitments->w_l;
                this->w_r_shift = witness_commitments->w_r;
                this->w_o_shift = witness_commitments->w_o;
                this->w_4_shift = witness_commitments->w_4;
                this->z_perm_shift = witness_commitments->z_perm;
            }
        }
    };
};

} // namespace bb
