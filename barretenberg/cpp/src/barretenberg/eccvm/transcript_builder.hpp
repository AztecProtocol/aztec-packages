#pragma once

#include "./eccvm_builder_types.hpp"

namespace bb {

class ECCVMTranscriptBuilder {
  public:
    using CycleGroup = bb::g1;
    using FF = grumpkin::fr;
    using Element = typename CycleGroup::element;
    using AffineElement = typename CycleGroup::affine_element;
    using VMOperation = typename bb::eccvm::VMOperation<CycleGroup>;
    using Accumulator = typename std::vector<Element>;

    struct TranscriptRow {
        bool accumulator_empty = false;
        bool q_add = false;
        bool q_mul = false;
        bool q_eq = false;
        bool q_reset_accumulator = false;
        bool msm_transition = false;
        uint32_t pc = 0;
        uint32_t msm_count = 0;
        FF base_x = 0;
        FF base_y = 0;
        uint256_t z1 = 0;
        uint256_t z2 = 0;
        bool z1_zero = false;
        bool z2_zero = false;
        uint32_t opcode = 0;
        FF accumulator_x = 0;
        FF accumulator_y = 0;
        FF msm_output_x = 0;
        FF msm_output_y = 0;
        bool base_infinity = 0;
        FF base_x_inverse = 0;
        FF base_y_inverse = 0;
        bool transcript_add_x_equal = false;
        bool transcript_add_y_equal = false;
        FF transcript_add_lambda = 0;
        FF transcript_msm_intermediate_x = 0;
        FF transcript_msm_intermediate_y = 0;
        bool transcript_msm_infinity = false;
        FF transcript_msm_x_inverse = 0;
        bool msm_count_zero_at_transition = false;
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
        static constexpr auto offset_generator_base = CycleGroup::derive_generators("ECCVM_OFFSET_GENERATOR", 1)[0];
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
    struct Opcode {
        bool add;
        bool mul;
        bool eq;
        bool reset;
        [[nodiscard]] uint32_t value() const
        {
            auto res = static_cast<uint32_t>(add);
            res += res;
            res += static_cast<uint32_t>(mul);
            res += res;
            res += static_cast<uint32_t>(eq);
            res += res;
            res += static_cast<uint32_t>(reset);
            return res;
        }
    };
    static std::vector<TranscriptRow> compute_rows(const std::vector<VMOperation>& vm_operations,
                                                   const uint32_t total_number_of_muls)
    {
        // const size_t num_transcript_entries = vm_operations.size() + 2;
        const size_t num_vm_entries = vm_operations.size();
        std::vector<TranscriptRow> transcript_state(num_vm_entries + 2);

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

        for (size_t i = 0; i < vm_operations.size(); ++i) {
            TranscriptRow& row = transcript_state[i + 1];
            const VMOperation& entry = vm_operations[i];

            const bool is_mul = entry.mul;
            const bool is_add = entry.add;
            const bool z1_zero = is_mul ? entry.z1 == 0 : true;
            const bool z2_zero = is_mul ? entry.z2 == 0 : true;
            uint32_t num_muls = 0;

            auto base_point_infinity = entry.base_point.is_point_at_infinity();
            if (is_mul) {
                num_muls = static_cast<uint32_t>(!z1_zero) + static_cast<uint32_t>(!z2_zero);
                if (base_point_infinity) {
                    num_muls = 0;
                }
            }
            updated_state = state;

            if (entry.reset) {
                updated_state.is_accumulator_empty = true;
                updated_state.accumulator = CycleGroup::point_at_infinity;
                updated_state.msm_accumulator = offset_generator();
            }
            updated_state.pc = state.pc - num_muls;

            const bool last_row = (i == (vm_operations.size() - 1));
            // msm transition = current row is doing a lookup to validate output = msm output
            // i.e. next row is not part of MSM and current row is part of MSM
            //   or next row is irrelevent and current row is a straight MUL
            const bool next_not_msm = last_row || !vm_operations[i + 1].mul;
            // we reset the count in updated state if we are not accumulating and not doing an msm

            const bool msm_transition = is_mul && next_not_msm && (state.count + num_muls > 0);

            const bool current_ongoing_msm = is_mul && !next_not_msm;

            updated_state.count = current_ongoing_msm ? state.count + num_muls : 0;

            if (is_mul) {
                const auto P = typename CycleGroup::element(entry.base_point);
                const auto R = typename CycleGroup::element(state.msm_accumulator);
                updated_state.msm_accumulator = R + P * entry.mul_scalar_full;
            }
            row.q_mul = is_mul;

            if (msm_transition) {
                if (state.is_accumulator_empty) {
                    updated_state.accumulator = updated_state.msm_accumulator - offset_generator();
                } else {
                    const auto R = typename CycleGroup::element(state.accumulator);
                    updated_state.accumulator = R + updated_state.msm_accumulator - offset_generator();
                }
                updated_state.is_accumulator_empty = updated_state.accumulator.is_point_at_infinity();
            }

            handle_add_transition(entry, updated_state, state, row);

            row.accumulator_empty = state.is_accumulator_empty;

            row.q_eq = entry.eq;
            row.q_reset_accumulator = entry.reset;
            row.msm_transition = msm_transition;
            row.pc = state.pc;
            row.msm_count = state.count;
            row.msm_count_zero_at_transition = ((state.count + num_muls) == 0) && (is_mul && next_not_msm);
            msm_count_at_transition_inverse_trace[i] = ((state.count + num_muls) == 0) ? 0 : FF(state.count + num_muls);
            row.base_x = ((is_add || is_mul || entry.eq) && !base_point_infinity) ? entry.base_point.x : 0;
            row.base_y = ((is_add || is_mul || entry.eq) && !base_point_infinity) ? entry.base_point.y : 0;
            row.base_infinity = (is_add || is_mul || entry.eq) ? (base_point_infinity ? 1 : 0) : 0;
            if (msm_transition) {
                Element msm_output = updated_state.msm_accumulator - offset_generator();
                row.transcript_msm_infinity = msm_output.is_point_at_infinity();
            }

            row.z1 = (is_mul) ? entry.z1 : 0;
            row.z2 = (is_mul) ? entry.z2 : 0;
            row.z1_zero = z1_zero;
            row.z2_zero = z2_zero;
            row.opcode = Opcode{ .add = is_add, .mul = is_mul, .eq = entry.eq, .reset = entry.reset }.value();

            accumulator_trace[i] = state.accumulator;
            msm_accumulator_trace[i] = msm_transition ? updated_state.msm_accumulator : Element::infinity();
            intermediate_accumulator_trace[i] =
                msm_transition ? (updated_state.msm_accumulator - offset_generator()) : Element::infinity();
            if (is_mul && next_not_msm && !row.accumulator_empty) {
                state.msm_accumulator = offset_generator();
            }

            state = updated_state;

            if (is_mul && next_not_msm) {
                state.msm_accumulator = offset_generator();
            }
        }

        normalize_accumulators(accumulator_trace, msm_accumulator_trace, intermediate_accumulator_trace);

        add_point_coordinates_to_transcript(
            transcript_state, accumulator_trace, msm_accumulator_trace, intermediate_accumulator_trace);

        for (size_t i = 0; i < accumulator_trace.size(); ++i) {
            auto& row = transcript_state[i + 1];
            const bool msm_transition = row.msm_transition;
            const bool add = row.q_add;
            if (msm_transition) {
                Element msm_output = intermediate_accumulator_trace[i];
                row.transcript_msm_infinity = msm_output.is_point_at_infinity();
                if (!row.transcript_msm_infinity) {
                    transcript_msm_x_inverse_trace[i] = (msm_accumulator_trace[i].x - offset_generator().x);
                } else {
                    transcript_msm_x_inverse_trace[i] = 0;
                }
                auto lhsx = msm_output.is_point_at_infinity() ? 0 : msm_output.x;
                auto lhsy = msm_output.is_point_at_infinity() ? 0 : msm_output.y;
                auto rhsx = accumulator_trace[i].is_point_at_infinity() ? 0 : accumulator_trace[i].x;
                auto rhsy = accumulator_trace[i].is_point_at_infinity() ? (0) : accumulator_trace[i].y;
                inverse_trace_x[i] = lhsx - rhsx;
                inverse_trace_y[i] = lhsy - rhsy;
            } else if (add) {
                auto lhsx = row.base_x;
                auto lhsy = row.base_y;
                auto rhsx = accumulator_trace[i].is_point_at_infinity() ? 0 : accumulator_trace[i].x;
                auto rhsy = accumulator_trace[i].is_point_at_infinity() ? (0) : accumulator_trace[i].y;
                inverse_trace_x[i] = lhsx - rhsx;
                inverse_trace_y[i] = lhsy - rhsy;
            } else {
                inverse_trace_x[i] = 0;
                inverse_trace_y[i] = 0;
            }
            // msm transition = current row is doing a lookup to validate output = msm output
            // i.e. next row is not part of MSM and current row is part of MSM
            //   or next row is irrelevent and current row is a straight MUL
            const VMOperation& entry = vm_operations[i];
            const bool is_add = entry.add;
            if (is_add || msm_transition) {
                Element lhs = is_add ? Element(entry.base_point) : intermediate_accumulator_trace[i];
                Element rhs = accumulator_trace[i];
                FF lhs_y = lhs.y;
                FF lhs_x = lhs.x;
                FF rhs_y = rhs.y;
                FF rhs_x = rhs.x;
                if (rhs.is_point_at_infinity()) {
                    rhs_y = 0;
                    rhs_x = 0;
                }
                if (lhs.is_point_at_infinity()) {
                    lhs_y = 0;
                    lhs_x = 0;
                }
                row.transcript_add_x_equal =
                    lhs_x == rhs_x || (lhs.is_point_at_infinity() && rhs.is_point_at_infinity()); // check infinity?
                row.transcript_add_y_equal =
                    lhs_y == rhs_y || (lhs.is_point_at_infinity() && rhs.is_point_at_infinity());
                if ((lhs_x == rhs_x) && (lhs_y == rhs_y) && !lhs.is_point_at_infinity() &&
                    !rhs.is_point_at_infinity()) {
                    add_lambda_denominator[i] = lhs_y + lhs_y;
                    add_lambda_numerator[i] = lhs_x * lhs_x * 3;
                } else if ((lhs_x != rhs_x) && !lhs.is_point_at_infinity() && !rhs.is_point_at_infinity()) {
                    add_lambda_denominator[i] = rhs_x - lhs_x;
                    add_lambda_numerator[i] = rhs_y - lhs_y;
                } else {
                    add_lambda_numerator[i] = 0;
                    add_lambda_denominator[i] = 0;
                }
            } else {
                row.transcript_add_x_equal = 0;
                row.transcript_add_y_equal = 0;
                add_lambda_numerator[i] = 0;
                add_lambda_denominator[i] = 0;
            }
        }

        FF::batch_invert(&inverse_trace_x[0], num_vm_entries);
        FF::batch_invert(&inverse_trace_y[0], num_vm_entries);
        FF::batch_invert(&transcript_msm_x_inverse_trace[0], num_vm_entries);
        FF::batch_invert(&add_lambda_denominator[0], num_vm_entries);
        FF::batch_invert(&msm_count_at_transition_inverse_trace[0], num_vm_entries);
        for (size_t i = 0; i < num_vm_entries; ++i) {
            transcript_state[i + 1].base_x_inverse = inverse_trace_x[i];
            transcript_state[i + 1].base_y_inverse = inverse_trace_y[i];
            transcript_state[i + 1].transcript_msm_x_inverse = transcript_msm_x_inverse_trace[i];
            transcript_state[i + 1].transcript_add_lambda = add_lambda_numerator[i] * add_lambda_denominator[i];
            transcript_state[i + 1].msm_count_at_transition_inverse = msm_count_at_transition_inverse_trace[i];
        }
        TranscriptRow& final_row = transcript_state.back();
        final_row.pc = updated_state.pc;
        final_row.accumulator_x =
            (updated_state.accumulator.is_point_at_infinity()) ? 0 : AffineElement(updated_state.accumulator).x;
        final_row.accumulator_y =
            (updated_state.accumulator.is_point_at_infinity()) ? 0 : AffineElement(updated_state.accumulator).y;
        final_row.accumulator_empty = updated_state.is_accumulator_empty;
        return transcript_state;
    }

