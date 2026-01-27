// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include <utility>

#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
namespace bb {

/**
 * @brief The TranslatorProvingKey transforms witness data into polynomial form suitable for proving.
 *
 * @details This class is responsible for:
 * - Computing witness values directly from ECC op queue
 * - Transferring wire values into polynomials
 * - Computing Lagrange selector polynomials
 * - Computing interleaved and ordered range constraint polynomials
 * - Distributing randomness for zero-knowledge
 *
 * Challenge values (batching_challenge_v, evaluation_input_x) are stored here because the prover
 * needs them after witness data is consumed.
 */
class TranslatorProvingKey {
  public:
    using Flavor = TranslatorFlavor;
    using FF = typename Flavor::FF;
    using BF = typename Flavor::BF;
    using ProvingKey = typename Flavor::ProvingKey;
    using Polynomial = typename Flavor::Polynomial;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using CommitmentKey = typename Flavor::CommitmentKey;

    // =============================================================================================
    // Size constants (from Flavor)
    // =============================================================================================
    static constexpr size_t MINI_CIRCUIT_SIZE = Flavor::MINI_CIRCUIT_SIZE;
    static constexpr size_t DYADIC_CIRCUIT_SIZE = Flavor::DYADIC_CIRCUIT_SIZE;
    static constexpr size_t DYADIC_MINI_CIRCUIT_SIZE_WITHOUT_MASKING = Flavor::DYADIC_MINI_CIRCUIT_SIZE_WITHOUT_MASKING;
    static constexpr size_t DYADIC_CIRCUIT_SIZE_WITHOUT_MASKING = Flavor::DYADIC_CIRCUIT_SIZE_WITHOUT_MASKING;

    // =============================================================================================
    // Witness generation constants
    // =============================================================================================

    // Maximum size of a single limb is 68 bits
    static constexpr size_t NUM_LIMB_BITS = Flavor::NUM_LIMB_BITS;

    // For soundness we need to constrain the highest limb so that the whole value is at most 50 bits
    static constexpr size_t NUM_LAST_LIMB_BITS = BF::modulus.get_msb() + 1 - (3 * NUM_LIMB_BITS);

    // 128-bit z_1 and z_2 are split into 2 limbs each
    static constexpr size_t NUM_Z_LIMBS = 2;

    // Number of bits in the quotient highest limb
    static constexpr size_t NUM_LAST_QUOTIENT_LIMB_BITS = 256 - (3 * NUM_LIMB_BITS);

    // Number of bits in Z scalars
    static constexpr size_t NUM_Z_BITS = 128;

    // Range constraint mechanism uses 14-bit microlimbs
    static constexpr size_t MICRO_LIMB_BITS = Flavor::MICRO_LIMB_BITS;

    // To range constrain a limb to 68 bits we need 6 limbs
    static constexpr size_t NUM_MICRO_LIMBS = 6;

    // Number of limbs used to decompose a 254-bit value for modular arithmetic
    static constexpr size_t NUM_BINARY_LIMBS = 4;

    // Number of limbs used for computation of a result modulo 2²⁷²
    static constexpr size_t NUM_RELATION_WIDE_LIMBS = 2;

    // Range constraint of relation limbs
    static constexpr size_t RELATION_WIDE_LIMB_BITS = 84;

    // Maximum size of each relation limb
    static constexpr uint256_t MAX_RELATION_WIDE_LIMB_SIZE = uint256_t(1) << RELATION_WIDE_LIMB_BITS;

    // Shift of a single micro limb
    static constexpr auto MICRO_SHIFT = uint256_t(1) << MICRO_LIMB_BITS;

    // Maximum size of 2 lower limbs concatenated
    static constexpr auto MAX_LOW_WIDE_LIMB_SIZE = (uint256_t(1) << (NUM_LIMB_BITS * 2)) - 1;

    // Maximum size of 2 higher limbs concatenated
    static constexpr auto MAX_HIGH_WIDE_LIMB_SIZE = (uint256_t(1) << (NUM_LIMB_BITS + NUM_LAST_LIMB_BITS)) - 1;

    // Maximum size of z limbs
    static constexpr auto MAX_Z_LIMB_SIZE = (uint256_t(1) << NUM_Z_BITS) - 1;

    // Number of no-ops at the start
    static constexpr size_t NUM_NO_OPS_START = Flavor::NUM_NO_OPS_START;

    // Number of random ops at the beginning of Translator trace
    static constexpr size_t NUM_RANDOM_OPS_START = Flavor::NUM_RANDOM_OPS_START;

