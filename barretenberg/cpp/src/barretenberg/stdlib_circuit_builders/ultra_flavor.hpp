#pragma once
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/plonk_honk_shared/library/grand_product_delta.hpp"
#include "barretenberg/plonk_honk_shared/library/grand_product_library.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/auxiliary_relation.hpp"
#include "barretenberg/relations/delta_range_constraint_relation.hpp"
#include "barretenberg/relations/elliptic_relation.hpp"
#include "barretenberg/relations/logderiv_lookup_relation.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/relations/poseidon2_external_relation.hpp"
#include "barretenberg/relations/poseidon2_internal_relation.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/ultra_arithmetic_relation.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

class UltraFlavor {
  public:
    using CircuitBuilder = UltraCircuitBuilder;
    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using GroupElement = Curve::Element;
    using Commitment = Curve::AffineElement;
    using PCS = KZG<Curve>;
    using Polynomial = bb::Polynomial<FF>;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<Curve>;

    // Indicates that this flavor runs with non-ZK Sumcheck.
    static constexpr bool HasZK = false;
    static constexpr size_t NUM_WIRES = CircuitBuilder::NUM_WIRES;
    // The number of multivariate polynomials on which a sumcheck prover sumcheck operates (including shifts). We often
    // need containers of this size to hold related data, so we choose a name more agnostic than `NUM_POLYNOMIALS`.
    static constexpr size_t NUM_ALL_ENTITIES = 44;
    // The number of polynomials precomputed to describe a circuit and to aid a prover in constructing a satisfying
    // assignment of witnesses. We again choose a neutral name.
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = 27;
    // The total number of witness entities not including shifts.
    static constexpr size_t NUM_WITNESS_ENTITIES = 8;
    // The total number of witnesses including shifts and derived entities.
    static constexpr size_t NUM_ALL_WITNESS_ENTITIES = 13;
    // Total number of folded polynomials, which is just all polynomials except the shifts
    static constexpr size_t NUM_FOLDED_ENTITIES = NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES;

    using GrandProductRelations = std::tuple<bb::UltraPermutationRelation<FF>>;
    // define the tuple of Relations that comprise the Sumcheck relation
    // Note: made generic for use in MegaRecursive.
    template <typename FF>

    using Relations_ = std::tuple<bb::UltraArithmeticRelation<FF>,
                                  bb::UltraPermutationRelation<FF>,
                                  bb::DeltaRangeConstraintRelation<FF>,
                                  bb::EllipticRelation<FF>,
                                  bb::AuxiliaryRelation<FF>,
                                  bb::LogDerivLookupRelation<FF>,
                                  bb::Poseidon2ExternalRelation<FF>,
                                  bb::Poseidon2InternalRelation<FF>>;

    using Relations = Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    static_assert(MAX_PARTIAL_RELATION_LENGTH == 7);
    static constexpr size_t MAX_TOTAL_RELATION_LENGTH = compute_max_total_relation_length<Relations>();
    static_assert(MAX_TOTAL_RELATION_LENGTH == 11);
    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    // For instances of this flavour, used in folding, we need a unique sumcheck batching challenge for each
    // subrelation. This is because using powers of alpha would increase the degree of Protogalaxy polynomial $G$ (the
    // combiner) too much.
    using RelationSeparator = std::array<FF, NUM_SUBRELATIONS - 1>;

    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t BATCHED_RELATION_TOTAL_LENGTH = MAX_TOTAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    template <size_t NUM_INSTANCES>
    using ProtogalaxyTupleOfTuplesOfUnivariates =
        decltype(create_protogalaxy_tuple_of_tuples_of_univariates<Relations, NUM_INSTANCES>());
    template <size_t NUM_INSTANCES>
    using OptimisedProtogalaxyTupleOfTuplesOfUnivariates =
        decltype(create_protogalaxy_tuple_of_tuples_of_univariates<Relations,
                                                                   NUM_INSTANCES,
                                                                   /*optimised=*/true>());
    using SumcheckTupleOfTuplesOfUnivariates = decltype(create_sumcheck_tuple_of_tuples_of_univariates<Relations>());
    using TupleOfArraysOfValues = decltype(create_tuple_of_arrays_of_values<Relations>());

