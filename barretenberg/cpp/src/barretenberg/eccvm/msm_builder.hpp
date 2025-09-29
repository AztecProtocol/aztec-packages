// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include <cstddef>

#include "./eccvm_builder_types.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_bn254_impl.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"

namespace bb {

class ECCVMMSMMBuilder {
  public:
    using CycleGroup = curve::BN254::Group;
    using FF = curve::Grumpkin::ScalarField;
    using Element = typename CycleGroup::element;
    using AffineElement = typename CycleGroup::affine_element;
    using MSM = bb::eccvm::MSM<CycleGroup>;

    static constexpr size_t ADDITIONS_PER_ROW = bb::eccvm::ADDITIONS_PER_ROW;
    static constexpr size_t NUM_WNAF_DIGITS_PER_SCALAR = bb::eccvm::NUM_WNAF_DIGITS_PER_SCALAR;

    struct alignas(64) MSMRow {
        uint32_t pc = 0;       // decreasing point-counter, over all half-length (128 bit) scalar muls used to compute
                               // the required MSMs. however, this value is _constant_ on a given MSM and more precisely
                               //  refers to the number of half-length scalar muls completed up until we have started
                               // the current MSM.
        uint32_t msm_size = 0; // the number of points in (a.k.a. the length of) the MSM in whose computation
                               // this VM row participates
        uint32_t msm_count = 0; // number of multiplications processed so far (not including this row) in current MSM
                                // round (a.k.a. wNAF digit slot). this specifically refers to the number of wNAF-digit
                                // * point scalar products we have looked up and accumulated.
        uint32_t msm_round = 0; // current "round" of MSM, in {0, ..., 32 = `NUM_WNAF_DIGITS_PER_SCALAR`}. With the
                                // Straus algorithm, we proceed wNAF digit by wNAF digit, from left to right. (final
                                // round deals with the `skew` bit.)
        bool msm_transition = false; // is 1 if the current row *starts* the processing of a different MSM, else 0.
        bool q_add = false;
        bool q_double = false;
        bool q_skew = false;

        // Each row in the MSM portion of the ECCVM can handle (up to) 4 point-additions.
        // For each row in the VM we represent the point addition data via a size-4 array of
        // AddState objects.
        struct AddState {
            bool add = false; // are we adding a point at this location in the VM?
                              // e.g if the MSM is of size-2 then the 3rd and 4th AddState objects will have this set
                              // to `false`.
            int slice = 0; // wNAF slice value. This has values in {0, ..., 15} and corresponds to an odd number in the
                           // range {-15, -13, ..., 15} via the monotonic bijection.
            AffineElement point{ 0, 0 }; // point being added into the accumulator. (This is of the form nP,
                                         // where n is in {-15, -13, ..., 15}.)
            FF lambda = 0; // when adding `point` into the accumulator via Affine point addition, the value of `lambda`
                           // (i.e., the slope of the line). (we need this as a witness in the circuit.)
            FF collision_inverse = 0; // `collision_inverse` is used to validate we are not hitting point addition edge
                                      // case exceptions, i.e., we want the VM proof to fail if we're doing a point
                                      // addition where (x1 == x2). to do this, we simply provide an inverse to x1 - x2.
        };
        std::array<AddState, 4> add_state{ AddState{ false, 0, { 0, 0 }, 0, 0 },
                                           AddState{ false, 0, { 0, 0 }, 0, 0 },
                                           AddState{ false, 0, { 0, 0 }, 0, 0 },
                                           AddState{ false, 0, { 0, 0 }, 0, 0 } };
        // The accumulator here is, in general, the result of four EC additions: A + Q_1 + Q_2 + Q_3 + Q_4.
        // We do not explicitly store the intermediate values A + Q_1, A + Q_1 + Q_2, and A + Q_1 + Q_2 + Q_3, although
        // these values are implicitly used in the values of `AddState.lambda` and `AddState.collision_inverse`.

