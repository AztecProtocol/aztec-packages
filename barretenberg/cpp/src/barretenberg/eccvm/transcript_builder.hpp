// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "./eccvm_builder_types.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_bn254_impl.hpp"
#include "barretenberg/op_queue/ecc_ops_table.hpp"

namespace bb {

class ECCVMTranscriptBuilder {
  public:
    using CycleGroup = bb::g1;
    using FF = grumpkin::fr;
    using Element = typename CycleGroup::element;
    using AffineElement = typename CycleGroup::affine_element;
    using Accumulator = typename std::vector<Element>;

    struct TranscriptRow {

        // These fields are populated in the first loop
        bool transcript_msm_infinity = false;
        bool accumulator_empty = false;
        bool q_add = false;
        bool q_mul = false;
        bool q_eq = false;
        bool q_reset_accumulator = false;
        bool msm_transition = false;
        uint32_t pc = 0;
        uint32_t msm_count = 0;
        bool msm_count_zero_at_transition = false;
        FF base_x = 0;
        FF base_y = 0;
        bool base_infinity = false;
        uint256_t z1 = 0;
        uint256_t z2 = 0;
        bool z1_zero = false;
        bool z2_zero = false;
        uint32_t opcode = 0;

        // These fields are populated after converting Jacobian to affine coordinates
        FF accumulator_x = 0;
        FF accumulator_y = 0;
        FF msm_output_x = 0;
        FF msm_output_y = 0;
        FF transcript_msm_intermediate_x = 0;
        FF transcript_msm_intermediate_y = 0;

        // Computed during the lambda numerator and denominator computation
        bool transcript_add_x_equal = false;
        bool transcript_add_y_equal = false;

        // Computed after the batch inversion
        FF base_x_inverse = 0;
        FF base_y_inverse = 0;
        FF transcript_add_lambda = 0;
        FF transcript_msm_x_inverse = 0;
        FF msm_count_at_transition_inverse = 0;
    };

    /**
     * @brief Computes offset_generator group element
     * @details "offset generator" is used when performing multi-scalar-multiplications to ensure an HONEST prover never
     * triggers incomplete point addition formulae.
     * i.e. we don't need to constrain point doubling or points at infinity when computing an MSM
     * The MSM accumulator is initialized to `offset_generator`. When adding the MSM result into the transcript
     * accumulator, the contribution of the offset generator to the MSM result is removed (offset_generator * 2^{124})
     * @return AffineElement
     */
    static AffineElement offset_generator()
    {
        static constexpr auto offset_generator_base =
            get_precomputed_generators<CycleGroup, "ECCVM_OFFSET_GENERATOR", 1>()[0];
        static const AffineElement result =
            AffineElement(Element(offset_generator_base) * grumpkin::fq(uint256_t(1) << 124));
        return result;
    }
    static AffineElement remove_offset_generator(const AffineElement& other)
    {
        return AffineElement(Element(other) - offset_generator());
    }
    struct VMState {
        uint32_t pc = 0;
        uint32_t count = 0;
        Element accumulator = CycleGroup::affine_point_at_infinity;
        Element msm_accumulator = offset_generator();
        bool is_accumulator_empty = true;
    };

