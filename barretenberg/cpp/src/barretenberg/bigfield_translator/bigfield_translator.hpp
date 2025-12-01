// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/goblin/translation_evaluations.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

namespace bb {

/**
 * @brief Computes the translator accumulation using bigfield arithmetic instead of a custom VM.
 *
 * @details The translator's job is to verify that:
 *   x * accumulated_result = Σ(op_i + v*Px_i + v²*Py_i + v³*z1_i + v⁴*z2_i) * x^{N-1-i}
 *
 * where:
 *   - x is the evaluation challenge from ECCVM
 *   - v is the batching challenge from ECCVM
 *   - op_i, Px_i, Py_i, z1_i, z2_i are the columns of the op queue (in Fq)
 *   - N is the number of rows
 *
 * This class uses vertical batching with optimal batch size (256) to minimize circuit size:
 *   1. Precompute x^0, x^1, ..., x^255 (256 sequential powers)
 *   2. Compute batch multipliers x^256, x^512, ... via binary exponentiation
 *   3. For each column, compute column_sum = Σ(col_i * x^{N-1-i}) using batched mult_madd
 *   4. Combine: result = op_sum + v*px_sum + v²*py_sum + v³*z1_sum + v⁴*z2_sum
 *
 * Circuit size: ~55,168 gates (2^15.75) vs Translator's 131,072 (2^17) = 58% reduction
 */
class BigfieldTranslator {
  public:
    using Builder = MegaCircuitBuilder;
    using Fr = curve::BN254::ScalarField;
    using Fq = curve::BN254::BaseField;
    using fq_ct = stdlib::bigfield<Builder, bb::Bn254FqParams>;
    using TranslationEvaluations = TranslationEvaluations_<Fq>;

    // Optimal batch size determined by gate count analysis
    static constexpr size_t BATCH_SIZE = 256;

    /**
     * @brief Populate the builder's ecc_op block from the op_queue.
     *
     * @details This creates witnesses for all op_queue entries and populates the
     * ecc_op block. Must be called before compute_accumulator if the builder
     * doesn't already have the ecc_op block populated (e.g., for a standalone
     * translator circuit).
     *
     * @param builder The circuit builder
     * @param op_queue The ECC op queue containing the operation data
     */
    static void populate_ecc_op_block(Builder& builder, const std::shared_ptr<ECCOpQueue>& op_queue);

    /**
     * @brief Compute the translator accumulation result using bigfield arithmetic.
     *
     * @details Uses the witness indices from the builder's ecc_op block directly,
     * ensuring the computation is linked to the same witnesses used by the kernel
     * and merge protocol.
     *
     * @param builder The circuit builder (must have ecc_op block populated)
     * @param evaluation_challenge_x The evaluation point x from ECCVM (as circuit witness)
     * @param batching_challenge_v The batching challenge v from ECCVM (as circuit witness)
     * @param use_predecomposed_limbs If true, assumes Px/Py coordinates are pre-decomposed into
     *        68-bit limbs and range-constrained in kernels. Uses unsafe_construct_from_limbs
     *        which skips decomposition and range constraints, reducing circuit size from 2^19 to 2^18.
     *        If false (default), uses the standard fq_ct(lo, hi) constructor with full range constraints.
     * @return fq_ct The accumulated result (as a bigfield circuit type)
     */
    static fq_ct compute_accumulator(Builder& builder,
                                     const fq_ct& evaluation_challenge_x,
                                     const fq_ct& batching_challenge_v,
                                     bool use_predecomposed_limbs = false);

    /**
     * @brief Native computation of the translator accumulation (for testing/verification).
     *
     * @param evaluation_challenge_x The evaluation point x
     * @param batching_challenge_v The batching challenge v
     * @param op_queue The ECC op queue
     * @return Fq The accumulated result
     */
    static Fq compute_accumulator_native(const Fq& evaluation_challenge_x,
                                         const Fq& batching_challenge_v,
                                         const std::shared_ptr<ECCOpQueue>& op_queue);

  private:
    /**
     * @brief Compute the sum of a column weighted by descending powers of x.
     *
     * @details Uses batched mult_madd with optimal batch size for efficiency.
     * For column values c_0, c_1, ..., c_{N-1}, computes:
     *   sum = c_0 * x^{N-1} + c_1 * x^{N-2} + ... + c_{N-1} * x^0
     *
     * @param column The column values (as bigfield witnesses)
     * @param x_powers_base The base powers x^0, x^1, ..., x^{BATCH_SIZE-1}
     * @param batch_multipliers The batch scaling factors x^{k*BATCH_SIZE}
     * @param num_rows Total number of rows
     * @return fq_ct The weighted sum
     */
    static fq_ct compute_column_sum(const std::vector<fq_ct>& column,
                                    const std::vector<fq_ct>& x_powers_base,
                                    const std::vector<fq_ct>& batch_multipliers,
                                    size_t num_rows);
};

} // namespace bb
