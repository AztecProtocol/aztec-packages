#pragma once

#include "./eccvm_builder_types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

#include "./msm_builder.hpp"
#include "./precomputed_tables_builder.hpp"
#include "./transcript_builder.hpp"
#include "barretenberg/honk/flavor/ecc_vm.hpp"
#include "barretenberg/honk/proof_system/lookup_library.hpp"
#include "barretenberg/honk/proof_system/permutation_library.hpp"
#include "barretenberg/honk/sumcheck/relations/relation_parameters.hpp"

namespace proof_system {

template <typename Flavor> class ECCVMCircuitConstructor {
  public:
    using CycleGroup = typename Flavor::CycleGroup;
    using CycleScalar = typename CycleGroup::subgroup_field;
    using FF = typename Flavor::FF;
    using Element = typename CycleGroup::element;
    using AffineElement = typename CycleGroup::affine_element;
    static constexpr size_t NUM_SCALAR_BITS = proof_system_eccvm::NUM_SCALAR_BITS;
    static constexpr size_t WNAF_SLICE_BITS = proof_system_eccvm::WNAF_SLICE_BITS;
    static constexpr size_t NUM_WNAF_SLICES = proof_system_eccvm::NUM_WNAF_SLICES;
    static constexpr uint64_t WNAF_MASK = proof_system_eccvm::WNAF_MASK;
    static constexpr size_t POINT_TABLE_SIZE = proof_system_eccvm::POINT_TABLE_SIZE;
    static constexpr size_t WNAF_SLICES_PER_ROW = proof_system_eccvm::WNAF_SLICES_PER_ROW;
    static constexpr size_t ADDITIONS_PER_ROW = proof_system_eccvm::ADDITIONS_PER_ROW;

    static constexpr size_t NUM_POLYNOMIALS = Flavor::NUM_ALL_ENTITIES;
    static constexpr size_t NUM_WIRES = Flavor::NUM_WIRES;

    using MSM = proof_system_eccvm::MSM<CycleGroup>;
    using VMOperation = proof_system_eccvm::VMOperation<CycleGroup>;
    std::vector<VMOperation> vm_operations;
    using ScalarMul = proof_system_eccvm::ScalarMul<CycleGroup>;
    using RawPolynomials = typename Flavor::RawPolynomials;
    using Polynomial = barretenberg::Polynomial<FF>;
    uint32_t get_number_of_muls()
    {
        uint32_t num_muls = 0;
        for (auto& op : vm_operations) {
            if (op.mul) {
                if (op.z1 != 0) {
                    num_muls++;
                }
                if (op.z2 != 0) {
                    num_muls++;
                }
            }
        }
        return num_muls;
    }

    std::vector<MSM> get_msms()
    {
        const uint32_t num_muls = get_number_of_muls();
        /**
         * For input point [P], return { -15[P], -13[P], ..., -[P], [P], ..., 13[P], 15[P] }
         */
        const auto compute_precomputed_table = [](const AffineElement& base_point) {
            const auto d2 = Element(base_point).dbl();
            std::array<AffineElement, POINT_TABLE_SIZE> table;
            table[POINT_TABLE_SIZE / 2] = base_point;
            for (size_t i = 1; i < POINT_TABLE_SIZE / 2; ++i) {
                table[i + POINT_TABLE_SIZE / 2] = Element(table[i + POINT_TABLE_SIZE / 2 - 1]) + d2;
            }
            for (size_t i = 0; i < POINT_TABLE_SIZE / 2; ++i) {
                table[i] = -table[POINT_TABLE_SIZE - 1 - i];
            }
            return table;
        };
        const auto compute_wnaf_slices = [](uint256_t scalar) {
            std::array<int, NUM_WNAF_SLICES> output;
            int previous_slice = 0;
            for (size_t i = 0; i < NUM_WNAF_SLICES; ++i) {
                // slice the scalar into 4-bit chunks, starting with the least significant bits
                uint64_t raw_slice = static_cast<uint64_t>(scalar) & WNAF_MASK;

                bool is_even = ((raw_slice & 1ULL) == 0ULL);

                int wnaf_slice = static_cast<int>(raw_slice);

                if (i == 0 && is_even) {
                    // if least significant slice is even, we add 1 to create an odd value && set 'skew' to true
                    wnaf_slice += 1;
                } else if (is_even) {
                    // for other slices, if it's even, we add 1 to the slice value
                    // and subtract 16 from the previous slice to preserve the total scalar sum
                    static constexpr int borrow_constant = static_cast<int>(1ULL << WNAF_SLICE_BITS);
                    previous_slice -= borrow_constant;
                    wnaf_slice += 1;
                }

                if (i > 0) {
                    const size_t idx = i - 1;
                    output[NUM_WNAF_SLICES - idx - 1] = previous_slice;
                }
                previous_slice = wnaf_slice;

                // downshift raw_slice by 4 bits
                scalar = scalar >> WNAF_SLICE_BITS;
            }

            ASSERT(scalar == 0);

            output[0] = previous_slice;

            return output;
        };
        std::vector<MSM> msms;
        std::vector<ScalarMul> active_msm;

        // We start pc at `num_muls` and decrement for each mul processed.
        // This gives us two desired properties:
        // 1: the value of pc at the 1st row = number of muls (easy to check)
        // 2: the value of pc for the final mul = 1
        // The latter point is valuable as it means that we can add empty rows (where pc = 0) and still satisfy our
        // sumcheck relations that involve pc (if we did the other way around, starting at 1 and ending at num_muls,
        // we create a discontinuity in pc values between the last transcript row and the following empty row)
        uint32_t pc = num_muls;

        const auto process_mul = [&active_msm, &pc, &compute_wnaf_slices, &compute_precomputed_table](
                                     const auto& scalar, const auto& base_point) {
            if (scalar != 0) {
                active_msm.push_back(ScalarMul{
                    .pc = pc,
                    .scalar = scalar,
                    .base_point = base_point,
                    .wnaf_slices = compute_wnaf_slices(scalar),
                    .wnaf_skew = (scalar & 1) == 0,
                    .precomputed_table = compute_precomputed_table(base_point),
                });
                pc--;
            }
        };

        for (auto& op : vm_operations) {
            if (op.mul) {
                process_mul(op.z1, op.base_point);
                process_mul(op.z2, AffineElement{ op.base_point.x * FF::cube_root_of_unity(), -op.base_point.y });

            } else {
                if (!active_msm.empty()) {
                    msms.push_back(active_msm);
                    active_msm = {};
                }
            }
        }
        if (!active_msm.empty()) {
            msms.push_back(active_msm);
        }

        ASSERT(pc == 0);
        return msms;
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

    void add_accumulate(const AffineElement& to_add)
    {
        vm_operations.emplace_back(VMOperation{
            .add = true,
            .mul = false,
            .eq = false,
            .reset = false,
            .base_point = to_add,
            .z1 = 0,
            .z2 = 0,
            .mul_scalar_full = 0,
        });
    }

    void mul_accumulate(const AffineElement& to_mul, const CycleScalar& scalar)
    {
        CycleScalar z1 = 0;
        CycleScalar z2 = 0;
        auto converted = scalar.from_montgomery_form();
        CycleScalar::split_into_endomorphism_scalars(converted, z1, z2);
        z1 = z1.to_montgomery_form();
        z2 = z2.to_montgomery_form();
        vm_operations.emplace_back(VMOperation{
            .add = false,
            .mul = true,
            .eq = false,
            .reset = false,
            .base_point = to_mul,
            .z1 = z1,
            .z2 = z2,
            .mul_scalar_full = scalar,
        });
    }
    void eq(const AffineElement& expected)
    {
        vm_operations.emplace_back(VMOperation{
            .add = false,
            .mul = false,
            .eq = true,
            .reset = true,
            .base_point = expected,
            .z1 = 0,
            .z2 = 0,
            .mul_scalar_full = 0,
        });
    }

    void empty_row()
    {
        vm_operations.emplace_back(VMOperation{
            .add = false,
            .mul = false,
            .eq = false,
            .reset = false,
            .base_point = CycleGroup::affine_point_at_infinity,
            .z1 = 0,
            .z2 = 0,
            .mul_scalar_full = 0,
        });
    }

    RawPolynomials compute_full_polynomials()
    {
        const auto msms = get_msms();
        const auto flattened_muls = get_flattened_scalar_muls(msms);

        std::array<std::vector<size_t>, 2> point_table_read_counts;
        const auto transcript_state =
            ECCVMTranscriptBuilder<Flavor>::compute_transcript_state(vm_operations, get_number_of_muls());
        const auto precompute_table_state =
            ECCVMPrecomputedTablesBuilder<Flavor>::compute_precompute_state(flattened_muls);
        const auto msm_state =
            ECCVMMSMMBuilder<Flavor>::compute_msm_state(msms, point_table_read_counts, get_number_of_muls());

        const size_t msm_size = msm_state.size();
        const size_t transcript_size = transcript_state.size();
        const size_t precompute_table_size = precompute_table_state.size();

        const size_t num_rows = std::max(precompute_table_size, std::max(msm_size, transcript_size));

        const size_t num_rows_log2 = static_cast<size_t>(numeric::get_msb64(num_rows));
        size_t num_rows_pow2 = 1UL << (num_rows_log2 + (1UL << num_rows_log2 == num_rows ? 0 : 1));

        RawPolynomials rows;
        for (size_t j = 0; j < NUM_POLYNOMIALS; ++j) {
            rows[j] = Polynomial(num_rows_pow2);
        }

        rows.lagrange_first[0] = 1;
        rows.lagrange_second[1] = 1;
        rows.lagrange_last[rows.lagrange_last.size() - 1] = 1;

        for (size_t i = 0; i < point_table_read_counts[0].size(); ++i) {
            // TODO(@zac-williamson) explain off-by-one offset
            // When computing the WNAF slice for a point at point counter value `pc` and a round index `round`, the row
            // number that computes the slice can be derived. This row number is then mapped to the index of
            // `lookup_read_counts`. We do this mapping in `ecc_msm_relation`. We are off-by-one because we add an empty
            // row at the start of the WNAF columns that is not accounted for (index of lookup_read_counts maps to the
            // row in our WNAF columns that computes a slice for a given value of pc and round)
            rows.lookup_read_counts_0[i + 1] = point_table_read_counts[0][i];
            rows.lookup_read_counts_1[i + 1] = point_table_read_counts[1][i];
        }
        for (size_t i = 0; i < transcript_state.size(); ++i) {
            rows.transcript_accumulator_empty[i] = transcript_state[i].accumulator_empty;
            rows.q_transcript_add[i] = transcript_state[i].q_add;
            rows.q_transcript_mul[i] = transcript_state[i].q_mul;
            rows.q_transcript_eq[i] = transcript_state[i].q_eq;
            rows.transcript_q_reset_accumulator[i] = transcript_state[i].q_reset_accumulator;
            rows.q_transcript_msm_transition[i] = transcript_state[i].q_msm_transition;
            rows.transcript_pc[i] = transcript_state[i].pc;
            rows.transcript_msm_count[i] = transcript_state[i].msm_count;
            rows.transcript_x[i] = transcript_state[i].base_x;
            rows.transcript_y[i] = transcript_state[i].base_y;
            rows.transcript_z1[i] = transcript_state[i].z1;
            rows.transcript_z2[i] = transcript_state[i].z2;
            rows.transcript_z1zero[i] = transcript_state[i].z1_zero;
            rows.transcript_z2zero[i] = transcript_state[i].z2_zero;
            rows.transcript_op[i] = transcript_state[i].opcode;
            rows.transcript_accumulator_x[i] = transcript_state[i].accumulator_x;
            rows.transcript_accumulator_y[i] = transcript_state[i].accumulator_y;
            rows.transcript_msm_x[i] = transcript_state[i].msm_output_x;
            rows.transcript_msm_y[i] = transcript_state[i].msm_output_y;
        }

        // TODO(@zac-williamson) if final opcode resets accumulator, all subsequent "is_accumulator_empty" row values
        // must be 1. Ideally we find a way to tweak this so that empty rows that do nothing have column values that are
        // all zero
        if (transcript_state[transcript_state.size() - 1].accumulator_empty == 1) {
            for (size_t i = transcript_state.size(); i < num_rows_pow2; ++i) {
                rows.transcript_accumulator_empty[i] = 1;
            }
        }
        for (size_t i = 0; i < precompute_table_state.size(); ++i) {
            rows.q_wnaf[i] = (i != 0) ? 1 : 0; // todo document, derive etc etc // first row is empty!
            rows.table_pc[i] = precompute_table_state[i].pc;
            rows.table_point_transition[i] = static_cast<uint64_t>(precompute_table_state[i].point_transition);
            // rows.table_point_transition_shift = static_cast<uint64_t>(table_state[i].point_transition);
            rows.table_round[i] = precompute_table_state[i].round;
            rows.table_scalar_sum[i] = precompute_table_state[i].scalar_sum;

            rows.table_s1[i] = precompute_table_state[i].s1;
            rows.table_s2[i] = precompute_table_state[i].s2;
            rows.table_s3[i] = precompute_table_state[i].s3;
            rows.table_s4[i] = precompute_table_state[i].s4;
            rows.table_s5[i] = precompute_table_state[i].s5;
            rows.table_s6[i] = precompute_table_state[i].s6;
            rows.table_s7[i] = precompute_table_state[i].s7;
            rows.table_s8[i] = precompute_table_state[i].s8;
            // todo explain why skew is 7 not 1
            rows.table_skew[i] = precompute_table_state[i].skew ? 7 : 0;

            rows.table_dx[i] = precompute_table_state[i].precompute_double.x;
            rows.table_dy[i] = precompute_table_state[i].precompute_double.y;
            rows.table_tx[i] = precompute_table_state[i].precompute_accumulator.x;
            rows.table_ty[i] = precompute_table_state[i].precompute_accumulator.y;
        }

        for (size_t i = 0; i < msm_state.size(); ++i) {
            rows.q_msm_transition[i] = static_cast<int>(msm_state[i].q_msm_transition);
            rows.msm_q_add[i] = static_cast<int>(msm_state[i].q_add);
            rows.msm_q_double[i] = static_cast<int>(msm_state[i].q_double);
            rows.msm_q_skew[i] = static_cast<int>(msm_state[i].q_skew);
            rows.msm_accumulator_x[i] = msm_state[i].accumulator_x;
            rows.msm_accumulator_y[i] = msm_state[i].accumulator_y;
            rows.msm_pc[i] = msm_state[i].pc;
            rows.msm_size_of_msm[i] = msm_state[i].msm_size;
            rows.msm_count[i] = msm_state[i].msm_count;
            rows.msm_round[i] = msm_state[i].msm_round;
            rows.msm_q_add1[i] = static_cast<int>(msm_state[i].add_state[0].add);
            rows.msm_q_add2[i] = static_cast<int>(msm_state[i].add_state[1].add);
            rows.msm_q_add3[i] = static_cast<int>(msm_state[i].add_state[2].add);
            rows.msm_q_add4[i] = static_cast<int>(msm_state[i].add_state[3].add);
            rows.msm_x1[i] = msm_state[i].add_state[0].point.x;
            rows.msm_y1[i] = msm_state[i].add_state[0].point.y;
            rows.msm_x2[i] = msm_state[i].add_state[1].point.x;
            rows.msm_y2[i] = msm_state[i].add_state[1].point.y;
            rows.msm_x3[i] = msm_state[i].add_state[2].point.x;
            rows.msm_y3[i] = msm_state[i].add_state[2].point.y;
            rows.msm_x4[i] = msm_state[i].add_state[3].point.x;
            rows.msm_y4[i] = msm_state[i].add_state[3].point.y;
            rows.msm_collision_x1[i] = msm_state[i].add_state[0].collision_inverse;
            rows.msm_collision_x2[i] = msm_state[i].add_state[1].collision_inverse;
            rows.msm_collision_x3[i] = msm_state[i].add_state[2].collision_inverse;
            rows.msm_collision_x4[i] = msm_state[i].add_state[3].collision_inverse;
            rows.msm_lambda1[i] = msm_state[i].add_state[0].lambda;
            rows.msm_lambda2[i] = msm_state[i].add_state[1].lambda;
            rows.msm_lambda3[i] = msm_state[i].add_state[2].lambda;
            rows.msm_lambda4[i] = msm_state[i].add_state[3].lambda;
            rows.msm_slice1[i] = msm_state[i].add_state[0].slice;
            rows.msm_slice2[i] = msm_state[i].add_state[1].slice;
            rows.msm_slice3[i] = msm_state[i].add_state[2].slice;
            rows.msm_slice4[i] = msm_state[i].add_state[3].slice;
        }

        rows.q_transcript_mul_shift = typename Flavor::Polynomial(rows.q_transcript_mul.shifted());
        rows.q_transcript_accumulate_shift = typename Flavor::Polynomial(rows.q_transcript_accumulate.shifted());
        rows.transcript_msm_count_shift = typename Flavor::Polynomial(rows.transcript_msm_count.shifted());
        rows.transcript_accumulator_x_shift = typename Flavor::Polynomial(rows.transcript_accumulator_x.shifted());
        rows.transcript_accumulator_y_shift = typename Flavor::Polynomial(rows.transcript_accumulator_y.shifted());
        rows.table_scalar_sum_shift = typename Flavor::Polynomial(rows.table_scalar_sum.shifted());
        rows.table_dx_shift = typename Flavor::Polynomial(rows.table_dx.shifted());
        rows.table_dy_shift = typename Flavor::Polynomial(rows.table_dy.shifted());
        rows.table_tx_shift = typename Flavor::Polynomial(rows.table_tx.shifted());
        rows.table_ty_shift = typename Flavor::Polynomial(rows.table_ty.shifted());
        rows.q_msm_transition_shift = typename Flavor::Polynomial(rows.q_msm_transition.shifted());
        rows.msm_q_add_shift = typename Flavor::Polynomial(rows.msm_q_add.shifted());
        rows.msm_q_double_shift = typename Flavor::Polynomial(rows.msm_q_double.shifted());
        rows.msm_q_skew_shift = typename Flavor::Polynomial(rows.msm_q_skew.shifted());
        rows.msm_accumulator_x_shift = typename Flavor::Polynomial(rows.msm_accumulator_x.shifted());
        rows.msm_accumulator_y_shift = typename Flavor::Polynomial(rows.msm_accumulator_y.shifted());
        rows.msm_count_shift = typename Flavor::Polynomial(rows.msm_count.shifted());
        rows.msm_round_shift = typename Flavor::Polynomial(rows.msm_round.shifted());
        rows.msm_q_add1_shift = typename Flavor::Polynomial(rows.msm_q_add1.shifted());
        rows.msm_pc_shift = typename Flavor::Polynomial(rows.msm_pc.shifted());
        rows.table_pc_shift = typename Flavor::Polynomial(rows.table_pc.shifted());
        rows.transcript_pc_shift = typename Flavor::Polynomial(rows.transcript_pc.shifted());
        rows.table_round_shift = typename Flavor::Polynomial(rows.table_round.shifted());
        rows.transcript_accumulator_empty_shift =
            typename Flavor::Polynomial(rows.transcript_accumulator_empty.shifted());
        rows.q_wnaf_shift = typename Flavor::Polynomial(rows.q_wnaf.shifted());
        return rows;
    }

    bool check_circuit()
    {
        const FF gamma = FF::random_element();
        const FF eta = FF::random_element();
        const FF eta_sqr = eta.sqr();
        const FF eta_cube = eta_sqr * eta;
        auto permutation_offset =
            gamma * (gamma + eta_sqr) * (gamma + eta_sqr + eta_sqr) * (gamma + eta_sqr + eta_sqr + eta_sqr);
        permutation_offset = permutation_offset.invert();
        proof_system::honk::sumcheck::RelationParameters<typename Flavor::FF> params{
            .eta = eta,
            .beta = 0,
            .gamma = gamma,
            .public_input_delta = 0,
            .lookup_grand_product_delta = 0,
            .eta_sqr = eta_sqr,
            .eta_cube = eta_cube,
            .permutation_offset = permutation_offset,
        };

        auto rows = compute_full_polynomials();
        const size_t num_rows = rows[0].size();
        proof_system::honk::lookup_library::compute_logderivative_inverse<Flavor,
                                                                          honk::sumcheck::ECCVMLookupRelation<FF>>(
            rows, params, num_rows);

        honk::permutation_library::compute_permutation_grand_product<Flavor, honk::sumcheck::ECCVMSetRelation<FF>>(
            num_rows, rows, params);

        rows.z_perm_shift = typename Flavor::Polynomial(rows.z_perm.shifted());

        const auto evaluate_relation = [&]<typename Relation>(const std::string& relation_name) {
            auto relation = Relation();
            typename Relation::RelationValues result;
            for (auto& r : result) {
                r = 0;
            }
            constexpr size_t NUM_SUBRELATIONS = result.size();

            for (size_t i = 0; i < num_rows; ++i) {
                typename Flavor::RowPolynomials row;
                for (size_t j = 0; j < NUM_POLYNOMIALS; ++j) {
                    row[j] = rows[j][i];
                }
                relation.add_full_relation_value_contribution(result, row, params, 1);

                bool x = true;
                for (size_t j = 0; j < NUM_SUBRELATIONS; ++j) {
                    if (result[j] != 0) {
                        info("Relation ", relation_name, ", subrelation index ", j, " failed at row ", i);
                        x = false;
                    }
                }
                if (!x) {
                    return false;
                }
            }
            return true;
        };

        bool result = true;
        result = result && evaluate_relation.template operator()<honk::sumcheck::ECCVMTranscriptRelation<FF>>(
                               "ECCVMTranscriptRelation");
        result = result && evaluate_relation.template operator()<honk::sumcheck::ECCVMPointTableRelation<FF>>(
                               "ECCVMPointTableRelation");
        result =
            result && evaluate_relation.template operator()<honk::sumcheck::ECCVMWnafRelation<FF>>("ECCVMWnafRelation");
        result =
            result && evaluate_relation.template operator()<honk::sumcheck::ECCVMMSMRelation<FF>>("ECCVMMSMRelation");
        result =
            result && evaluate_relation.template operator()<honk::sumcheck::ECCVMSetRelation<FF>>("ECCVMSetRelation");

        auto lookup_relation = honk::sumcheck::ECCVMLookupRelation<barretenberg::fr>();
        typename honk::sumcheck::ECCVMLookupRelation<typename Flavor::FF>::RelationValues lookup_result;
        for (auto& r : lookup_result) {
            r = 0;
        }
        for (size_t i = 0; i < num_rows; ++i) {
            typename Flavor::RowPolynomials row;
            for (size_t j = 0; j < NUM_POLYNOMIALS; ++j) {
                row[j] = rows[j][i];
            }
            {
                lookup_relation.add_full_relation_value_contribution(lookup_result, row, params, 1);
            }
        }
        for (auto r : lookup_result) {
            if (r != 0) {
                info("Relation ECCVMLookupRelation failed.");
                return false;
            }
        }
        return result;
    }
};
} // namespace proof_system