    /**
     * @brief Computes the ECCVM transcript rows.
     *
     * @details This method processes the series of group operations extracted from ECCOpQueue, computing
     * multi-scalar multiplications and point additions, while creating the
     * transcript of the operations. In the first loop over the rows of ECCOpQueue, it mostly populates the
     * TranscriptRow with boolean flags indicating the structure of the ops being performed, while performing
     * elliptic curve operations in Jacobian coordinates, and then normalizes these points to affine coordinates. Batch
     * inversion is used to optimize expensive finite field inversions.
     *
     * @param vm_operations ECCOpQueue
     * @param total_number_of_muls The total number of multiplications in the series of operations.
     *
     * @return A vector of TranscriptRows
     */
    static std::vector<TranscriptRow> compute_rows(const std::vector<ECCVMOperation>& vm_operations,
                                                   const uint32_t total_number_of_muls)
    {
        const size_t num_vm_entries = vm_operations.size();
        // The transcript contains an extra zero row at the beginning and the accumulated state at the end
        const size_t transcript_size = num_vm_entries + 2;
        std::vector<TranscriptRow> transcript_state(transcript_size);

        // These vectors track quantities that we need to invert.
        // We fill these vectors and then perform batch inversions to amortize the cost of FF inverts
        std::vector<FF> inverse_trace_x(num_vm_entries);
        std::vector<FF> inverse_trace_y(num_vm_entries);
        std::vector<FF> transcript_msm_x_inverse_trace(num_vm_entries);
        std::vector<FF> add_lambda_denominator(num_vm_entries);
        std::vector<FF> add_lambda_numerator(num_vm_entries);
        std::vector<FF> msm_count_at_transition_inverse_trace(num_vm_entries);

        Accumulator msm_accumulator_trace(num_vm_entries);
        Accumulator accumulator_trace(num_vm_entries);
        Accumulator intermediate_accumulator_trace(num_vm_entries);

        VMState state{
            .pc = total_number_of_muls,
            .count = 0,
            .accumulator = CycleGroup::affine_point_at_infinity,
            .msm_accumulator = offset_generator(),
            .is_accumulator_empty = true,
        };

        VMState updated_state;

        // add an empty row. 1st row all zeroes because of our shiftable polynomials
        transcript_state[0] = (TranscriptRow{});

        // during the first iteration over the ECCOpQueue, the operations are being performed using Jacobian
        // coordinates and the base point coordinates are recorded in the transcript. at the same time, the transcript
        // logic is being populated
        for (size_t i = 0; i < num_vm_entries; i++) {
            TranscriptRow& row = transcript_state[i + 1];
            const ECCVMOperation& entry = vm_operations[i];
            updated_state = state;

            const bool is_mul = entry.op_code.mul;
            const bool is_add = entry.op_code.add;
            const bool z1_zero = is_mul ? entry.z1 == 0 : true;
            const bool z2_zero = is_mul ? entry.z2 == 0 : true;

            const bool base_point_infinity = entry.base_point.is_point_at_infinity();
            uint32_t num_muls = 0;
            if (is_mul) {
                num_muls = static_cast<uint32_t>(!z1_zero) + static_cast<uint32_t>(!z2_zero);
                if (base_point_infinity) {
                    num_muls = 0;
                }
            }
            updated_state.pc = state.pc - num_muls;

            if (entry.op_code.reset) {
                updated_state.is_accumulator_empty = true;
                updated_state.accumulator = CycleGroup::point_at_infinity;
                updated_state.msm_accumulator = offset_generator();
            }

            const bool last_row = (i == (num_vm_entries - 1));

            // msm transition = current row is doing a lookup to validate output = msm output
            // i.e. next row is not part of MSM and current row is part of MSM
            //   or next row is irrelevant and current row is a straight MUL
            const bool next_not_msm = last_row || !vm_operations[i + 1].op_code.mul;

            // we reset the count in updated state if we are not accumulating and not doing an msm
            const bool msm_transition = is_mul && next_not_msm && (state.count + num_muls > 0);

            // determine ongoing msm and update the respective counter
            const bool current_ongoing_msm = is_mul && !next_not_msm;

            updated_state.count = current_ongoing_msm ? state.count + num_muls : 0;

            if (is_mul) {
                process_mul(entry, updated_state, state);
            }

            if (msm_transition) {
                process_msm_transition(row, updated_state, state);
            } else {
                msm_accumulator_trace[i] = Element::infinity();
                intermediate_accumulator_trace[i] = Element::infinity();
            }

            if (is_add) {
                process_add(entry, updated_state, state);
            }

            // populate the first group of TranscriptRow entries
            populate_transcript_row(row, entry, state, num_muls, msm_transition, next_not_msm);

            msm_count_at_transition_inverse_trace[i] = ((state.count + num_muls) == 0) ? 0 : FF(state.count + num_muls);

            // update the accumulators
            accumulator_trace[i] = state.accumulator;
            msm_accumulator_trace[i] = msm_transition ? updated_state.msm_accumulator : Element::infinity();
            intermediate_accumulator_trace[i] =
                msm_transition ? (updated_state.msm_accumulator - offset_generator()) : Element::infinity();

            state = updated_state;

            if (is_mul && next_not_msm) {
                state.msm_accumulator = offset_generator();
            }
        }
        // compute affine coordinates of the accumulated points
        normalize_accumulators(accumulator_trace, msm_accumulator_trace, intermediate_accumulator_trace);

        // add required affine coordinates to the transcript
        add_affine_coordinates_to_transcript(
            transcript_state, accumulator_trace, msm_accumulator_trace, intermediate_accumulator_trace);

        // process the slopes when adding points or results of MSMs. to increase efficiency, we use batch inversion
        // after the loop
        for (size_t i = 0; i < accumulator_trace.size(); ++i) {
            TranscriptRow& row = transcript_state[i + 1];
            const bool msm_transition = row.msm_transition;

            const ECCVMOperation& entry = vm_operations[i];
            const bool is_add = entry.op_code.add;

            if (msm_transition || is_add) {
                // compute the differences between point coordinates
                compute_inverse_trace_coordinates(msm_transition,
                                                  row,
                                                  intermediate_accumulator_trace[i],
                                                  transcript_msm_x_inverse_trace[i],
                                                  msm_accumulator_trace[i],
                                                  accumulator_trace[i],
                                                  inverse_trace_x[i],
                                                  inverse_trace_y[i]);

                // compute the numerators and denominators of slopes between the points
                compute_lambda_numerator_and_denominator(row,
                                                         entry,
                                                         intermediate_accumulator_trace[i],
                                                         accumulator_trace[i],
                                                         add_lambda_numerator[i],
                                                         add_lambda_denominator[i]);
            } else {
                row.transcript_add_x_equal = 0;
                row.transcript_add_y_equal = 0;
                add_lambda_numerator[i] = 0;
                add_lambda_denominator[i] = 0;
                inverse_trace_x[i] = 0;
                inverse_trace_y[i] = 0;
            }
        }

        // Perform all required inversions at once
        FF::batch_invert(&inverse_trace_x[0], num_vm_entries);
        FF::batch_invert(&inverse_trace_y[0], num_vm_entries);
        FF::batch_invert(&transcript_msm_x_inverse_trace[0], num_vm_entries);
        FF::batch_invert(&add_lambda_denominator[0], num_vm_entries);
        FF::batch_invert(&msm_count_at_transition_inverse_trace[0], num_vm_entries);

        // Populate the fields of the transcript row containing inverted scalars
        for (size_t i = 0; i < num_vm_entries; ++i) {
            TranscriptRow& row = transcript_state[i + 1];
            row.base_x_inverse = inverse_trace_x[i];
            row.base_y_inverse = inverse_trace_y[i];
            row.transcript_msm_x_inverse = transcript_msm_x_inverse_trace[i];
            row.transcript_add_lambda = add_lambda_numerator[i] * add_lambda_denominator[i];
            row.msm_count_at_transition_inverse = msm_count_at_transition_inverse_trace[i];
        }

        // process the final row containing the result of the sequence of group ops in ECCOpQueue
        finalize_transcript(transcript_state, updated_state);

        return transcript_state;
    }