    // Whether or not the first row of the execution trace is reserved for 0s to enable shifts
    static constexpr bool has_zero_row = true;

    static constexpr bool is_decider = true;

    /**
     * @brief A base class labelling precomputed entities and (ordered) subsets of interest.
     * @details Used to build the proving key and verification key.
     */
    template <typename DataType_> class PrecomputedEntities : public PrecomputedEntitiesBase {
      public:
        using DataType = DataType_;
        DEFINE_FLAVOR_MEMBERS(DataType,
                              q_m,                  // column 0
                              q_c,                  // column 1
                              q_l,                  // column 2
                              q_r,                  // column 3
                              q_o,                  // column 4
                              q_4,                  // column 5
                              q_arith,              // column 6
                              q_delta_range,        // column 7
                              q_elliptic,           // column 8
                              q_aux,                // column 9
                              q_lookup,             // column 10
                              q_poseidon2_external, // column 11
                              q_poseidon2_internal, // column 12
                              sigma_1,              // column 13
                              sigma_2,              // column 14
                              sigma_3,              // column 15
                              sigma_4,              // column 16
                              id_1,                 // column 17
                              id_2,                 // column 18
                              id_3,                 // column 19
                              id_4,                 // column 20
                              table_1,              // column 21
                              table_2,              // column 22
                              table_3,              // column 23
                              table_4,              // column 24
                              lagrange_first,       // column 25
                              lagrange_last)        // column 26

        static constexpr CircuitType CIRCUIT_TYPE = CircuitBuilder::CIRCUIT_TYPE;

        auto get_selectors()
        {
            return RefArray{ q_m,
                             q_c,
                             q_l,
                             q_r,
                             q_o,
                             q_4,
                             q_arith,
                             q_delta_range,
                             q_elliptic,
                             q_aux,
                             q_lookup,
                             q_poseidon2_external,
                             q_poseidon2_internal };
        };
        auto get_sigma_polynomials() { return RefArray{ sigma_1, sigma_2, sigma_3, sigma_4 }; };
        auto get_id_polynomials() { return RefArray{ id_1, id_2, id_3, id_4 }; };
        auto get_table_polynomials() { return RefArray{ table_1, table_2, table_3, table_4 }; };
    };

