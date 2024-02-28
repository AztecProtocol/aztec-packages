#pragma once
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/flavor/ultra.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/relations/auxiliary_relation.hpp"
#include "barretenberg/relations/elliptic_relation.hpp"
#include "barretenberg/relations/gen_perm_sort_relation.hpp"
#include "barretenberg/relations/lookup_relation.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/relations/ultra_arithmetic_relation.hpp"
#include "barretenberg/srs/factories/crs_factory.hpp"

#include <array>
#include <concepts>
#include <span>
#include <string>
#include <type_traits>
#include <vector>

#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/recursion/honk/transcript/transcript.hpp"

namespace bb {

/**
 * @brief The recursive counterpart to the "native" Ultra flavor.
 * @details This flavor can be used to instantiate a recursive Ultra Honk verifier for a proof created using the
 * conventional Ultra flavor. It is similar in structure to its native counterpart with two main differences: 1) the
 * curve types are stdlib types (e.g. field_t instead of field) and 2) it does not specify any Prover related types
 * (e.g. Polynomial, ProverUnivariates, etc.) since we do not emulate prover computation in circuits, i.e. it only makes
 * sense to instantiate a Verifier with this flavor.
 *
 * @note Unlike conventional flavors, "recursive" flavors are templated by a builder (much like native vs stdlib types).
 * This is because the flavor itself determines the details of the underlying verifier algorithm (i.e. the set of
 * relations), while the Builder determines the arithmetization of that algorithm into a circuit.
 *
 * @tparam BuilderType Determines the arithmetization of the verifier circuit defined based on this flavor.
 */
template <typename BuilderType> class UltraRecursiveFlavor_ {
  public:
    using CircuitBuilder = BuilderType; // Determines arithmetization of circuit instantiated with this flavor
    using Curve = stdlib::bn254<CircuitBuilder>;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::Element;
    using FF = typename Curve::ScalarField;
    using NativeFlavor = UltraFlavor;
    using NativeVerificationKey = NativeFlavor::VerificationKey;

    // Note(luke): Eventually this may not be needed at all
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<Curve>;

    static constexpr size_t NUM_WIRES = UltraFlavor::NUM_WIRES;
    // The number of multivariate polynomials on which a sumcheck prover sumcheck operates (including shifts). We often
    // need containers of this size to hold related data, so we choose a name more agnostic than `NUM_POLYNOMIALS`.
    // Note: this number does not include the individual sorted list polynomials.
    static constexpr size_t NUM_ALL_ENTITIES = 43;
    // The number of polynomials precomputed to describe a circuit and to aid a prover in constructing a satisfying
    // assignment of witnesses. We again choose a neutral name.
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = 25;
    // The total number of witness entities not including shifts.
    static constexpr size_t NUM_WITNESS_ENTITIES = 7;

    // define the tuple of Relations that comprise the Sumcheck relation
    using Relations = std::tuple<bb::UltraArithmeticRelation<FF>,
                                 bb::UltraPermutationRelation<FF>,
                                 bb::LookupRelation<FF>,
                                 bb::GenPermSortRelation<FF>,
                                 bb::EllipticRelation<FF>,
                                 bb::AuxiliaryRelation<FF>>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    static_assert(MAX_PARTIAL_RELATION_LENGTH == 6);
    static constexpr size_t MAX_TOTAL_RELATION_LENGTH = compute_max_total_relation_length<Relations>();
    static_assert(MAX_TOTAL_RELATION_LENGTH == 12);

    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t BATCHED_RELATION_TOTAL_LENGTH = MAX_TOTAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size<Relations>::value;

    // For instances of this flavour, used in folding, we need a unique sumcheck batching challenges for each
    // subrelation to avoid increasing the degree of Protogalaxy polynomial $G$ (the
    // combiner) too much.
    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    using RelationSeparator = std::array<FF, NUM_SUBRELATIONS - 1>;

    // define the container for storing the univariate contribution from each relation in Sumcheck
    using SumcheckTupleOfTuplesOfUnivariates = decltype(create_sumcheck_tuple_of_tuples_of_univariates<Relations>());
    using TupleOfArraysOfValues = decltype(create_tuple_of_arrays_of_values<Relations>());

  private:
    template <typename DataType>
    /**
     * @brief A base class labelling precomputed entities and (ordered) subsets of interest.
     * @details Used to build the proving key and verification key.
     */
    class PrecomputedEntities : public PrecomputedEntitiesBase {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              q_m,            // column 0
                              q_c,            // column 1
                              q_l,            // column 2
                              q_r,            // column 3
                              q_o,            // column 4
                              q_4,            // column 5
                              q_arith,        // column 6
                              q_sort,         // column 7
                              q_elliptic,     // column 8
                              q_aux,          // column 9
                              q_lookup,       // column 10
                              sigma_1,        // column 11
                              sigma_2,        // column 12
                              sigma_3,        // column 13
                              sigma_4,        // column 14
                              id_1,           // column 15
                              id_2,           // column 16
                              id_3,           // column 17
                              id_4,           // column 18
                              table_1,        // column 19
                              table_2,        // column 20
                              table_3,        // column 21
                              table_4,        // column 22
                              lagrange_first, // column 23
                              lagrange_last); // column 24

        auto get_selectors()
        {
            return RefArray{ q_m, q_c, q_l, q_r, q_o, q_4, q_arith, q_sort, q_elliptic, q_aux, q_lookup };
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
                              w_l,          // column 0
                              w_r,          // column 1
                              w_o,          // column 2
                              w_4,          // column 3
                              sorted_accum, // column 4
                              z_perm,       // column 5
                              z_lookup      // column 6

        );

        auto get_wires() { return RefArray{ w_l, w_r, w_o, w_4 }; };
    };