  private:
    /**
     * @brief Populate the transcript rows with the information parsed after the first iteration over the ECCOpQueue
     *
     * @details Processes the state of the accumulator, base point, and the operation flags
     * (addition, multiplication, equality check, and reset), as well as information about MSM transitions.
     *
     * Processes the following values:
     *  - The 'accumulator_is_empty' flag.
     *  - Base point's coordinates when applicable.
     *  - MSM transitions and the number of MSMs.
     *  - Setting flags for  `add`, `mul`, `eq`, or `reset` operations.
     *  - The opcode field.
     *
     * @param row The transcript row to populate.
     * @param entry The current VM operation being processed.
     * @param state The current VM state before the operation is applied.
     * @param num_muls The number of multiplications involved in the current operation.
     * @param msm_transition A boolean indicating whether the operation represents an MSM transition.
     * @param next_not_msm A boolean indicating if the next operation is not part of an ongoing MSM.
     */
    static void populate_transcript_row(TranscriptRow& row,
                                        const ECCVMOperation& entry,
                                        const VMState& state,
                                        const uint32_t num_muls,
                                        const bool msm_transition,
                                        const bool next_not_msm)
    {
        const bool base_point_infinity = entry.base_point.is_point_at_infinity();

        row.accumulator_empty = state.is_accumulator_empty;
        row.q_add = entry.op_code.add;
        row.q_mul = entry.op_code.mul;
        row.q_eq = entry.op_code.eq;
        row.q_reset_accumulator = entry.op_code.reset;
        row.msm_transition = msm_transition;
        row.pc = state.pc;
        row.msm_count = state.count;
        row.msm_count_zero_at_transition = ((state.count + num_muls) == 0) && entry.op_code.mul && next_not_msm;
        row.base_x = ((entry.op_code.add || entry.op_code.mul || entry.op_code.eq) && !base_point_infinity)
                         ? entry.base_point.x
                         : 0;
        row.base_y = ((entry.op_code.add || entry.op_code.mul || entry.op_code.eq) && !base_point_infinity)
                         ? entry.base_point.y
                         : 0;
        row.base_infinity =
            (entry.op_code.add || entry.op_code.mul || entry.op_code.eq) ? (base_point_infinity ? 1 : 0) : 0;
        row.z1 = entry.op_code.mul ? entry.z1 : 0;
        row.z2 = entry.op_code.mul ? entry.z2 : 0;
        row.z1_zero = entry.z1 == 0;
        row.z2_zero = entry.z2 == 0;
        row.opcode = entry.op_code.value();
    }