    /**
     * @brief Container for all witness polynomials used/constructed by the prover.
     * @details Shifts are not included here since they do not occupy their own memory.
     */
    template <typename DataType> class WitnessEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              w_l,                // column 0
                              w_r,                // column 1
                              w_o,                // column 2
                              w_4,                // column 3
                              z_perm,             // column 4
                              lookup_inverses,    // column 5
                              lookup_read_counts, // column 6
                              lookup_read_tags)   // column 7

        auto get_wires() { return RefArray{ w_l, w_r, w_o, w_4 }; };
        auto get_to_be_shifted() { return RefArray{ z_perm }; };

        MSGPACK_FIELDS(w_l, w_r, w_o, w_4, z_perm, lookup_inverses, lookup_read_counts, lookup_read_tags);
    };

    /**
     * @brief Class for ShiftedWitnessEntities, containing only shifted witness polynomials.
     */
    template <typename DataType> class ShiftedWitnessEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              w_l_shift,    // column 0
                              w_r_shift,    // column 1
                              w_o_shift,    // column 2
                              w_4_shift,    // column 3
                              z_perm_shift) // column 4

        auto get_shifted_witnesses() { return RefArray{ w_l_shift, w_r_shift, w_o_shift, w_4_shift, z_perm_shift }; };
    };

    /**
     * @brief Class for ShiftedEntities, containing shifted witness and table polynomials.
     */
    template <typename DataType> class ShiftedTables {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              table_1_shift, // column 0
                              table_2_shift, // column 1
                              table_3_shift, // column 2
                              table_4_shift  // column 3
        )
    };

    /**
     * @brief Class for ShiftedEntities, containing shifted witness and table polynomials.
     */
    template <typename DataType>
    class ShiftedEntities : public ShiftedTables<DataType>, public ShiftedWitnessEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(ShiftedTables<DataType>, ShiftedWitnessEntities<DataType>)

        auto get_shifted_witnesses() { return ShiftedWitnessEntities<DataType>::get_all(); };
        auto get_shifted_tables() { return ShiftedTables<DataType>::get_all(); };
    };

    /**
     * @brief A base class labelling all entities (for instance, all of the polynomials used by the prover during
     * sumcheck) in this Honk variant along with particular subsets of interest
     * @details Used to build containers for: the prover's polynomial during sumcheck; the sumcheck's folded
     * polynomials; the univariates consturcted during during sumcheck; the evaluations produced by sumcheck.
     *
     * Symbolically we have: AllEntities = PrecomputedEntities + WitnessEntities + "ShiftedEntities". It could be
     * implemented as such, but we have this now.
     */
    template <typename DataType>
    class AllEntities : public PrecomputedEntities<DataType>,
                        public WitnessEntities<DataType>,
                        public ShiftedEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(PrecomputedEntities<DataType>, WitnessEntities<DataType>, ShiftedEntities<DataType>)

        auto get_wires() { return WitnessEntities<DataType>::get_wires(); };
        auto get_selectors() { return PrecomputedEntities<DataType>::get_selectors(); }
        auto get_sigmas() { return PrecomputedEntities<DataType>::get_sigma_polynomials(); };
        auto get_ids() { return PrecomputedEntities<DataType>::get_id_polynomials(); };
        auto get_tables() { return PrecomputedEntities<DataType>::get_table_polynomials(); };
        auto get_unshifted()
        {
            return concatenate(PrecomputedEntities<DataType>::get_all(), WitnessEntities<DataType>::get_all());
        };
        auto get_precomputed() { return PrecomputedEntities<DataType>::get_all(); }
        auto get_witness() { return WitnessEntities<DataType>::get_all(); };
        auto get_to_be_shifted()
        {
            return concatenate(PrecomputedEntities<DataType>::get_table_polynomials(),
                               WitnessEntities<DataType>::get_wires(),
                               WitnessEntities<DataType>::get_to_be_shifted());
        };

        auto get_shifted() { return ShiftedEntities<DataType>::get_all(); };
        // getter for shifted witnesses
        auto get_shifted_witnesses() { return ShiftedEntities<DataType>::get_shifted_witnesses(); };
        // getter for shifted tables
        auto get_shifted_tables() { return ShiftedEntities<DataType>::get_shifted_tables(); };
        // getter for all witnesses including shifted ones
        auto get_all_witnesses()
        {
            return concatenate(WitnessEntities<DataType>::get_all(),
                               ShiftedEntities<DataType>::get_shifted_witnesses());
        };
        // getter for the complement of all witnesses inside all entities
        auto get_non_witnesses()
        {
            return concatenate(PrecomputedEntities<DataType>::get_all(),
                               ShiftedEntities<DataType>::get_shifted_tables());
        };
    };

  public:
    /**
     * @brief A field element for each entity of the flavor. These entities represent the prover polynomials
     * evaluated at one point.
     */
    class AllValues : public AllEntities<FF> {
      public:
        using Base = AllEntities<FF>;
        using Base::Base;
    };

    /**
     * @brief A container for polynomials handles.
     */
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/966): use inheritance
    class ProverPolynomials : public AllEntities<Polynomial> {
      public:
        // Define all operations as default, except copy construction/assignment
        ProverPolynomials() = default;
        ProverPolynomials(size_t circuit_size)
        { // Initialize all unshifted polynomials to the zero polynomial and initialize the
          // shifted polys
            ZoneScopedN("creating empty prover polys");
            for (auto& poly : get_unshifted()) {
                poly = Polynomial{ circuit_size };
            }
            set_shifted();
        }
        ProverPolynomials& operator=(const ProverPolynomials&) = delete;
        ProverPolynomials(const ProverPolynomials& o) = delete;
        ProverPolynomials(ProverPolynomials&& o) noexcept = default;
        ProverPolynomials& operator=(ProverPolynomials&& o) noexcept = default;
        ~ProverPolynomials() = default;
        [[nodiscard]] size_t get_polynomial_size() const { return q_c.size(); }
        [[nodiscard]] AllValues get_row(const size_t row_idx) const
        {
            AllValues result;
            for (auto [result_field, polynomial] : zip_view(result.get_all(), get_all())) {
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
        using Base = ProvingKey_<FF, CommitmentKey>;

        ProvingKey() = default;
        ProvingKey(const size_t circuit_size,
                   const size_t num_public_inputs,
                   std::shared_ptr<CommitmentKey> commitment_key = nullptr)
            : Base(circuit_size, num_public_inputs, std::move(commitment_key))
            , polynomials(circuit_size){};

        std::vector<uint32_t> memory_read_records;
        std::vector<uint32_t> memory_write_records;
        ProverPolynomials polynomials; // storage for all polynomials evaluated by the prover

        /**
         * @brief Add RAM/ROM memory records to the fourth wire polynomial
         *
         * @details This operation must be performed after the first three wires have been
         * committed to, hence the dependence on the `eta` challenge.
         *
         * @tparam Flavor
         * @param eta challenge produced after commitment to first three wire polynomials
         */
        void add_ram_rom_memory_records_to_wire_4(const FF& eta, const FF& eta_two, const FF& eta_three)
        {
            // The memory record values are computed at the indicated indices as
            // w4 = w3 * eta^3 + w2 * eta^2 + w1 * eta + read_write_flag;
            // (See the Auxiliary relation for details)
            auto wires = polynomials.get_wires();

            // Compute read record values
            for (const auto& gate_idx : memory_read_records) {
                wires[3][gate_idx] += wires[2][gate_idx] * eta_three;
                wires[3][gate_idx] += wires[1][gate_idx] * eta_two;
                wires[3][gate_idx] += wires[0][gate_idx] * eta;
            }

            // Compute write record values
            for (const auto& gate_idx : memory_write_records) {
                wires[3][gate_idx] += wires[2][gate_idx] * eta_three;
                wires[3][gate_idx] += wires[1][gate_idx] * eta_two;
                wires[3][gate_idx] += wires[0][gate_idx] * eta;
                wires[3][gate_idx] += 1;
            }
        }

        /**
         * @brief Compute the inverse polynomial used in the log derivative lookup argument
         *
         * @tparam Flavor
         * @param beta
         * @param gamma
         */
        void compute_logderivative_inverses(const RelationParameters<FF>& relation_parameters)
        {
            // Compute inverses for conventional lookups
            compute_logderivative_inverse<UltraFlavor, LogDerivLookupRelation<FF>>(
                this->polynomials, relation_parameters, this->circuit_size);
        }

        /**
         * @brief Computes public_input_delta and the permutation grand product polynomial
         *
         * @param relation_parameters
         */
        void compute_grand_product_polynomials(RelationParameters<FF>& relation_parameters)
        {
            auto public_input_delta = compute_public_input_delta<UltraFlavor>(this->public_inputs,
                                                                              relation_parameters.beta,
                                                                              relation_parameters.gamma,
                                                                              this->circuit_size,
                                                                              this->pub_inputs_offset);
            relation_parameters.public_input_delta = public_input_delta;

            // Compute permutation and lookup grand product polynomials
            compute_grand_products<UltraFlavor>(this->polynomials, relation_parameters);
        }
    };

    /**
     * @brief The verification key is responsible for storing the commitments to the precomputed (non-witnessk)
     * polynomials used by the verifier.
     *
     * @note Note the discrepancy with what sort of data is stored here vs in the proving key. We may want to resolve
     * that, and split out separate PrecomputedPolynomials/Commitments data for clarity but also for portability of our
     * circuits.
     */
    class VerificationKey : public VerificationKey_<PrecomputedEntities<Commitment>, VerifierCommitmentKey> {
      public:
        VerificationKey() = default;
        VerificationKey(const size_t circuit_size, const size_t num_public_inputs)
            : VerificationKey_(circuit_size, num_public_inputs)
        {}
        VerificationKey(ProvingKey& proving_key)
        {
            this->pcs_verification_key = std::make_shared<VerifierCommitmentKey>();
            this->circuit_size = proving_key.circuit_size;
            this->log_circuit_size = numeric::get_msb(this->circuit_size);
            this->num_public_inputs = proving_key.num_public_inputs;
            this->pub_inputs_offset = proving_key.pub_inputs_offset;
            this->contains_recursive_proof = proving_key.contains_recursive_proof;
            this->recursive_proof_public_input_indices = proving_key.recursive_proof_public_input_indices;

            for (auto [polynomial, commitment] : zip_view(proving_key.polynomials.get_precomputed(), this->get_all())) {
                commitment = proving_key.commitment_key->commit(polynomial);
            }
        }
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/964): Clean the boilerplate
        // up.
        VerificationKey(const uint64_t circuit_size,
                        const uint64_t num_public_inputs,
                        const uint64_t pub_inputs_offset,
                        const bool contains_recursive_proof,
                        const AggregationObjectPubInputIndices& recursive_proof_public_input_indices,
                        const Commitment& q_m,
                        const Commitment& q_c,
                        const Commitment& q_l,
                        const Commitment& q_r,
                        const Commitment& q_o,
                        const Commitment& q_4,
                        const Commitment& q_arith,
                        const Commitment& q_delta_range,
                        const Commitment& q_elliptic,
                        const Commitment& q_aux,
                        const Commitment& q_lookup,
                        const Commitment& q_poseidon2_external,
                        const Commitment& q_poseidon2_internal,
                        const Commitment& sigma_1,
                        const Commitment& sigma_2,
                        const Commitment& sigma_3,
                        const Commitment& sigma_4,
                        const Commitment& id_1,
                        const Commitment& id_2,
                        const Commitment& id_3,
                        const Commitment& id_4,
                        const Commitment& table_1,
                        const Commitment& table_2,
                        const Commitment& table_3,
                        const Commitment& table_4,
                        const Commitment& lagrange_first,
                        const Commitment& lagrange_last)
        {
            this->circuit_size = circuit_size;
            this->log_circuit_size = numeric::get_msb(this->circuit_size);
            this->num_public_inputs = num_public_inputs;
            this->pub_inputs_offset = pub_inputs_offset;
            this->contains_recursive_proof = contains_recursive_proof;
            this->recursive_proof_public_input_indices = recursive_proof_public_input_indices;
            this->q_m = q_m;
            this->q_c = q_c;
            this->q_l = q_l;
            this->q_r = q_r;
            this->q_o = q_o;
            this->q_4 = q_4;
            this->q_arith = q_arith;
            this->q_delta_range = q_delta_range;
            this->q_elliptic = q_elliptic;
            this->q_aux = q_aux;
            this->q_lookup = q_lookup;
            this->q_poseidon2_external = q_poseidon2_external;
            this->q_poseidon2_internal = q_poseidon2_internal;
            this->sigma_1 = sigma_1;
            this->sigma_2 = sigma_2;
            this->sigma_3 = sigma_3;
            this->sigma_4 = sigma_4;
            this->id_1 = id_1;
            this->id_2 = id_2;
            this->id_3 = id_3;
            this->id_4 = id_4;
            this->table_1 = table_1;
            this->table_2 = table_2;
            this->table_3 = table_3;
            this->table_4 = table_4;
            this->lagrange_first = lagrange_first;
            this->lagrange_last = lagrange_last;
        }

        // For serialising and deserialising data
        MSGPACK_FIELDS(circuit_size,
                       log_circuit_size,
                       num_public_inputs,
                       pub_inputs_offset,
                       contains_recursive_proof,
                       recursive_proof_public_input_indices,
                       q_m,
                       q_c,
                       q_l,
                       q_r,
                       q_o,
                       q_4,
                       q_arith,
                       q_delta_range,
                       q_elliptic,
                       q_aux,
                       q_lookup,
                       q_poseidon2_external,
                       q_poseidon2_internal,
                       sigma_1,
                       sigma_2,
                       sigma_3,
                       sigma_4,
                       id_1,
                       id_2,
                       id_3,
                       id_4,
                       table_1,
                       table_2,
                       table_3,
                       table_4,
                       lagrange_first,
                       lagrange_last);
    };

    /**
     * @brief A container for storing the partially evaluated multivariates produced by sumcheck.
     */
    class PartiallyEvaluatedMultivariates : public AllEntities<Polynomial> {

      public:
        PartiallyEvaluatedMultivariates() = default;
        PartiallyEvaluatedMultivariates(const size_t circuit_size)
        {
            ZoneScopedN("PartiallyEvaluatedMultivariates constructor");
            // Storage is only needed after the first partial evaluation, hence polynomials of
            // size (n / 2)
            for (auto& poly : this->get_all()) {
                poly = Polynomial(circuit_size / 2);
            }
        }
    };

    /**
     * @brief A container for univariates used during Protogalaxy folding and sumcheck.
     * @details During folding and sumcheck, the prover evaluates the relations on these univariates.
     */
    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;
    /**
     * @brief A container for univariates used during Protogalaxy folding and sumcheck.
     * @details During folding and sumcheck, the prover evaluates the relations on these univariates.
     */
    template <size_t LENGTH, size_t SKIP_COUNT>
    using OptimisedProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH, 0, SKIP_COUNT>>;

    /**
     * @brief A container for univariates produced during the hot loop in sumcheck.
     */
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;

    /**
     * @brief A container for the witness commitments.
     */
    using WitnessCommitments = WitnessEntities<Commitment>;

    /**
     * @brief A container for commitment labels.
     * @note It's debatable whether this should inherit from AllEntities. since most entries are not strictly needed. It
     * has, however, been useful during debugging to have these labels available.
     *
     */
    class CommitmentLabels : public AllEntities<std::string> {
      public:
        CommitmentLabels()
        {
            w_l = "W_L";
            w_r = "W_R";
            w_o = "W_O";
            w_4 = "W_4";
            z_perm = "Z_PERM";
            lookup_inverses = "LOOKUP_INVERSES";
            lookup_read_counts = "LOOKUP_READ_COUNTS";
            lookup_read_tags = "LOOKUP_READ_TAGS";

            q_c = "Q_C";
            q_l = "Q_L";
            q_r = "Q_R";
            q_o = "Q_O";
            q_4 = "Q_4";
            q_m = "Q_M";
            q_arith = "Q_ARITH";
            q_delta_range = "Q_SORT";
            q_elliptic = "Q_ELLIPTIC";
            q_aux = "Q_AUX";
            q_lookup = "Q_LOOKUP";
            q_poseidon2_external = "Q_POSEIDON2_EXTERNAL";
            q_poseidon2_internal = "Q_POSEIDON2_INTERNAL";
            sigma_1 = "SIGMA_1";
            sigma_2 = "SIGMA_2";
            sigma_3 = "SIGMA_3";
            sigma_4 = "SIGMA_4";
            id_1 = "ID_1";
            id_2 = "ID_2";
            id_3 = "ID_3";
            id_4 = "ID_4";
            table_1 = "TABLE_1";
            table_2 = "TABLE_2";
            table_3 = "TABLE_3";
            table_4 = "TABLE_4";
            lagrange_first = "LAGRANGE_FIRST";
            lagrange_last = "LAGRANGE_LAST";
        };
    };

    /**
     * @brief A container encapsulating all the commitments that the verifier receives (to precomputed polynomials and
     * witness polynomials).
     *
     */
    template <typename Commitment, typename VerificationKey>
    class VerifierCommitments_ : public AllEntities<Commitment> {
      public:
        VerifierCommitments_(const std::shared_ptr<VerificationKey>& verification_key,
                             const std::optional<WitnessEntities<Commitment>>& witness_commitments = std::nullopt)
        {
            this->q_m = verification_key->q_m;
            this->q_c = verification_key->q_c;
            this->q_l = verification_key->q_l;
            this->q_r = verification_key->q_r;
            this->q_o = verification_key->q_o;
            this->q_4 = verification_key->q_4;
            this->q_arith = verification_key->q_arith;
            this->q_delta_range = verification_key->q_delta_range;
            this->q_elliptic = verification_key->q_elliptic;
            this->q_aux = verification_key->q_aux;
            this->q_lookup = verification_key->q_lookup;
            this->q_poseidon2_external = verification_key->q_poseidon2_external;
            this->q_poseidon2_internal = verification_key->q_poseidon2_internal;
            this->sigma_1 = verification_key->sigma_1;
            this->sigma_2 = verification_key->sigma_2;
            this->sigma_3 = verification_key->sigma_3;
            this->sigma_4 = verification_key->sigma_4;
            this->id_1 = verification_key->id_1;
            this->id_2 = verification_key->id_2;
            this->id_3 = verification_key->id_3;
            this->id_4 = verification_key->id_4;
            this->table_1 = verification_key->table_1;
            this->table_2 = verification_key->table_2;
            this->table_3 = verification_key->table_3;
            this->table_4 = verification_key->table_4;
            this->lagrange_first = verification_key->lagrange_first;
            this->lagrange_last = verification_key->lagrange_last;

            if (witness_commitments.has_value()) {
                auto commitments = witness_commitments.value();
                this->w_l = commitments.w_l;
                this->w_r = commitments.w_r;
                this->w_o = commitments.w_o;
                this->lookup_inverses = commitments.lookup_inverses;
                this->lookup_read_counts = commitments.lookup_read_counts;
                this->lookup_read_tags = commitments.lookup_read_tags;
                this->w_4 = commitments.w_4;
                this->z_perm = commitments.z_perm;
            }
        }
    };
    // Specialize for Ultra (general case used in UltraRecursive).
    using VerifierCommitments = VerifierCommitments_<Commitment, VerificationKey>;

    /**
     * @brief Derived class that defines proof structure for Ultra proofs, as well as supporting functions.
     *
     */
    class Transcript : public NativeTranscript {
      public:
        // Transcript objects defined as public member variables for easy access and modification
        uint32_t circuit_size;
        uint32_t public_input_size;
        uint32_t pub_inputs_offset;
        std::vector<FF> public_inputs;
        Commitment w_l_comm;
        Commitment w_r_comm;
        Commitment w_o_comm;
        Commitment lookup_read_counts_comm;
        Commitment lookup_read_tags_comm;
        Commitment w_4_comm;
        Commitment z_perm_comm;
        Commitment lookup_inverses_comm;
        std::vector<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>> sumcheck_univariates;
        std::array<FF, NUM_ALL_ENTITIES> sumcheck_evaluations;
        std::vector<Commitment> zm_cq_comms;
        Commitment zm_cq_comm;
        Commitment kzg_w_comm;

        Transcript() = default;

        // Used by verifier to initialize the xcript
        Transcript(const std::vector<FF>& proof)
            : NativeTranscript(proof)
        {}

        static std::shared_ptr<Transcript> prover_init_empty()
        {
            auto transcript = std::make_shared<Transcript>();
            constexpr uint32_t init{ 42 }; // arbitrary
            transcript->send_to_verifier("Init", init);
            return transcript;
        };

        static std::shared_ptr<Transcript> verifier_init_empty(const std::shared_ptr<Transcript>& transcript)
        {
            auto verifier_transcript = std::make_shared<Transcript>(transcript->proof_data);
            [[maybe_unused]] auto _ = verifier_transcript->template receive_from_prover<FF>("Init");
            return verifier_transcript;
        };

        /**
         * @brief Takes a FULL Ultra proof and deserializes it into the public member variables
         * that compose the structure. Must be called in order to access the structure of the
         * proof.
         *
         */
        void deserialize_full_transcript()
        {
            // take current proof and put them into the struct
            size_t num_frs_read = 0;
            circuit_size = deserialize_from_buffer<uint32_t>(proof_data, num_frs_read);

            public_input_size = deserialize_from_buffer<uint32_t>(proof_data, num_frs_read);
            pub_inputs_offset = deserialize_from_buffer<uint32_t>(proof_data, num_frs_read);
            for (size_t i = 0; i < public_input_size; ++i) {
                public_inputs.push_back(deserialize_from_buffer<FF>(proof_data, num_frs_read));
            }
            w_l_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            w_r_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            w_o_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            lookup_read_counts_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            lookup_read_tags_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            w_4_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            lookup_inverses_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            z_perm_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                sumcheck_univariates.push_back(
                    deserialize_from_buffer<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>>(proof_data,
                                                                                                 num_frs_read));
            }
            sumcheck_evaluations = deserialize_from_buffer<std::array<FF, NUM_ALL_ENTITIES>>(proof_data, num_frs_read);
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                zm_cq_comms.push_back(deserialize_from_buffer<Commitment>(proof_data, num_frs_read));
            }
            zm_cq_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            kzg_w_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
        }

        /**
         * @brief Serializes the structure variables into a FULL Ultra proof. Should be called
         * only if deserialize_full_transcript() was called and some transcript variable was
         * modified.
         *
         */
        void serialize_full_transcript()
        {
            size_t old_proof_length = proof_data.size();
            proof_data.clear(); // clear proof_data so the rest of the function can replace it
            serialize_to_buffer(circuit_size, proof_data);
            serialize_to_buffer(public_input_size, proof_data);
            serialize_to_buffer(pub_inputs_offset, proof_data);
            for (size_t i = 0; i < public_input_size; ++i) {
                serialize_to_buffer(public_inputs[i], proof_data);
            }
            serialize_to_buffer(w_l_comm, proof_data);
            serialize_to_buffer(w_r_comm, proof_data);
            serialize_to_buffer(w_o_comm, proof_data);
            serialize_to_buffer(lookup_read_counts_comm, proof_data);
            serialize_to_buffer(lookup_read_tags_comm, proof_data);
            serialize_to_buffer(w_4_comm, proof_data);
            serialize_to_buffer(lookup_inverses_comm, proof_data);
            serialize_to_buffer(z_perm_comm, proof_data);
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                serialize_to_buffer(sumcheck_univariates[i], proof_data);
            }
            serialize_to_buffer(sumcheck_evaluations, proof_data);
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                serialize_to_buffer(zm_cq_comms[i], proof_data);
            }
            serialize_to_buffer(zm_cq_comm, proof_data);
            serialize_to_buffer(kzg_w_comm, proof_data);

            // sanity check to make sure we generate the same length of proof as before.
            ASSERT(proof_data.size() == old_proof_length);
        }
    };
};

} // namespace bb