        FF accumulator_x = 0; // `(accumulator_x, accumulator_y)` is the accumulator to which I potentially want to add
                              // the points in `add_state`.
        FF accumulator_y = 0; // `(accumulator_x, accumulator_y)` is the accumulator to which I potentially want to add
                              // the points in `add_state`.
    };

    /**
     * @brief Computes the row values for the Straus MSM columns of the ECCVM.
     *
     * For a detailed description of the Straus algorithm and its relation to the ECCVM, please see
     * https://hackmd.io/@aztec-network/rJ5xhuCsn or, alternatively, the [ECCVM readme](README.md).
     *
     * @param msms A vector of vectors of `ScalarMul`s, a.k.a. a vector of `MSM`s.
     * @param point_table_read_counts Table of read counts to be populated.
     * @param total_number_of_muls A mul op in the OpQueue adds up to two muls, one for each nonzero z_i (i=1,2).
     * @param num_msm_rows
     * @return std::vector<MSMRow>
     */
    static std::tuple<std::vector<MSMRow>, std::array<std::vector<size_t>, 2>> compute_rows(
        const std::vector<MSM>& msms, const uint32_t total_number_of_muls, const size_t num_msm_rows)
    {
        // To perform a scalar multiplication of a point P by a scalar x, we precompute a table of points
        //                           -15P, -13P, ..., -3P, -P, P, 3P, ..., 15P
        // When we perform a scalar multiplication, we decompose x into base-16 wNAF digits then look these precomputed
        // values up with digit-by-digit. As we are performing lookups with the log-derivative argument, we have to
        // record read counts. We record read counts in a table with the following structure:
        //   1st write column = positive wNAF digits
        //   2nd write column = negative wNAF digits
        // the row number is a function of pc and wnaf digit:
        //   point_idx = total_number_of_muls - pc
        //   row      = point_idx * rows_per_point_table + (some function of the slice value)
        //
        // Illustration:
        //   Block Structure:
        //      | 0 | 1 |
        //      | - | - |
        //    1 | # | # | -1
        //    3 | # | # | -3
        //    5 | # | # | -5
        //    7 | # | # | -7
        //    9 | # | # | -9
        //   11 | # | # | -11
        //   13 | # | # | -13
        //   15 | # | # | -15
        //
        //   Table structure:
        //    | Block_{0}                      | <-- pc = total_number_of_muls
        //    | Block_{1}                      | <-- pc = total_number_of_muls-(num muls in msm 0)
        //    |   ...                          | ...
        //    | Block_{total_number_of_muls-1} | <-- pc = num muls in last msm

        const size_t num_rows_in_read_counts_table =
            static_cast<size_t>(total_number_of_muls) *
            (eccvm::POINT_TABLE_SIZE >> 1); // `POINT_TABLE_SIZE` is 2ʷ, where in our case w = 4. As noted above, with
                                            // respect to *read counts*, we are record looking up the positive and
                                            // negative odd multiples of [P] in two separate columns, each of size 2ʷ⁻¹.
        std::array<std::vector<size_t>, 2> point_table_read_counts;
        point_table_read_counts[0].reserve(num_rows_in_read_counts_table);
        point_table_read_counts[1].reserve(num_rows_in_read_counts_table);
        for (size_t i = 0; i < num_rows_in_read_counts_table; ++i) {
            point_table_read_counts[0].emplace_back(0);
            point_table_read_counts[1].emplace_back(0);
        }

        const auto update_read_count = [&point_table_read_counts](const size_t point_idx, const int slice) {
            /**
             * The wNAF digits for base 16 lie in the range -15, -13, ..., 13, 15.
             * The *point table* format is the following:
             * (for positive point table) T[0] =  P, T[1] =  3P, ..., T[7]  =  15P
             * (for negative point table) T[0] = -P, T[1] = -3P, ..., T[15] = -15P
             * i.e. if the slice value is negative, we can use the compressed WNAF directly as the table index
             *      if the slice value is positive, we must take 15 - (compressed wNAF) to get the table index
             */
            const size_t row_index_offset = point_idx * 8;
            const bool digit_is_negative = slice < 0;
            const auto relative_row_idx = static_cast<size_t>((slice + 15) / 2);
            const size_t column_index = digit_is_negative ? 1 : 0;

            if (digit_is_negative) {
                point_table_read_counts[column_index][row_index_offset + relative_row_idx]++;
            } else {
                point_table_read_counts[column_index][row_index_offset + 15 - relative_row_idx]++;
            }
        };

        // compute which row index each multiscalar multiplication will start at.
        std::vector<size_t> msm_row_counts;
        msm_row_counts.reserve(msms.size() + 1);
        msm_row_counts.push_back(1);
        // compute the point counter (i.e. the index among all single scalar muls) that each multiscalar
        // multiplication will start at.
        std::vector<size_t> pc_values;
        pc_values.reserve(msms.size() + 1);
        pc_values.push_back(total_number_of_muls);
        for (const auto& msm : msms) {
            const size_t num_rows_required = EccvmRowTracker::num_eccvm_msm_rows(msm.size());
            msm_row_counts.push_back(msm_row_counts.back() + num_rows_required);
            pc_values.push_back(pc_values.back() - msm.size());
        }
        BB_ASSERT_EQ(pc_values.back(), 0U);

        // compute the MSM rows

        std::vector<MSMRow> msm_rows(num_msm_rows);
        // start with empty row (shiftable polynomials must have 0 as first coefficient)
        msm_rows[0] = (MSMRow{});
        // compute "read counts" so that we can determine the number of times entries in our log-derivative lookup
        // tables are called.
        // Note: this part is single-threaded. The amount of compute is low, however, so this is likely not a big
        // concern.
        for (size_t msm_idx = 0; msm_idx < msms.size(); ++msm_idx) {
            for (size_t digit_idx = 0; digit_idx < NUM_WNAF_DIGITS_PER_SCALAR; ++digit_idx) {
                auto pc = static_cast<uint32_t>(pc_values[msm_idx]);
                const auto& msm = msms[msm_idx];
                const size_t msm_size = msm.size();
                const size_t num_rows_per_digit =
                    (msm_size / ADDITIONS_PER_ROW) + ((msm_size % ADDITIONS_PER_ROW != 0) ? 1 : 0);

                for (size_t relative_row_idx = 0; relative_row_idx < num_rows_per_digit; ++relative_row_idx) {
                    const size_t num_points_in_row = (relative_row_idx + 1) * ADDITIONS_PER_ROW > msm_size
                                                         ? (msm_size % ADDITIONS_PER_ROW)
                                                         : ADDITIONS_PER_ROW;
                    const size_t offset = relative_row_idx * ADDITIONS_PER_ROW;
                    for (size_t relative_point_idx = 0; relative_point_idx < ADDITIONS_PER_ROW; ++relative_point_idx) {
                        const size_t point_idx = offset + relative_point_idx;
                        const bool add = num_points_in_row > relative_point_idx;
                        if (add) {
                            int slice = msm[point_idx].wnaf_digits[digit_idx];
                            // pc starts at total_number_of_muls and decreses non-uniformly to 0
                            update_read_count((total_number_of_muls - pc) + point_idx, slice);
                        }
                    }
                }

                // update the log-derivative read count for the lookup associated with WNAF skew
                if (digit_idx == NUM_WNAF_DIGITS_PER_SCALAR - 1) {
                    for (size_t row_idx = 0; row_idx < num_rows_per_digit; ++row_idx) {
                        const size_t num_points_in_row = (row_idx + 1) * ADDITIONS_PER_ROW > msm_size
                                                             ? (msm_size % ADDITIONS_PER_ROW)
                                                             : ADDITIONS_PER_ROW;
                        const size_t offset = row_idx * ADDITIONS_PER_ROW;
                        for (size_t relative_point_idx = 0; relative_point_idx < ADDITIONS_PER_ROW;
                             ++relative_point_idx) {
                            bool add = num_points_in_row > relative_point_idx;
                            const size_t point_idx = offset + relative_point_idx;
                            if (add) {
                                // `pc` starts at total_number_of_muls and decreases non-uniformly to 0.
                                // -15 maps to the 1st point in the lookup table (array element 0)
                                // -1 maps to the point in the lookup table that corresponds to the negation of the
                                // original input point (i.e. the point we need to add into the accumulator if wnaf_skew
                                // is positive)
                                int slice = msm[point_idx].wnaf_skew ? -1 : -15;
                                update_read_count((total_number_of_muls - pc) + point_idx, slice);
                            }
                        }
                    }
                }
            }
        }

        // The execution trace data for the MSM columns requires knowledge of intermediate values from *affine* point
        // addition. The naive solution to compute this data requires 2 field inversions per in-circuit group addition
        // evaluation. This is bad! To avoid this, we split the witness computation algorithm into 3 steps.
        //  Step 1: compute the execution trace group operations in *projective* coordinates. (these will be stored in
        //   `p1_trace`, `p2_trace`, and `p3_trace`)
        //  Step 2: use batch inversion trick to convert all points into affine coordinates
        //  Step 3: populate the full execution trace, including the intermediate values from affine group
        //   operations
        // This section sets up the data structures we need to store all intermediate ECC operations in projective form

        const size_t num_point_adds_and_doubles =
            (num_msm_rows - 2) * 4; // `num_msm_rows - 2` is the actual number of rows in the table required to compute
                                    // the MSM; the msm table itself has a dummy row at the beginning and an extra row
                                    // with the `x` and `y` coordinates of the accumulator at the end. (In general, the
                                    // output of the accumulator from the computation at row `i` is present on row
                                    // `i+1`. We multiply by 4 because each "row" of the VM processes 4 point-additions
                                    // (and the fact that w = 4 means we must interleave with 4 doublings). This
                                    // "corresponds" to the fact that `MSMROW.add_state` has 4 entries.
        const size_t num_accumulators = num_msm_rows - 1; // for every row after the first row, we have an accumulator.
        // In what follows, either p1 + p2 = p3, or p1.dbl() = p3
        // We create 1 vector to store the entire point trace. We split into multiple containers using std::span
        // (we want 1 vector object to more efficiently batch-normalize points)
        static constexpr size_t NUM_POINTS_IN_ADDITION_RELATION = 3;
        const size_t num_points_to_normalize =
            (num_point_adds_and_doubles * NUM_POINTS_IN_ADDITION_RELATION) + num_accumulators;
        std::vector<Element> points_to_normalize(num_points_to_normalize);
        std::span<Element> p1_trace(&points_to_normalize[0], num_point_adds_and_doubles);
        std::span<Element> p2_trace(&points_to_normalize[num_point_adds_and_doubles], num_point_adds_and_doubles);
        std::span<Element> p3_trace(&points_to_normalize[num_point_adds_and_doubles * 2], num_point_adds_and_doubles);
        // `is_double_or_add` records whether an entry in the p1/p2/p3 trace represents a point addition or
        // doubling. if it is `true`, then we are doubling (i.e., the condition is that `p3 = p1.dbl()`), else we are
        // adding (i.e., the condition is that `p3 = p1 + p2`).
        std::vector<bool> is_double_or_add(num_point_adds_and_doubles);
        // accumulator_trace tracks the value of the ECCVM accumulator for each row
        std::span<Element> accumulator_trace(&points_to_normalize[num_point_adds_and_doubles * 3], num_accumulators);

        // we start the accumulator at the offset generator point
        constexpr auto offset_generator = get_precomputed_generators<g1, "ECCVM_OFFSET_GENERATOR", 1>()[0];
        accumulator_trace[0] = offset_generator;

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/973): Reinstate multitreading?
        // populate point trace, and the components of the MSM execution trace that do not relate to affine point
        // operations
        for (size_t msm_idx = 0; msm_idx < msms.size(); msm_idx++) {
            Element accumulator = offset_generator; // for every MSM, we start with the same `offset_generator`
            const auto& msm = msms[msm_idx]; // which MSM we are processing. This is of type `std::vector<ScalarMul>`.
            size_t msm_row_index = msm_row_counts[msm_idx]; // the row where the given MSM starts
            const size_t msm_size = msm.size();
            const size_t num_rows_per_digit =
                (msm_size / ADDITIONS_PER_ROW) +
                (msm_size % ADDITIONS_PER_ROW !=
                 0); // the Straus algorithm proceeds by incrementing through the digit-slots and doing
                     // computations *across* the `ScalarMul`s that make up our MSM. Each digit-slot therefore
                     // contributes the *ceiling* of `msm_size`/`ADDITIONS_PER_ROW`.
            size_t trace_index =
                (msm_row_counts[msm_idx] - 1) * 4; // tracks the index in the traces of `p1`, `p2`, `p3`, and
                                                   // `accumulator_trace` that we are filling out

            // for each digit-slot (`digit_idx`), and then for each row of the VM (which does `ADDITIONS_PER_ROW` point
            // additions), we either enter in/process (`ADDITIONS_PER_ROW`) `AddState` objects, and then if necessary
            // (i.e., if not at the last wNAF digit), process the four doublings.
            for (size_t digit_idx = 0; digit_idx < NUM_WNAF_DIGITS_PER_SCALAR; ++digit_idx) {
                const auto pc = static_cast<uint32_t>(pc_values[msm_idx]); // pc that our msm starts at

                for (size_t row_idx = 0; row_idx < num_rows_per_digit; ++row_idx) {
                    const size_t num_points_in_row = (row_idx + 1) * ADDITIONS_PER_ROW > msm_size
                                                         ? (msm_size % ADDITIONS_PER_ROW)
                                                         : ADDITIONS_PER_ROW;
                    auto& row = msm_rows[msm_row_index]; // actual `MSMRow` we will fill out in the body of this loop
                    const size_t offset = row_idx * ADDITIONS_PER_ROW;
                    row.msm_transition = (digit_idx == 0) && (row_idx == 0);
                    // each iteration of this loop process/enters in one of the `AddState` objects in `row.add_state`.
                    for (size_t point_idx = 0; point_idx < ADDITIONS_PER_ROW; ++point_idx) {
                        auto& add_state = row.add_state[point_idx];
                        add_state.add = num_points_in_row > point_idx;
                        int slice = add_state.add ? msm[offset + point_idx].wnaf_digits[digit_idx] : 0;
                        // In the MSM columns in the ECCVM circuit, we can add up to 4 points per row.
                        // if `row.add_state[point_idx].add = 1`, this indicates that we want to add the
                        // `point_idx`'th point in the MSM columns into the MSM accumulator `add_state.slice` = A
                        // 4-bit WNAF slice of the scalar multiplier associated with the point we are adding (the
                        // specific slice chosen depends on the value of msm_round) (WNAF = our version of
                        // windowed-non-adjacent-form. Value range is `-15, -13,..., 15`)
                        // If `add_state.add = 1`, we want `add_state.slice` to be the *compressed*
                        // form of the WNAF slice value. (compressed = no gaps in the value range. i.e. -15,
                        // -13, ..., 15 maps to 0, ... , 15)
                        add_state.slice = add_state.add ? (slice + 15) / 2 : 0;
                        add_state.point =
                            add_state.add
                                ? msm[offset + point_idx].precomputed_table[static_cast<size_t>(add_state.slice)]
                                : AffineElement{ 0, 0 };

                        Element p1(accumulator);
                        Element p2(add_state.point);
                        accumulator = add_state.add ? (accumulator + add_state.point) : Element(p1);
                        p1_trace[trace_index] = p1;
                        p2_trace[trace_index] = p2;
                        p3_trace[trace_index] = accumulator;
                        is_double_or_add[trace_index] = false;
                        trace_index++;
                    }
                    // Now, `row.add_state` has been fully processed and we fill in the rest of the members of `row`.
                    accumulator_trace[msm_row_index] = accumulator;
                    row.q_add = true;
                    row.q_double = false;
                    row.q_skew = false;
                    row.msm_round = static_cast<uint32_t>(digit_idx);
                    row.msm_size = static_cast<uint32_t>(msm_size);
                    row.msm_count = static_cast<uint32_t>(offset);
                    row.pc = pc;
                    msm_row_index++;
                }
                // after processing each digit-slot, we now take care of doubling (as long as we are not at the last
                // digit). We add an `MSMRow`, `row`, whose four `AddState` objects in `row.add_state`
                // are null, but we also populate `p1_trace`, `p2_trace`, `p3_trace`, and `is_double_or_add` for four
                // indices, corresponding to the w=4 doubling operations we need to perform. This embodies the numerical
                // "coincidence" that `ADDITIONS_PER_ROW == NUM_WNAF_DIGIT_BITS`
                if (digit_idx < NUM_WNAF_DIGITS_PER_SCALAR - 1) {
                    auto& row = msm_rows[msm_row_index];
                    row.msm_transition = false;
                    row.msm_round = static_cast<uint32_t>(digit_idx + 1);
                    row.msm_size = static_cast<uint32_t>(msm_size);
                    row.msm_count = static_cast<uint32_t>(0);
                    row.q_add = false;
                    row.q_double = true;
                    row.q_skew = false;
                    for (size_t point_idx = 0; point_idx < ADDITIONS_PER_ROW; ++point_idx) {
                        auto& add_state = row.add_state[point_idx];
                        add_state.add = false;
                        add_state.slice = 0;
                        add_state.point = { 0, 0 };
                        add_state.collision_inverse = 0;

                        p1_trace[trace_index] = accumulator;
                        p2_trace[trace_index] = accumulator; // dummy
                        accumulator = accumulator.dbl();
                        p3_trace[trace_index] = accumulator;
                        is_double_or_add[trace_index] = true;
                        trace_index++;
                    }
                    accumulator_trace[msm_row_index] = accumulator;
                    msm_row_index++;
                } else // process `wnaf_skew`, i.e., the skew digit.
                {
                    for (size_t row_idx = 0; row_idx < num_rows_per_digit; ++row_idx) {
                        auto& row = msm_rows[msm_row_index];

                        const size_t num_points_in_row = (row_idx + 1) * ADDITIONS_PER_ROW > msm_size
                                                             ? msm_size % ADDITIONS_PER_ROW
                                                             : ADDITIONS_PER_ROW;
                        const size_t offset = row_idx * ADDITIONS_PER_ROW;
                        row.msm_transition = false;
                        Element acc_expected = accumulator;
                        for (size_t point_idx = 0; point_idx < ADDITIONS_PER_ROW; ++point_idx) {
                            auto& add_state = row.add_state[point_idx];
                            add_state.add = num_points_in_row > point_idx;
                            add_state.slice = add_state.add ? msm[offset + point_idx].wnaf_skew ? 7 : 0 : 0;

                            add_state.point =
                                add_state.add
                                    ? msm[offset + point_idx].precomputed_table[static_cast<size_t>(add_state.slice)]
                                    : AffineElement{
                                          0, 0
                                      }; // if the skew_bit is on, `slice == 7`. Then `precomputed_table[7] == -[P]`, as
                                         // required for the skew logic.
                            bool add_predicate = add_state.add ? msm[offset + point_idx].wnaf_skew : false;
                            auto p1 = accumulator;
                            accumulator = add_predicate ? accumulator + add_state.point : accumulator;
                            p1_trace[trace_index] = p1;
                            p2_trace[trace_index] = add_state.point;
                            p3_trace[trace_index] = accumulator;
                            is_double_or_add[trace_index] = false;
                            trace_index++;
                        }
                        row.q_add = false;
                        row.q_double = false;
                        row.q_skew = true;
                        row.msm_round = static_cast<uint32_t>(digit_idx + 1);
                        row.msm_size = static_cast<uint32_t>(msm_size);
                        row.msm_count = static_cast<uint32_t>(offset);
                        row.pc = pc;
                        accumulator_trace[msm_row_index] = accumulator;
                        msm_row_index++;
                    }
                }
            }
        }