    /**
     * @brief Process scalar multiplication from the ECCOpQueue.
     *
     * @details If the entry indicates a multiplication operation, the
     * base point from the ECCOpQueue is multiplied by the corresponding full scalar. The result is added to the
     * 'msm_accumulator' field of the updated state.
     *
     * @param entry Current ECCOpQueue entry
     * @param updated_state The state of the ECCVM to be updated with the result of the multiplication
     * @param state The current state of the ECCVM
     */
    static void process_mul(const ECCVMOperation& entry, VMState& updated_state, const VMState& state)
    {
        const auto P = typename CycleGroup::element(entry.base_point);
        const auto R = typename CycleGroup::element(state.msm_accumulator);
        updated_state.msm_accumulator = R + P * entry.mul_scalar_full;
    }

    /**
     * @brief Process addition from the ECCOpQueue.
     *
     * @details If the entry indicates an addition operation, the
     * base point from the ECCOpQueue is added to the main accumulator.
     *
     * @param entry Current ECCOpQueue entry
     * @param updated_state The state of the ECCVM to be updated with the result of the addition
     * @param state The current state of the ECCVM
     */
    static void process_add(const ECCVMOperation& entry, VMState& updated_state, const VMState& state)
    {

        if (state.is_accumulator_empty) {
            updated_state.accumulator = entry.base_point;
        } else {
            updated_state.accumulator = Element(state.accumulator) + entry.base_point;
        }
        updated_state.is_accumulator_empty = updated_state.accumulator.is_point_at_infinity();
    }