    // Number of random ops at the end of Translator trace
    static constexpr size_t NUM_RANDOM_OPS_END = Flavor::NUM_RANDOM_OPS_END;

    // Shift constants for limb operations
    static constexpr auto SHIFT_1 = uint256_t(1) << NUM_LIMB_BITS;
    static constexpr auto SHIFT_2 = uint256_t(1) << (NUM_LIMB_BITS * 2);
    static constexpr auto SHIFT_3 = uint256_t(1) << (NUM_LIMB_BITS * 3);
    static constexpr auto SHIFT_2_INVERSE = FF(SHIFT_2).invert();

    // Modulus constants for CRT computation
    static constexpr uint512_t MODULUS_U512 = uint512_t(BF::modulus);
    static constexpr uint512_t BINARY_BASIS_MODULUS = uint512_t(1) << (NUM_LIMB_BITS << 2);
    static constexpr uint512_t NEGATIVE_PRIME_MODULUS = BINARY_BASIS_MODULUS - MODULUS_U512;
    static constexpr std::array<FF, 5> NEGATIVE_MODULUS_LIMBS = {
        FF(NEGATIVE_PRIME_MODULUS.slice(0, NUM_LIMB_BITS).lo),
        FF(NEGATIVE_PRIME_MODULUS.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2).lo),
        FF(NEGATIVE_PRIME_MODULUS.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3).lo),
        FF(NEGATIVE_PRIME_MODULUS.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4).lo),
        -FF(BF::modulus)
    };

    // =============================================================================================
    // Wire index enumeration - matches the wire layout expected by TranslatorFlavor
    // =============================================================================================
    enum WireIdx : size_t {
        OP,
        X_LOW_Y_HI,
        X_HIGH_Z_1,
        Y_LOW_Z_2,
        P_X_LOW_LIMBS,
        P_X_HIGH_LIMBS,
        P_Y_LOW_LIMBS,
        P_Y_HIGH_LIMBS,
        Z_LOW_LIMBS,
        Z_HIGH_LIMBS,
        ACCUMULATORS_BINARY_LIMBS_0,
        ACCUMULATORS_BINARY_LIMBS_1,
        ACCUMULATORS_BINARY_LIMBS_2,
        ACCUMULATORS_BINARY_LIMBS_3,
        QUOTIENT_LOW_BINARY_LIMBS,
        QUOTIENT_HIGH_BINARY_LIMBS,
        RELATION_WIDE_LIMBS,
        P_X_LOW_LIMBS_RANGE_CONSTRAINT_0,
        P_X_LOW_LIMBS_RANGE_CONSTRAINT_1,
        P_X_LOW_LIMBS_RANGE_CONSTRAINT_2,
        P_X_LOW_LIMBS_RANGE_CONSTRAINT_3,
        P_X_LOW_LIMBS_RANGE_CONSTRAINT_4,
        P_X_LOW_LIMBS_RANGE_CONSTRAINT_TAIL,
        P_X_HIGH_LIMBS_RANGE_CONSTRAINT_0,
        P_X_HIGH_LIMBS_RANGE_CONSTRAINT_1,
        P_X_HIGH_LIMBS_RANGE_CONSTRAINT_2,
        P_X_HIGH_LIMBS_RANGE_CONSTRAINT_3,
        P_X_HIGH_LIMBS_RANGE_CONSTRAINT_4,
        P_X_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL,
        P_Y_LOW_LIMBS_RANGE_CONSTRAINT_0,
        P_Y_LOW_LIMBS_RANGE_CONSTRAINT_1,
        P_Y_LOW_LIMBS_RANGE_CONSTRAINT_2,
        P_Y_LOW_LIMBS_RANGE_CONSTRAINT_3,
        P_Y_LOW_LIMBS_RANGE_CONSTRAINT_4,
        P_Y_LOW_LIMBS_RANGE_CONSTRAINT_TAIL,
        P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_0,
        P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_1,
        P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_2,
        P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_3,
        P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_4,
        P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL,
        Z_LOW_LIMBS_RANGE_CONSTRAINT_0,
        Z_LOW_LIMBS_RANGE_CONSTRAINT_1,
        Z_LOW_LIMBS_RANGE_CONSTRAINT_2,
        Z_LOW_LIMBS_RANGE_CONSTRAINT_3,
        Z_LOW_LIMBS_RANGE_CONSTRAINT_4,
        Z_LOW_LIMBS_RANGE_CONSTRAINT_TAIL,
        Z_HIGH_LIMBS_RANGE_CONSTRAINT_0,
        Z_HIGH_LIMBS_RANGE_CONSTRAINT_1,
        Z_HIGH_LIMBS_RANGE_CONSTRAINT_2,
        Z_HIGH_LIMBS_RANGE_CONSTRAINT_3,
        Z_HIGH_LIMBS_RANGE_CONSTRAINT_4,
        Z_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL,
        ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_0,
        ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_1,
        ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_2,
        ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_3,
        ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_4,
        ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_TAIL,
        ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_0,
        ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_1,
        ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_2,
        ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_3,
        ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_4,
        ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL,
        QUOTIENT_LOW_LIMBS_RANGE_CONSTRAIN_0,
        QUOTIENT_LOW_LIMBS_RANGE_CONSTRAIN_1,
        QUOTIENT_LOW_LIMBS_RANGE_CONSTRAIN_2,
        QUOTIENT_LOW_LIMBS_RANGE_CONSTRAIN_3,
        QUOTIENT_LOW_LIMBS_RANGE_CONSTRAIN_4,
        QUOTIENT_LOW_LIMBS_RANGE_CONSTRAIN_TAIL,
        QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAIN_0,
        QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAIN_1,
        QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAIN_2,
        QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAIN_3,
        QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAIN_4,
        QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAIN_TAIL,
        RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_0,
        RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_1,
        RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_2,
        RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_3,
        TOTAL_COUNT
    };
    static_assert(TOTAL_COUNT == Flavor::NUM_WIRES);

    // =============================================================================================
    // AccumulationInput - contains all necessary values to create an accumulation gate
    // =============================================================================================
    struct AccumulationInput {
        UltraOp ultra_op;
        std::array<FF, NUM_BINARY_LIMBS> P_x_limbs;
        std::array<std::array<FF, NUM_MICRO_LIMBS>, NUM_BINARY_LIMBS> P_x_microlimbs;
        std::array<FF, NUM_BINARY_LIMBS> P_y_limbs;
        std::array<std::array<FF, NUM_MICRO_LIMBS>, NUM_BINARY_LIMBS> P_y_microlimbs;
        std::array<FF, NUM_Z_LIMBS> z_1_limbs;
        std::array<std::array<FF, NUM_MICRO_LIMBS>, NUM_Z_LIMBS> z_1_microlimbs;
        std::array<FF, NUM_Z_LIMBS> z_2_limbs;
        std::array<std::array<FF, NUM_MICRO_LIMBS>, NUM_Z_LIMBS> z_2_microlimbs;
        std::array<FF, NUM_BINARY_LIMBS> previous_accumulator;
        std::array<FF, NUM_BINARY_LIMBS> current_accumulator;
        std::array<std::array<FF, NUM_MICRO_LIMBS>, NUM_BINARY_LIMBS> current_accumulator_microlimbs;
        std::array<FF, NUM_BINARY_LIMBS> quotient_binary_limbs;
        std::array<std::array<FF, NUM_MICRO_LIMBS>, NUM_BINARY_LIMBS> quotient_microlimbs;
        std::array<FF, NUM_RELATION_WIDE_LIMBS> relation_wide_limbs;
        std::array<std::array<FF, NUM_MICRO_LIMBS>, NUM_RELATION_WIDE_LIMBS> relation_wide_microlimbs;
    };

    // Static assertions to ensure flavor invariants are maintained
    static_assert(DYADIC_CIRCUIT_SIZE == MINI_CIRCUIT_SIZE * Flavor::INTERLEAVING_GROUP_SIZE,
                  "Dyadic circuit size must equal mini circuit size times interleaving group size");
    static_assert(DYADIC_MINI_CIRCUIT_SIZE_WITHOUT_MASKING < MINI_CIRCUIT_SIZE,
                  "Mini circuit size without masking must be smaller than full mini circuit size");

    // =============================================================================================
    // Data Members
    // =============================================================================================

    std::shared_ptr<ProvingKey> proving_key;

    // Challenge values from ECCVM, copied during proving key construction.
    // These must be stored here because the prover needs them later in
    // execute_grand_product_computation_round() to set up relation parameters.
    BF batching_challenge_v = { 0 };
    BF evaluation_input_x = { 0 };

    // Whether this proving key was constructed in AVM mode (no random ops at end)
    bool avm_mode = false;

    // =============================================================================================
    // Constructors
    // =============================================================================================

    TranslatorProvingKey() = default;

    /**
     * @brief Construct from an op queue and challenges
     *
     * @details This constructor directly computes witness values and stores them in polynomials.
     *
     * @param batching_challenge_v_ The batching challenge from ECCVM
     * @param evaluation_input_x_ The evaluation challenge from ECCVM
     * @param op_queue The ECC operation queue
     * @param commitment_key The commitment key
     * @param avm_mode Whether to use AVM mode (default false)
     */
    TranslatorProvingKey(BF batching_challenge_v_,
                         BF evaluation_input_x_,
                         const std::shared_ptr<ECCOpQueue>& op_queue,
                         const CommitmentKey& commitment_key = CommitmentKey(),
                         bool avm_mode = false);

    // =============================================================================================
    // Static Helper Methods for Witness Generation
    // =============================================================================================

    /**
     * @brief Transform a native element BF (Fq) into its bigfield representation in FF (Fr) scalars
     */
    static std::array<FF, NUM_BINARY_LIMBS> split_fq_into_limbs(const BF& base)
    {
        uint256_t base_uint = base;
        return std::array<FF, NUM_BINARY_LIMBS>({
            FF(base_uint.slice(0, NUM_LIMB_BITS)),
            FF(base_uint.slice(NUM_LIMB_BITS, 2 * NUM_LIMB_BITS)),
            FF(base_uint.slice(2 * NUM_LIMB_BITS, 3 * NUM_LIMB_BITS)),
            FF(base_uint.slice(3 * NUM_LIMB_BITS, 4 * NUM_LIMB_BITS)),
        });
    }

    /**
     * @brief Generate witness values for one step of accumulation
     */
    static AccumulationInput generate_witness_values(const UltraOp& ultra_op,
                                                     const BF& previous_accumulator,
                                                     const BF& batching_challenge_v,
                                                     const BF& evaluation_input_x);

    /**
     * @brief Validate that an UltraOp is well-formed
     */
    static void assert_well_formed_ultra_op(const UltraOp& ultra_op);

    /**
     * @brief Validate that an AccumulationInput is well-formed
     */
    static void assert_well_formed_accumulation_input(const AccumulationInput& acc_step);

    /**
     * @brief Create the array of steps inserted in each ordered range constraint
     */
    static std::array<size_t, Flavor::SORTED_STEPS_COUNT> get_sorted_steps()
    {
        static const std::array<size_t, Flavor::SORTED_STEPS_COUNT> sorted_elements = [] {
            std::array<size_t, Flavor::SORTED_STEPS_COUNT> inner_array{};
            const size_t max_value = (1 << Flavor::MICRO_LIMB_BITS) - 1;

            parallel_for([&](const ThreadChunk& chunk) {
                for (size_t idx : chunk.range(Flavor::SORTED_STEPS_COUNT)) {
                    inner_array[idx] = max_value - Flavor::SORT_STEP * idx;
                }
            });

            return inner_array;
        }();

        return sorted_elements;
    }

    // =============================================================================================
    // Polynomial Computation Methods
    // =============================================================================================

    void compute_lagrange_polynomials();
    void compute_extra_range_constraint_numerator();
    void compute_translator_range_constraint_ordered_polynomials();
    void compute_interleaved_polynomials();
    void split_interleaved_random_coefficients_to_ordered();

  private:
    // =============================================================================================
    // Private Helper Methods for Witness Generation
    // =============================================================================================

    /**
     * @brief Insert a pair of values into a wire vector
     */
    static void insert_pair_into_wire(std::vector<FF>& wire, const FF& first, const FF& second)
    {
        wire.push_back(first);
        wire.push_back(second);
    }

    /**
     * @brief Populate first 4 wires from UltraOp data
     */
    static void populate_wires_from_ultra_op(std::array<std::vector<FF>, Flavor::NUM_WIRES>& wire_values,
                                             const UltraOp& ultra_op);

    /**
     * @brief Create witness values for a single accumulation gate
     */
    static void create_accumulation_gate(std::array<std::vector<FF>, Flavor::NUM_WIRES>& wire_values,
                                         size_t& num_rows,
                                         const AccumulationInput& acc_step);

    /**
     * @brief Process the op queue and generate all witness data into wire_values
     */
    void compute_witness_from_op_queue(std::array<std::vector<FF>, Flavor::NUM_WIRES>& wire_values,
                                       size_t& num_rows,
                                       const std::shared_ptr<ECCOpQueue>& ecc_op_queue,
                                       bool avm_mode);
};
} // namespace bb
