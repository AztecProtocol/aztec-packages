// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"

namespace bb {

/**
 * @brief TranslatorWitnessData computes and stores witness values for the Translator circuit.
 *
 * @details This is a lightweight replacement for TranslatorCircuitBuilder that directly stores
 * field element values in wire arrays instead of using variable indices. This simplifies the
 * data flow from op queue to proving key polynomials.
 *
 * The Translator circuit evaluates the correctness of batched evaluation of EccOpQueue polynomials
 * in non-native field arithmetic (Fq operations using Fr scalars). For each operation, it computes:
 *   accumulator = previous_accumulator * x + op + P.x*v + P.y*v² + z1*v³ + z2*v⁴
 *
 * Wire values are stored directly as FF (Fr) elements, ready to be copied into polynomials.
 */
class TranslatorWitnessData {
  public:
    // The scalar field of BN254
    using Fr = bb::fr;
    // The base (coordinate) field of BN254
    using Fq = bb::fq;

    // =============================================================================================
    // Constants - these mirror the values from TranslatorFlavor
    // =============================================================================================

    static constexpr size_t NUM_WIRES = 81;

    // Maximum size of a single limb is 68 bits
    static constexpr size_t NUM_LIMB_BITS = 68;

    // For soundness we need to constrain the highest limb so that the whole value is at most 50 bits
    static constexpr size_t NUM_LAST_LIMB_BITS = Fq::modulus.get_msb() + 1 - (3 * NUM_LIMB_BITS);

    // 128-bit z_1 and z_2 are split into 2 limbs each
    static constexpr size_t NUM_Z_LIMBS = 2;

    // Number of bits in the quotient representation
    static constexpr size_t NUM_QUOTIENT_BITS = 256;

    // Number of bits in the quotient highest limb
    static constexpr size_t NUM_LAST_QUOTIENT_LIMB_BITS = 256 - (3 * NUM_LIMB_BITS);

    // Number of bits in Z scalars
    static constexpr size_t NUM_Z_BITS = 128;

    // Range constraint mechanism uses 14-bit microlimbs
    static constexpr size_t MICRO_LIMB_BITS = 14;

    // Maximum size of a micro limb used for range constraints
    static constexpr auto MAX_MICRO_LIMB_SIZE = (uint256_t(1) << MICRO_LIMB_BITS) - 1;

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

    // Index at which the accumulation result is stored in the circuit
    static constexpr size_t RESULT_ROW = 8;
    static constexpr size_t NUM_NO_OPS_START = 1;

    // Number of random ops at the beginning of Translator trace
    static constexpr size_t NUM_RANDOM_OPS_START = 3;

    // Number of random ops at the end of Translator trace
    static constexpr size_t NUM_RANDOM_OPS_END = 2;

    // Shift constants for limb operations
    static constexpr auto SHIFT_1 = uint256_t(1) << NUM_LIMB_BITS;
    static constexpr auto SHIFT_2 = uint256_t(1) << (NUM_LIMB_BITS << 1);
    static constexpr auto SHIFT_2_INVERSE = Fr(SHIFT_2).invert();
    static constexpr auto SHIFT_3 = uint256_t(1) << (NUM_LIMB_BITS * 3);