    /**
     * @brief
     *
     * @details Handles the transition that occurs after the completion of an MSM operation.
     * It updates the accumulator with the result of the MSM, removing the contribution of the offset generator. It
     * checks if the MSM output is a point at infinity and sets the corresponding flag in the transcript, and also sets
     * the `is_accumulator_empty` flag.
     *
     * @param row Current transcript row
     * @param updated_state The state of the ECCVM to be updated with the result of the addition
     * @param state The current state of the ECCVM
     */
    static void process_msm_transition(TranscriptRow& row, VMState& updated_state, const VMState& state)
    {
        if (state.is_accumulator_empty) {
            updated_state.accumulator = updated_state.msm_accumulator - offset_generator();
        } else {
            const Element R = Element(state.accumulator);
            updated_state.accumulator = R + updated_state.msm_accumulator - offset_generator();
        }
        updated_state.is_accumulator_empty = updated_state.accumulator.is_point_at_infinity();

        const Element msm_output = updated_state.msm_accumulator - offset_generator();
        row.transcript_msm_infinity = msm_output.is_point_at_infinity();
    }
    /**
     * @brief Batched conversion of points in accumulators from Jacobian coordinates \f$ (X, Y, Z) \f$ to affine
     * coordinates \f$ (x = X/Z^2, y = Y/Z^3 ) \f$.
     *
     * @param accumulator_trace Accumulator for all group ops
     * @param msm_accumulator_trace Accumulator for all MSMs
     * @param intermediate_accumulator_trace Accumulator for the ongoing MSM
     */
    static void normalize_accumulators(Accumulator& accumulator_trace,
                                       Accumulator& msm_accumulator_trace,
                                       std::vector<Element>& intermediate_accumulator_trace)
    {
        Element::batch_normalize(&accumulator_trace[0], accumulator_trace.size());
        Element::batch_normalize(&msm_accumulator_trace[0], msm_accumulator_trace.size());
        Element::batch_normalize(&intermediate_accumulator_trace[0], intermediate_accumulator_trace.size());
    }
    /**
     * @brief Once the point coordinates are converted from Jacobian to affine coordinates, we populate
     * \f$(x,y)\f$-coordinates of the corresponding accumulators.
     *
     * @param transcript_state ECCVM Transcript
     * @param accumulator_trace Accumulator for all group ops
     * @param msm_accumulator_trace Accumulator for all MSMs
     * @param intermediate_accumulator_trace Accumulator for the ongoing MSM
     */
    static void add_affine_coordinates_to_transcript(std::vector<TranscriptRow>& transcript_state,
                                                     const Accumulator& accumulator_trace,
                                                     const Accumulator& msm_accumulator_trace,
                                                     const Accumulator& intermediate_accumulator_trace)
    {
        for (size_t i = 0; i < accumulator_trace.size(); ++i) {
            TranscriptRow& row = transcript_state[i + 1];
            if (!accumulator_trace[i].is_point_at_infinity()) {
                row.accumulator_x = accumulator_trace[i].x;
                row.accumulator_y = accumulator_trace[i].y;
            }
            if (!msm_accumulator_trace[i].is_point_at_infinity()) {
                row.msm_output_x = msm_accumulator_trace[i].x;
                row.msm_output_y = msm_accumulator_trace[i].y;
            }
            if (!intermediate_accumulator_trace[i].is_point_at_infinity()) {
                row.transcript_msm_intermediate_x = intermediate_accumulator_trace[i].x;
                row.transcript_msm_intermediate_y = intermediate_accumulator_trace[i].y;
            }
        }
    }
    /**
     * @brief Compute the difference between the x and y coordinates of two points.
     *
     * @details `inverse_trace_x` and `inverse_trace_y` are used to store the inverse of the difference between the x
     * and y coordinates of two elliptic curve points, which is used in the calculation of the slope (\f$ \lambda \f$)
     * during point addition and doubling.
     *
     * Computing the inverse is expensive, therefore to optimize the overall calculation, all the required inversions
     * are deferred and computed at once, rather than performing individual inversions for each operation.
     *
     * In the case of MSM transition, we compute the difference between the coordinates of the MSM output accumulated in
     * the intermediate accumulator and the point in the current accumulator.
     *
     * In the case of point addition, we compute the difference between the coordinates of the current row in
     * ECCVMOperations and the point in the accumulator.
     *
     */

    static void compute_inverse_trace_coordinates(const bool msm_transition,
                                                  const TranscriptRow& row,
                                                  const Element& msm_output,
                                                  FF& transcript_msm_x_inverse_trace,
                                                  Element& msm_accumulator_trace,
                                                  Element& accumulator_trace,
                                                  FF& inverse_trace_x,
                                                  FF& inverse_trace_y)
    {

        const bool msm_output_infinity = msm_output.is_point_at_infinity();
        const bool row_msm_infinity = row.transcript_msm_infinity;

        transcript_msm_x_inverse_trace = row_msm_infinity ? 0 : (msm_accumulator_trace.x - offset_generator().x);

        FF lhsx;
        FF lhsy;
        if (msm_transition) {
            lhsx = msm_output_infinity ? 0 : msm_output.x;
            lhsy = msm_output_infinity ? 0 : msm_output.y;
        } else {
            lhsx = row.base_x;
            lhsy = row.base_y;
        }
        const FF rhsx = accumulator_trace.is_point_at_infinity() ? 0 : accumulator_trace.x;
        const FF rhsy = accumulator_trace.is_point_at_infinity() ? 0 : accumulator_trace.y;
        inverse_trace_x = lhsx - rhsx;
        inverse_trace_y = lhsy - rhsy;
    }