  private:
    static void handle_mul_transition(const VMOperation& entry,
                                      VMState& updated_state,
                                      TranscriptRow& row,
                                      Accumulator& msm_accumulator_trace,
                                      VMState& state)
    {
        const bool is_mul = entry.mul;
        const bool base_point_infinity = entry.base_point.is_point_at_infinity();
        const bool z1_zero = is_mul && entry.z1 == 0;
        const bool z2_zero = is_mul && entry.z2 == 0;

        if (is_mul) {
            uint32_t num_muls = !z1_zero + !z2_zero;
            if (base_point_infinity) {
                num_muls = 0;
            }
            updated_state.pc = state.pc - num_muls;
        }

        row.q_mul = is_mul;
        if (is_mul && !base_point_infinity) {
            updated_state.msm_accumulator = state.msm_accumulator + Element(entry.base_point) * entry.mul_scalar_full;
            msm_accumulator_trace.push_back(updated_state.msm_accumulator);
        }
    }

    static void handle_add_transition(const bb::eccvm::VMOperation<CycleGroup>& entry,
                                      VMState& updated_state,
                                      VMState& state,
                                      TranscriptRow& row)
    {
        if (entry.add) {
            if (state.is_accumulator_empty) {
                updated_state.accumulator = entry.base_point;
            } else {
                updated_state.accumulator = typename CycleGroup::element(state.accumulator) + entry.base_point;
            }
            updated_state.is_accumulator_empty = updated_state.accumulator.is_point_at_infinity();
        }
        row.q_add = entry.add;
    }

