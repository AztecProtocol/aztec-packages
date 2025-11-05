// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "./eccvm_builder_types.hpp"
#include "./msm_builder.hpp"
#include "./precomputed_tables_builder.hpp"
#include "./transcript_builder.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/relations/relation_parameters.hpp"

namespace bb {

class ECCVMCircuitBuilder {
  public:
    using CycleGroup = bb::g1;
    using FF = grumpkin::fr;
    using Polynomial = bb::Polynomial<FF>;

    using CycleScalar = typename CycleGroup::Fr;
    using Element = typename CycleGroup::element;
    using AffineElement = typename CycleGroup::affine_element;

    static constexpr size_t NUM_SCALAR_BITS = bb::eccvm::NUM_SCALAR_BITS;
    static constexpr size_t NUM_WNAF_DIGIT_BITS = bb::eccvm::NUM_WNAF_DIGIT_BITS;
    static constexpr size_t NUM_WNAF_DIGITS_PER_SCALAR = bb::eccvm::NUM_WNAF_DIGITS_PER_SCALAR;
    static constexpr uint64_t WNAF_MASK = bb::eccvm::WNAF_MASK;
    static constexpr size_t POINT_TABLE_SIZE = bb::eccvm::POINT_TABLE_SIZE;
    static constexpr size_t WNAF_DIGITS_PER_ROW = bb::eccvm::WNAF_DIGITS_PER_ROW;
    static constexpr size_t ADDITIONS_PER_ROW = bb::eccvm::ADDITIONS_PER_ROW;

    std::shared_ptr<ECCOpQueue> op_queue;
    // `ScalarMul` represents a single scalar multiplication, i.e., a pair of a scalar and point on the curve,
    // which will eventually be multiplied and accumulated.
    using ScalarMul = bb::eccvm::ScalarMul<CycleGroup>;
    // `MSM` is an ordered container of `ScalarMul`s
    using MSM = bb::eccvm::MSM<CycleGroup>;
    ECCVMCircuitBuilder(std::shared_ptr<ECCOpQueue>& op_queue)
        : op_queue(op_queue) {};

    [[nodiscard]] uint32_t get_number_of_muls() const { return op_queue->get_number_of_muls(); }