    /**
     * @brief If entry is not a point at infinity, compute the slope between the VM entry point and current accumulator,
     * else compute the slope between the accumulators.

     * @details   `transcript_add_lambda` represents the slope (\f$ \lambda \f$) of the line connecting two points
     * on the elliptic curve during the point addition process or the tangent line at a point during point doubling.
     *
     * Used for computing new x and y coordinates when adding or doubling points.
     *
     * - **Point Addition (when \f$ x_1 \neq  x_2\f$ )**: If two points \f$ P(x_1, y_1) \f$ and \f$ Q(x_2, y_2) \f$ are
     * distinct, the slope \f$ \lambda \f$ of the line passing through them is calculated as:
     *   \f[
     *   \lambda = \frac{y_2 - y_1}{x_2 - x_1}
     *   \f]
     *   This \f$ \lambda \f$ is used to compute the coordinates of the resulting point \f$ R(x_r, y_r) \f$:
     *   \f[
     *   x_r = \lambda^2 - x_1 - x_2
     *   \f]
     *   \f[
     *   y_r = \lambda(x_1 - x_r) - y_1
     *   \f]
     *
     * - **Point Doubling (when x1 = x2)**: If the points are the same (i.e., point doubling), the slope \f$ \lambda \f$
     * is computed as the tangent line at the point: \f[ \lambda = \frac{3x_1^2 + a}{2y_1} \f] where \f$ a \f$ is the
     * curve parameter. In our case, \f$ a = 0 \f$.
     *
     * @param row
     * @param entry
     * @param intermediate_accumulator
     * @param accumulator
     * @param add_lambda_numerator
     * @param add_lambda_denominator
     */
    static void compute_lambda_numerator_and_denominator(TranscriptRow& row,
                                                         const ECCVMOperation& entry,
                                                         const Element& intermediate_accumulator,
                                                         const Element& accumulator,
                                                         FF& add_lambda_numerator,
                                                         FF& add_lambda_denominator)
    {
        const Element vm_point = entry.op_code.add ? Element(entry.base_point) : intermediate_accumulator;

        const bool vm_infinity = vm_point.is_point_at_infinity();
        const bool accumulator_infinity = accumulator.is_point_at_infinity();

        // extract coordinates of the current point in ECCOpQueue
        const FF vm_x = vm_infinity ? 0 : vm_point.x;
        const FF vm_y = vm_infinity ? 0 : vm_point.y;

        // extract coordinates of the current accumulator
        const FF accumulator_x = accumulator_infinity ? 0 : accumulator.x;
        const FF accumulator_y = accumulator_infinity ? 0 : accumulator.y;

        row.transcript_add_x_equal = (vm_x == accumulator_x) || (vm_infinity && accumulator_infinity);
        row.transcript_add_y_equal = (vm_y == accumulator_y) || (vm_infinity && accumulator_infinity);

        // compute the numerator and denominator of the slope
        if ((accumulator_x == vm_x) && (accumulator_y == vm_y) && !vm_infinity && !accumulator_infinity) {
            // Double case (x1 == x2, y1 == y2)
            add_lambda_denominator = vm_y + vm_y;
            add_lambda_numerator = vm_x * vm_x * 3;
        } else if ((accumulator_x != vm_x) && !vm_infinity && !accumulator_infinity) {
            // General case (x1 != x2)
            add_lambda_denominator = accumulator_x - vm_x;
            add_lambda_numerator = accumulator_y - vm_y;
        }
    }
    /**
     * @brief Place the number of the MSMs and the coordinates of the accumualted result in the last row of the
     * transcript
     *
     * @param transcript_state
     * @param updated_state
     */
    static void finalize_transcript(std::vector<TranscriptRow>& transcript_state, const VMState& updated_state)
    {
        TranscriptRow& final_row = transcript_state.back();
        final_row.pc = updated_state.pc;
        final_row.accumulator_x =
            updated_state.accumulator.is_point_at_infinity() ? 0 : AffineElement(updated_state.accumulator).x;
        final_row.accumulator_y =
            updated_state.accumulator.is_point_at_infinity() ? 0 : AffineElement(updated_state.accumulator).y;
        final_row.accumulator_empty = updated_state.is_accumulator_empty;
    }
};
} // namespace bb