        // Normalize the points in the point trace
        parallel_for_range(points_to_normalize.size(), [&](size_t start, size_t end) {
            Element::batch_normalize(&points_to_normalize[start], end - start);
        });

        // inverse_trace is used to compute the value of the `collision_inverse` column in the ECCVM.
        std::vector<FF> inverse_trace(num_point_adds_and_doubles);
        parallel_for_range(num_point_adds_and_doubles, [&](size_t start, size_t end) {
            for (size_t operation_idx = start; operation_idx < end; ++operation_idx) {
                if (is_double_or_add[operation_idx]) {
                    inverse_trace[operation_idx] = (p1_trace[operation_idx].y + p1_trace[operation_idx].y);
                } else {
                    inverse_trace[operation_idx] = (p2_trace[operation_idx].x - p1_trace[operation_idx].x);
                }
            }
            FF::batch_invert(&inverse_trace[start], end - start);
        });

        // complete the computation of the ECCVM execution trace, by adding the affine intermediate point data
        // i.e. row.accumulator_x, row.accumulator_y, row.add_state[0...3].collision_inverse,
        // row.add_state[0...3].lambda
        for (size_t msm_idx = 0; msm_idx < msms.size(); msm_idx++) {
            const auto& msm = msms[msm_idx];
            size_t trace_index = ((msm_row_counts[msm_idx] - 1) * ADDITIONS_PER_ROW);
            size_t msm_row_index = msm_row_counts[msm_idx];
            // 1st MSM row will have accumulator equal to the previous MSM output (or point at infinity for first MSM)
            size_t accumulator_index = msm_row_counts[msm_idx] - 1;
            const size_t msm_size = msm.size();
            const size_t num_rows_per_digit =
                (msm_size / ADDITIONS_PER_ROW) + ((msm_size % ADDITIONS_PER_ROW != 0) ? 1 : 0);

            for (size_t digit_idx = 0; digit_idx < NUM_WNAF_DIGITS_PER_SCALAR; ++digit_idx) {
                for (size_t row_idx = 0; row_idx < num_rows_per_digit; ++row_idx) {
                    auto& row = msm_rows[msm_row_index];
                    // note that we do not store the "intermediate accumulators" that are implicit *within* a row (i.e.,
                    // within a given `add_state` object). This is the reason why accumulator_index only increments once
                    // per `row_idx`.
                    const Element& normalized_accumulator = accumulator_trace[accumulator_index];
                    BB_ASSERT_EQ(normalized_accumulator.is_point_at_infinity(), 0);
                    row.accumulator_x = normalized_accumulator.x;
                    row.accumulator_y = normalized_accumulator.y;
                    for (size_t point_idx = 0; point_idx < ADDITIONS_PER_ROW; ++point_idx) {
                        auto& add_state = row.add_state[point_idx];

                        const auto& inverse = inverse_trace[trace_index];
                        const auto& p1 = p1_trace[trace_index];
                        const auto& p2 = p2_trace[trace_index];
                        add_state.collision_inverse = add_state.add ? inverse : 0;
                        add_state.lambda = add_state.add ? (p2.y - p1.y) * inverse : 0;
                        trace_index++;
                    }
                    accumulator_index++;
                    msm_row_index++;
                }

                // if digit_idx <  NUM_WNAF_DIGITS_PER_SCALAR - 1 we have to fill out our doubling row (which in fact
                // amounts to 4 doublings)
                if (digit_idx < NUM_WNAF_DIGITS_PER_SCALAR - 1) {
                    MSMRow& row = msm_rows[msm_row_index];
                    const Element& normalized_accumulator = accumulator_trace[accumulator_index];
                    const FF& acc_x = normalized_accumulator.is_point_at_infinity() ? 0 : normalized_accumulator.x;
                    const FF& acc_y = normalized_accumulator.is_point_at_infinity() ? 0 : normalized_accumulator.y;
                    row.accumulator_x = acc_x;
                    row.accumulator_y = acc_y;
                    for (size_t point_idx = 0; point_idx < ADDITIONS_PER_ROW; ++point_idx) {
                        auto& add_state = row.add_state[point_idx];
                        add_state.collision_inverse = 0; // no notion of "different x values" for a point doubling
                        const FF& dx = p1_trace[trace_index].x;
                        const FF& inverse = inverse_trace[trace_index]; // here, 2y
                        add_state.lambda = ((dx + dx + dx) * dx) * inverse;
                        trace_index++;
                    }
                    accumulator_index++;
                    msm_row_index++;
                } else // this row corresponds to performing point additions to handle WNAF skew
                       // i.e. iterate over all the points in the MSM - if for a given point, `wnaf_skew == 1`,
                       // subtract the original point from the accumulator. if `digit_idx ==  NUM_WNAF_DIGITS_PER_SCALAR
                       // - 1` we have finished executing our double-and-add algorithm.
                {
                    for (size_t row_idx = 0; row_idx < num_rows_per_digit; ++row_idx) {
                        MSMRow& row = msm_rows[msm_row_index];
                        const Element& normalized_accumulator = accumulator_trace[accumulator_index];
                        BB_ASSERT_EQ(normalized_accumulator.is_point_at_infinity(), 0);
                        const size_t offset = row_idx * ADDITIONS_PER_ROW;
                        row.accumulator_x = normalized_accumulator.x;
                        row.accumulator_y = normalized_accumulator.y;
                        for (size_t point_idx = 0; point_idx < ADDITIONS_PER_ROW; ++point_idx) {
                            auto& add_state = row.add_state[point_idx];
                            bool add_predicate = add_state.add ? msm[offset + point_idx].wnaf_skew : false;

                            const auto& inverse = inverse_trace[trace_index];
                            const auto& p1 = p1_trace[trace_index];
                            const auto& p2 = p2_trace[trace_index];
                            add_state.collision_inverse = add_predicate ? inverse : 0;
                            add_state.lambda = add_predicate ? (p2.y - p1.y) * inverse : 0;
                            trace_index++;
                        }
                        accumulator_index++;
                        msm_row_index++;
                    }
                }
            }
        }