    static void normalize_accumulators(Accumulator& accumulator_trace,
                                       Accumulator& msm_accumulator_trace,
                                       std::vector<Element>& intermediate_accumulator_trace)
    {
        Element::batch_normalize(&accumulator_trace[0], accumulator_trace.size());
        Element::batch_normalize(&msm_accumulator_trace[0], msm_accumulator_trace.size());
        Element::batch_normalize(&intermediate_accumulator_trace[0], intermediate_accumulator_trace.size());
    }

    static void add_point_coordinates_to_transcript(std::vector<TranscriptRow>& transcript_state,
                                                    const Accumulator& accumulator_trace,
                                                    const Accumulator& msm_accumulator_trace,
                                                    const Accumulator& intermediate_accumulator_trace
                                                    // const std::vector<FF>& transcript_msm_x_inverse_trace,
                                                    // const std::vector<FF>& add_lambda_numerator,
                                                    // const std::vector<FF>& add_lambda_denominator,
                                                    // const std::vector<FF>& msm_count_at_transition_inverse_trace
    )
    {
        for (size_t i = 0; i < accumulator_trace.size(); ++i) {
            if (!accumulator_trace[i].is_point_at_infinity()) {
                transcript_state[i + 1].accumulator_x = accumulator_trace[i].x;
                transcript_state[i + 1].accumulator_y = accumulator_trace[i].y;
            }
            if (!msm_accumulator_trace[i].is_point_at_infinity()) {
                transcript_state[i + 1].msm_output_x = msm_accumulator_trace[i].x;
                transcript_state[i + 1].msm_output_y = msm_accumulator_trace[i].y;
            }
            if (!intermediate_accumulator_trace[i].is_point_at_infinity()) {
                transcript_state[i + 1].transcript_msm_intermediate_x = intermediate_accumulator_trace[i].x;
                transcript_state[i + 1].transcript_msm_intermediate_y = intermediate_accumulator_trace[i].y;
            }
        }
    }