    std::vector<MSM> get_msms() const
    {
        const uint32_t num_muls = get_number_of_muls();

        // `compute_precomputed_table` and `compute_wnaf_digits` are helper functions that will be used when we
        // populate our vector of MSMs.

        /**
         * For input point [P], return { -15[P], -13[P], ..., -[P], [P], ..., 13[P], 15[P] }
         * this "precomputed table" will be an entry in `ScalarMuls` corresponding to [P]
         */
        const auto compute_precomputed_table =
            [](const AffineElement& base_point) -> std::array<AffineElement, POINT_TABLE_SIZE + 1> {
            const auto d2 = Element(base_point).dbl();
            std::array<Element, POINT_TABLE_SIZE + 1> table;
            table[POINT_TABLE_SIZE] = d2; // need this for later
            table[POINT_TABLE_SIZE / 2] = base_point;
            for (size_t i = 1; i < POINT_TABLE_SIZE / 2; ++i) {
                table[i + POINT_TABLE_SIZE / 2] = Element(table[i + POINT_TABLE_SIZE / 2 - 1]) + d2;
            }
            for (size_t i = 0; i < POINT_TABLE_SIZE / 2; ++i) {
                table[i] = -table[POINT_TABLE_SIZE - 1 - i];
            }

            Element::batch_normalize(&table[0], POINT_TABLE_SIZE + 1);
            std::array<AffineElement, POINT_TABLE_SIZE + 1> result;
            for (size_t i = 0; i < POINT_TABLE_SIZE + 1; ++i) {
                result[i] = AffineElement(table[i].x, table[i].y);
            }
            return result;
        };
        /**
         * Computes the WNAF representation of `scalar`. When `scalar` is even, we represent this by adding 1 to the
         * least-significant slice. we will also later set the `skew` boolean to True when we populate `ScalarMul`.
         * (this is necessary because otherwise we would only be able to represent odd multiples of our point.)
         * Note also that in our applications, `NUM_WNAF_DIGITS_PER_SCALAR = 32`; this corresponds to the fact that we
         * split up our scalar into two 128 bit numbers, using the endomorphism of the curve (corresponding to a
         * primitive cube root of unity).
         *
         */
        const auto compute_wnaf_digits = [](uint256_t scalar) -> std::array<int, NUM_WNAF_DIGITS_PER_SCALAR> {
            std::array<int, NUM_WNAF_DIGITS_PER_SCALAR> output;
            int previous_slice = 0;
            for (size_t i = 0; i < NUM_WNAF_DIGITS_PER_SCALAR; ++i) {
                // slice the scalar into 4-bit chunks, starting with the least significant bits
                uint64_t raw_slice = static_cast<uint64_t>(scalar) & WNAF_MASK;

                bool is_even = ((raw_slice & 1ULL) == 0ULL);

                int wnaf_slice = static_cast<int>(raw_slice);

                if (i == 0 && is_even) {
                    // if least significant slice is even, we add 1 to create an odd value && set 'skew' to true
                    wnaf_slice += 1;
                } else if (is_even) {
                    // for other slices, if it's even, we add 1 to the slice value, again to create an odd value,
                    // and subtract 16 from the previous slice to preserve the total scalar sum
                    static constexpr int borrow_constant = static_cast<int>(1ULL << NUM_WNAF_DIGIT_BITS);
                    previous_slice -= borrow_constant;
                    wnaf_slice += 1;
                }

                if (i > 0) {
                    const size_t idx = i - 1;
                    output[NUM_WNAF_DIGITS_PER_SCALAR - idx - 1] = previous_slice;
                }
                previous_slice = wnaf_slice;

                // downshift raw_slice by 4 bits
                scalar = scalar >> NUM_WNAF_DIGIT_BITS;
            }

            BB_ASSERT_EQ(scalar, 0U);

            output[0] = previous_slice;

            return output;
        };
        // the variables and vectors here correspond to the EC ops that we will actually do; in particular, we have
        // compilation skipping logic for both when the scalar is 0 and when the EC point is the point-at-infinity, as
        // terms of each of these types do not contribute to the final sum.

        // more precisely, we will break up our op_queue into a sequence of MSMs, where we throw away computations that
        // obviously don't contribute to the final desired value.
        size_t msm_count = 0; // total number of MSMs
        size_t active_mul_count =
            0; // number of scalar multiplications required in the current MSM. Given a scalar n in F_q and a point P,
               // we in general get *two* scalar multiplications, as we break up n into 128-bit chunks (using the extra
               // endomorphism). this is an optimization.
        std::vector<size_t>
            msm_opqueue_index; // a vector recording which op from the op_queue we are performing in our VM.
        std::vector<std::pair<size_t, size_t>>
            msm_mul_index; // recording pairs, where the first element specifies "which MSM are we in" (via an index)
                           // and the second element specifies "which scalar multiplication is this in our VM simulation
                           // of this  MSM". note that the second element, the `active_mul_count`, incorporates some
                           // skipping logic: what contributes to it are multiplications we actually need to perform.
                           // generically each scalar multiplication contributes to 2 VM mul operations, as we
                           // split up each Fq element into 2 128-bit elements.
        std::vector<size_t> msm_sizes;

        const auto& eccvm_ops = op_queue->get_eccvm_ops();
        size_t op_idx = 0;
        // populate opqueue and mul indices
        for (const auto& op : eccvm_ops) {
            if (op.op_code.mul) {
                if ((op.z1 != 0 || op.z2 != 0) && !op.base_point.is_point_at_infinity()) {
                    msm_opqueue_index.push_back(op_idx);
                    msm_mul_index.emplace_back(msm_count, active_mul_count);
                    active_mul_count += static_cast<size_t>(op.z1 != 0) + static_cast<size_t>(op.z2 != 0);
                }
            } else if (active_mul_count > 0) {
                msm_sizes.push_back(active_mul_count);
                msm_count++;
                active_mul_count = 0;
            }
            op_idx++;
        }
        // if last op is a mul we have not correctly computed the total number of msms
        if (!eccvm_ops.empty() && eccvm_ops.back().op_code.mul && active_mul_count > 0) {
            msm_sizes.push_back(active_mul_count);
            msm_count++;
        }

        std::vector<MSM> result(
            msm_count); // the vector we will return, containing all of the MSMs that our VM will have to perform.
                        // this amounts to breaking up our op-queue, splitting the elmenets of Fq into two 128
                        // bit scalars, and throwing out operations that a priori won't contribute.
        for (size_t i = 0; i < msm_count; ++i) {
            auto& msm = result[i];
            msm.resize(msm_sizes[i]);
        }
        // populate result using the auxiliary vectors `msm_opqueue_index` and `msm_mul_index`, together with
        // `eccvm_ops`. this first pass will *not* get the pc (point counter) correct. we explain why when we set it
        // correctly.
        parallel_for_range(msm_opqueue_index.size(), [&](size_t start, size_t end) {
            for (size_t i = start; i < end; i++) {
                const auto& op = eccvm_ops[msm_opqueue_index[i]];
                auto [msm_index, mul_index] = msm_mul_index[i];
                if (op.z1 != 0 && !op.base_point.is_point_at_infinity()) {
                    BB_ASSERT_GT(result.size(), msm_index);
                    BB_ASSERT_GT(result[msm_index].size(), mul_index);
                    result[msm_index][mul_index] = (ScalarMul{
                        .pc = 0,
                        .scalar = op.z1,
                        .base_point = op.base_point,
                        .wnaf_digits = compute_wnaf_digits(op.z1),
                        .wnaf_skew = (op.z1 & 1) == 0,
                        .precomputed_table = compute_precomputed_table(op.base_point),
                    });
                    mul_index++;
                }
                if (op.z2 != 0 && !op.base_point.is_point_at_infinity()) {
                    BB_ASSERT_GT(result.size(), msm_index);
                    BB_ASSERT_GT(result[msm_index].size(), mul_index);
                    auto endo_point = AffineElement{ op.base_point.x * FF::cube_root_of_unity(), -op.base_point.y };
                    result[msm_index][mul_index] = (ScalarMul{
                        .pc = 0,
                        .scalar = op.z2,
                        .base_point = endo_point,
                        .wnaf_digits = compute_wnaf_digits(op.z2),
                        .wnaf_skew = (op.z2 & 1) == 0,
                        .precomputed_table = compute_precomputed_table(endo_point),
                    });
                }
            }
        });

        // update pc. easier to do this serially but in theory could be optimized out
        // We start pc at `num_muls` and decrement for each mul processed.
        // This gives us two desired properties:
        // 1: the value of pc at the 1st row = number of muls (easy to check)
        // 2: the value of pc for the final mul = 1
        // The latter point is valuable as it means that we can add empty rows (where pc = 0) and still satisfy our
        // sumcheck relations that involve pc (if we did the other way around, starting at 1 and ending at num_muls,
        // we create a discontinuity in pc values between the last transcript row and the following empty row).
        // TL;DR we choose a decreasing `pc` so that the subsequent entries of the column (after the last entry) are 0.
        // this is simply an optimization.
        uint32_t pc = num_muls;
        for (auto& msm : result) {
            for (auto& mul : msm) {
                mul.pc = pc;
                pc--;
            }
        }

        BB_ASSERT_EQ(pc, 0U);
        return result;
    }

    static std::vector<ScalarMul> get_flattened_scalar_muls(const std::vector<MSM>& msms)
    {
        std::vector<ScalarMul> result;
        for (const auto& msm : msms) {
            for (const auto& mul : msm) {
                result.push_back(mul);
            }
        }
        return result;
    }

    [[nodiscard]] size_t get_estimated_num_finalized_gates() const
    {
        // TODO(https://github.com/AztecProtocol/aztec-packages/issues/2218): Reduce the amount of computation needed
        // for this method
        return op_queue->get_num_rows();
    }

    [[nodiscard]] size_t get_circuit_subgroup_size(const size_t num_rows) const
    {

        const auto num_rows_log2 = static_cast<size_t>(numeric::get_msb64(num_rows + NUM_DISABLED_ROWS_IN_SUMCHECK));
        size_t num_rows_pow2 = 1UL << (num_rows_log2 + (1UL << num_rows_log2 == num_rows ? 0 : 1));
        return num_rows_pow2;
    }
};
} // namespace bb