        // populate the final row in the MSM execution trace.
        // we always require 1 extra row at the end of the trace, because the x and y coordinates of the accumulator for
        // row `i` are present at row `i+1`
        Element final_accumulator(accumulator_trace.back());
        MSMRow& final_row = msm_rows.back();
        final_row.pc = static_cast<uint32_t>(pc_values.back());
        final_row.msm_transition = true;
        final_row.accumulator_x = final_accumulator.is_point_at_infinity() ? 0 : final_accumulator.x;
        final_row.accumulator_y = final_accumulator.is_point_at_infinity() ? 0 : final_accumulator.y;
        final_row.msm_size = 0;
        final_row.msm_count = 0;
        final_row.q_add = false;
        final_row.q_double = false;
        final_row.q_skew = false;
        final_row.add_state = { typename MSMRow::AddState{ false, 0, AffineElement{ 0, 0 }, 0, 0 },
                                typename MSMRow::AddState{ false, 0, AffineElement{ 0, 0 }, 0, 0 },
                                typename MSMRow::AddState{ false, 0, AffineElement{ 0, 0 }, 0, 0 },
                                typename MSMRow::AddState{ false, 0, AffineElement{ 0, 0 }, 0, 0 } };

        return { msm_rows, point_table_read_counts };
    }
};
} // namespace bb