  public:
    /**
     * @brief A container for the witness commitments.
     */
    using WitnessCommitments = WitnessEntities<Commitment>;

    /**
     * @brief A base class labelling all entities (for instance, all of the polynomials used by the prover during
     * sumcheck) in this Honk variant along with particular subsets of interest
     * @details Used to build containers for: the prover's polynomial during sumcheck; the sumcheck's folded
     * polynomials; the univariates consturcted during during sumcheck; the evaluations produced by sumcheck.
     *
     * Symbolically we have: AllEntities = PrecomputedEntities + WitnessEntities + "ShiftedEntities". It could be
     * implemented as such, but we have this now.
     */
    template <typename DataType> class AllEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              q_c,                // column 0
                              q_l,                // column 1
                              q_r,                // column 2
                              q_o,                // column 3
                              q_4,                // column 4
                              q_m,                // column 5
                              q_arith,            // column 6
                              q_sort,             // column 7
                              q_elliptic,         // column 8
                              q_aux,              // column 9
                              q_lookup,           // column 10
                              sigma_1,            // column 11
                              sigma_2,            // column 12
                              sigma_3,            // column 13
                              sigma_4,            // column 14
                              id_1,               // column 15
                              id_2,               // column 16
                              id_3,               // column 17
                              id_4,               // column 18
                              table_1,            // column 19
                              table_2,            // column 20
                              table_3,            // column 21
                              table_4,            // column 22
                              lagrange_first,     // column 23
                              lagrange_last,      // column 24
                              w_l,                // column 25
                              w_r,                // column 26
                              w_o,                // column 27
                              w_4,                // column 28
                              sorted_accum,       // column 29
                              z_perm,             // column 30
                              z_lookup,           // column 31
                              table_1_shift,      // column 32
                              table_2_shift,      // column 33
                              table_3_shift,      // column 34
                              table_4_shift,      // column 35
                              w_l_shift,          // column 36
                              w_r_shift,          // column 37
                              w_o_shift,          // column 38
                              w_4_shift,          // column 39
                              sorted_accum_shift, // column 40
                              z_perm_shift,       // column 41
                              z_lookup_shift      // column 42
        );

        auto get_wires() { return RefArray{ w_l, w_r, w_o, w_4 }; };
        // Gemini-specific getters.
        auto get_unshifted()
        {
            return RefArray{ q_m,           q_c,   q_l,      q_r,     q_o,     q_4,          q_arith, q_sort,
                             q_elliptic,    q_aux, q_lookup, sigma_1, sigma_2, sigma_3,      sigma_4, id_1,
                             id_2,          id_3,  id_4,     table_1, table_2, table_3,      table_4, lagrange_first,
                             lagrange_last, w_l,   w_r,      w_o,     w_4,     sorted_accum, z_perm,  z_lookup

            };
        };
        auto get_precomputed()
        {
            return RefArray{ q_m,          q_c,   q_l,      q_r,     q_o,     q_4,     q_arith, q_sort,
                             q_elliptic,   q_aux, q_lookup, sigma_1, sigma_2, sigma_3, sigma_4, id_1,
                             id_2,         id_3,  id_4,     table_1, table_2, table_3, table_4, lagrange_first,
                             lagrange_last

            };
        }

        auto get_witness() { return RefArray{ w_l, w_r, w_o, w_4, sorted_accum, z_perm, z_lookup }; };
        auto get_to_be_shifted()
        {
            return RefArray{ table_1, table_2, table_3, table_4, w_l, w_r, w_o, w_4, sorted_accum, z_perm, z_lookup };
        };
        auto get_shifted()
        {
            return RefArray{ table_1_shift, table_2_shift, table_3_shift,      table_4_shift, w_l_shift,     w_r_shift,
                             w_o_shift,     w_4_shift,     sorted_accum_shift, z_perm_shift,  z_lookup_shift };
        };
    };

  public:
    /**
     * @brief The verification key is responsible for storing the the commitments to the precomputed (non-witnessk)
     * polynomials used by the verifier.
     *
     * @note Note the discrepancy with what sort of data is stored here vs in the proving key. We may want to resolve
     * that, and split out separate PrecomputedPolynomials/Commitments data for clarity but also for portability of our
     * circuits.
     */
    class VerificationKey : public VerificationKey_<PrecomputedEntities<Commitment>> {
      public:
        VerificationKey(const size_t circuit_size, const size_t num_public_inputs)
        {
            this->circuit_size = circuit_size;
            this->log_circuit_size = numeric::get_msb(circuit_size);
            this->num_public_inputs = num_public_inputs;
        };
        /**
         * @brief Construct a new Verification Key with stdlib types from a provided native verification key
         *
         * @param builder
         * @param native_key Native verification key from which to extract the precomputed commitments
         */
        VerificationKey(CircuitBuilder* builder, const std::shared_ptr<NativeVerificationKey>& native_key)
        {
            this->circuit_size = native_key->circuit_size;
            this->log_circuit_size = numeric::get_msb(this->circuit_size);
            this->num_public_inputs = native_key->num_public_inputs;
            this->q_m = Commitment::from_witness(builder, native_key->q_m);
            this->q_l = Commitment::from_witness(builder, native_key->q_l);
            this->q_r = Commitment::from_witness(builder, native_key->q_r);
            this->q_o = Commitment::from_witness(builder, native_key->q_o);
            this->q_4 = Commitment::from_witness(builder, native_key->q_4);
            this->q_c = Commitment::from_witness(builder, native_key->q_c);
            this->q_arith = Commitment::from_witness(builder, native_key->q_arith);
            this->q_sort = Commitment::from_witness(builder, native_key->q_sort);
            this->q_elliptic = Commitment::from_witness(builder, native_key->q_elliptic);
            this->q_aux = Commitment::from_witness(builder, native_key->q_aux);
            this->q_lookup = Commitment::from_witness(builder, native_key->q_lookup);
            this->sigma_1 = Commitment::from_witness(builder, native_key->sigma_1);
            this->sigma_2 = Commitment::from_witness(builder, native_key->sigma_2);
            this->sigma_3 = Commitment::from_witness(builder, native_key->sigma_3);
            this->sigma_4 = Commitment::from_witness(builder, native_key->sigma_4);
            this->id_1 = Commitment::from_witness(builder, native_key->id_1);
            this->id_2 = Commitment::from_witness(builder, native_key->id_2);
            this->id_3 = Commitment::from_witness(builder, native_key->id_3);
            this->id_4 = Commitment::from_witness(builder, native_key->id_4);
            this->table_1 = Commitment::from_witness(builder, native_key->table_1);
            this->table_2 = Commitment::from_witness(builder, native_key->table_2);
            this->table_3 = Commitment::from_witness(builder, native_key->table_3);
            this->table_4 = Commitment::from_witness(builder, native_key->table_4);
            this->lagrange_first = Commitment::from_witness(builder, native_key->lagrange_first);
            this->lagrange_last = Commitment::from_witness(builder, native_key->lagrange_last);
        };
    };

    /**
     * @brief A field element for each entity of the flavor. These entities represent the prover polynomials evaluated
     * at one point.
     */
    class AllValues : public AllEntities<FF> {
      public:
        using Base = AllEntities<FF>;
        using Base::Base;
        AllValues(std::array<FF, NUM_ALL_ENTITIES> _data_in) { this->_data = _data_in; }
    };

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
            this->w_l = "W_L";
            this->w_r = "W_R";
            this->w_o = "W_O";
            this->w_4 = "W_4";
            this->z_perm = "Z_PERM";
            this->z_lookup = "Z_LOOKUP";
            this->sorted_accum = "SORTED_ACCUM";

            this->q_c = "Q_C";
            this->q_l = "Q_L";
            this->q_r = "Q_R";
            this->q_o = "Q_O";
            this->q_4 = "Q_4";
            this->q_m = "Q_M";
            this->q_arith = "Q_ARITH";
            this->q_sort = "Q_SORT";
            this->q_elliptic = "Q_ELLIPTIC";
            this->q_aux = "Q_AUX";
            this->q_lookup = "Q_LOOKUP";
            this->sigma_1 = "SIGMA_1";
            this->sigma_2 = "SIGMA_2";
            this->sigma_3 = "SIGMA_3";
            this->sigma_4 = "SIGMA_4";
            this->id_1 = "ID_1";
            this->id_2 = "ID_2";
            this->id_3 = "ID_3";
            this->id_4 = "ID_4";
            this->table_1 = "TABLE_1";
            this->table_2 = "TABLE_2";
            this->table_3 = "TABLE_3";
            this->table_4 = "TABLE_4";
            this->lagrange_first = "LAGRANGE_FIRST";
            this->lagrange_last = "LAGRANGE_LAST";
        };
    };

    class VerifierCommitments : public AllEntities<Commitment> {
      public:
        VerifierCommitments(const std::shared_ptr<VerificationKey>& verification_key,
                            const std::optional<WitnessCommitments>& witness_commitments = std::nullopt)
        {
            this->q_m = verification_key->q_m;
            this->q_l = verification_key->q_l;
            this->q_r = verification_key->q_r;
            this->q_o = verification_key->q_o;
            this->q_4 = verification_key->q_4;
            this->q_c = verification_key->q_c;
            this->q_arith = verification_key->q_arith;
            this->q_sort = verification_key->q_sort;
            this->q_elliptic = verification_key->q_elliptic;
            this->q_aux = verification_key->q_aux;
            this->q_lookup = verification_key->q_lookup;
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
                this->sorted_accum = commitments.sorted_accum;
                this->w_4 = commitments.w_4;
                this->z_perm = commitments.z_perm;
                this->z_lookup = commitments.z_lookup;
            }
        }
    };

    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<CircuitBuilder>>;
};

} // namespace bb