    // Modulus constants for CRT computation
    static constexpr uint512_t MODULUS_U512 = uint512_t(Fq::modulus);
    static constexpr uint512_t BINARY_BASIS_MODULUS = uint512_t(1) << (NUM_LIMB_BITS << 2);
    static constexpr uint512_t NEGATIVE_PRIME_MODULUS = BINARY_BASIS_MODULUS - MODULUS_U512;
    static constexpr std::array<Fr, 5> NEGATIVE_MODULUS_LIMBS = {
        Fr(NEGATIVE_PRIME_MODULUS.slice(0, NUM_LIMB_BITS).lo),
        Fr(NEGATIVE_PRIME_MODULUS.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2).lo),
        Fr(NEGATIVE_PRIME_MODULUS.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3).lo),
        Fr(NEGATIVE_PRIME_MODULUS.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4).lo),
        -Fr(Fq::modulus)
    };

    /**
     * @brief Wire index enumeration - matches the wire layout expected by TranslatorFlavor
     */
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
    static_assert(TOTAL_COUNT == NUM_WIRES);

    /**
     * @brief The accumulation input structure contains all the necessary values to create an accumulation gate
     */
    struct AccumulationInput {
        UltraOp ultra_op;
        std::array<Fr, NUM_BINARY_LIMBS> P_x_limbs;
        std::array<std::array<Fr, NUM_MICRO_LIMBS>, NUM_BINARY_LIMBS> P_x_microlimbs;
        std::array<Fr, NUM_BINARY_LIMBS> P_y_limbs;
        std::array<std::array<Fr, NUM_MICRO_LIMBS>, NUM_BINARY_LIMBS> P_y_microlimbs;
        std::array<Fr, NUM_Z_LIMBS> z_1_limbs;
        std::array<std::array<Fr, NUM_MICRO_LIMBS>, NUM_Z_LIMBS> z_1_microlimbs;
        std::array<Fr, NUM_Z_LIMBS> z_2_limbs;
        std::array<std::array<Fr, NUM_MICRO_LIMBS>, NUM_Z_LIMBS> z_2_microlimbs;
        std::array<Fr, NUM_BINARY_LIMBS> previous_accumulator;
        std::array<Fr, NUM_BINARY_LIMBS> current_accumulator;
        std::array<std::array<Fr, NUM_MICRO_LIMBS>, NUM_BINARY_LIMBS> current_accumulator_microlimbs;
        std::array<Fr, NUM_BINARY_LIMBS> quotient_binary_limbs;
        std::array<std::array<Fr, NUM_MICRO_LIMBS>, NUM_BINARY_LIMBS> quotient_microlimbs;
        std::array<Fr, NUM_RELATION_WIDE_LIMBS> relation_wide_limbs;
        std::array<std::array<Fr, NUM_MICRO_LIMBS>, NUM_RELATION_WIDE_LIMBS> relation_wide_microlimbs;
    };

    // =============================================================================================
    // Data Members
    // =============================================================================================

    // The challenge that is used for batching together evaluations of several polynomials
    Fq batching_challenge_v;

    // The input we evaluate polynomials on
    Fq evaluation_input_x;

    // Wire values stored directly as field elements (no variable index indirection)
    std::array<std::vector<Fr>, NUM_WIRES> wire_values;

    // Number of rows in the witness
    size_t num_rows_ = 0;

    // AVM mode flag
    bool avm_mode = false;

    // =============================================================================================
    // Constructors
    // =============================================================================================

    TranslatorWitnessData() = default;

    /**
     * @brief Construct witness data from challenges only (for testing)
     */
    TranslatorWitnessData(Fq batching_challenge_v_, Fq evaluation_input_x_, bool avm_mode_ = false)
        : batching_challenge_v(batching_challenge_v_)
        , evaluation_input_x(evaluation_input_x_)
        , avm_mode(avm_mode_)
    {}

    /**
     * @brief Construct witness data from an op queue and challenges
     */
    TranslatorWitnessData(Fq batching_challenge_v_,
                          Fq evaluation_input_x_,
                          const std::shared_ptr<ECCOpQueue>& op_queue,
                          bool avm_mode_ = false);

    // =============================================================================================
    // Accessors
    // =============================================================================================

    size_t num_rows() const { return num_rows_; }

    /**
     * @brief Get the value at a specific wire and row index
     */
    Fr get_wire_value(size_t wire_idx, size_t row_idx) const
    {
        BB_ASSERT(wire_idx < NUM_WIRES);
        BB_ASSERT(row_idx < wire_values[wire_idx].size());
        return wire_values[wire_idx][row_idx];
    }

    // =============================================================================================
    // Static Helper Methods
    // =============================================================================================

    /**
     * @brief Transform a native element Fq into its bigfield representation in Fr scalars
     */
    static std::array<Fr, NUM_BINARY_LIMBS> split_fq_into_limbs(const Fq& base)
    {
        uint256_t base_uint = base;
        return std::array<Fr, NUM_BINARY_LIMBS>({
            Fr(base_uint.slice(0, NUM_LIMB_BITS)),
            Fr(base_uint.slice(NUM_LIMB_BITS, 2 * NUM_LIMB_BITS)),
            Fr(base_uint.slice(2 * NUM_LIMB_BITS, 3 * NUM_LIMB_BITS)),
            Fr(base_uint.slice(3 * NUM_LIMB_BITS, 4 * NUM_LIMB_BITS)),
        });
    }

    /**
     * @brief Generate witness values for one step of accumulation
     */
    static AccumulationInput generate_witness_values(const UltraOp& ultra_op,
                                                     const Fq& previous_accumulator,
                                                     const Fq& batching_challenge_v,
                                                     const Fq& evaluation_input_x);

    /**
     * @brief Validate that an UltraOp is well-formed
     */
    static void assert_well_formed_ultra_op(const UltraOp& ultra_op);

    /**
     * @brief Validate that an AccumulationInput is well-formed
     */
    static void assert_well_formed_accumulation_input(const AccumulationInput& acc_step);

  private:
    // =============================================================================================
    // Internal Helper Methods
    // =============================================================================================

    /**
     * @brief Add a zero value to all wires (used for padding)
     */
    void push_zero_row()
    {
        for (auto& wire : wire_values) {
            wire.push_back(Fr::zero());
        }
        num_rows_++;
    }

    /**
     * @brief Insert a pair of values into a wire
     */
    void insert_pair_into_wire(WireIdx wire_idx, const Fr& first, const Fr& second)
    {
        wire_values[wire_idx].push_back(first);
        wire_values[wire_idx].push_back(second);
    }

    /**
     * @brief Populate wires from UltraOp data
     */
    void populate_wires_from_ultra_op(const UltraOp& ultra_op);

    /**
     * @brief Create witness values for a single accumulation gate
     */
    void create_accumulation_gate(const AccumulationInput& acc_step);

    /**
     * @brief Process the op queue and generate all witness data
     */
    void feed_ecc_op_queue_into_circuit(const std::shared_ptr<ECCOpQueue>& ecc_op_queue);
};

} // namespace bb