    static void update_trace_accumulators(const VMOperation& entry,
                                          //   const VMState& state,
                                          TranscriptRow& row,
                                          //   std::vector<FF>& inverse_trace_x,
                                          //   std::vector<FF>& inverse_trace_y,
                                          std::vector<FF>& add_lambda_numerator,
                                          std::vector<FF>& add_lambda_denominator,
                                          //   std::vector<FF>& msm_count_at_transition_inverse_trace,
                                          size_t i,
                                          const Accumulator& accumulator_trace,
                                          const Accumulator& intermediate_accumulator_trace)
    {

        if (entry.add || row.msm_transition) {
            const Element lhs = entry.add ? Element(entry.base_point) : intermediate_accumulator_trace[i];
            const Element rhs = accumulator_trace[i];
            const FF lhs_x = lhs.is_point_at_infinity() ? 0 : lhs.x;
            const FF lhs_y = lhs.is_point_at_infinity() ? 0 : lhs.y;
            const FF rhs_x = rhs.is_point_at_infinity() ? 0 : rhs.x;
            const FF rhs_y = rhs.is_point_at_infinity() ? 0 : rhs.y;

            row.transcript_add_x_equal = lhs_x == rhs_x;
            row.transcript_add_y_equal = lhs_y == rhs_y;

            if (lhs_x == rhs_x && lhs_y == rhs_y && !lhs.is_point_at_infinity() && !rhs.is_point_at_infinity()) {
                add_lambda_denominator[i] = lhs_y + lhs_y;
                add_lambda_numerator[i] = lhs_x * lhs_x * 3;
            } else if (lhs_x != rhs_x && !lhs.is_point_at_infinity() && !rhs.is_point_at_infinity()) {
                add_lambda_denominator[i] = rhs_x - lhs_x;
                add_lambda_numerator[i] = rhs_y - lhs_y;
            } else {
                add_lambda_numerator[i] = 0;
                add_lambda_denominator[i] = 0;
            }
        }
    }
};
} // namespace bb
