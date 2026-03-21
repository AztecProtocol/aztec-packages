#pragma once
#include "barretenberg/common/thread.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

/**
 * @brief Log-derivative lookup relation for Poseidon2 op wire copy constraints.
 *
 * @details Proves that the 5 values in the densely-packed poseidon2_op_wire columns match the
 * circuit wire values at rows where lagrange_poseidon2_op = 1. Each Poseidon2 hash contributes
 * 5 values: 4 sponge state inputs (w_l, w_r, w_o, w_4) and 1 output (w_l_shift).
 *
 * The logup identity:
 *   Σ lagrange_poseidon2_op / (γ + w_l + w_r·β + w_o·β² + w_4·β³ + w_l_shift·β⁴)
 *   = Σ read_tag / (γ + op_wire_1 + op_wire_2·β + op_wire_3·β² + op_wire_4·β³ + op_wire_5·β⁴)
 *
 * where read_tag = w_r_shift (set to 1 by the circuit builder at hash rows to mark
 * active op wire entries). Each hash entry has multiplicity 1 (no read_counts needed).
 *
 * Subrelations (modeled after DatabusLookupRelation):
 *   1. Inverse correctness (per-row): I · L · T - inverse_exists = 0
 *   2. Logup balance (accumulated): Σ [is_read · I · T - read_tag · I · L] = 0
 *   3. Boolean check (per-row): read_tag² - read_tag = 0
 *
 * NOTE: This is a separate implementation from DatabusLookupRelation. In a future refactor,
 * both could be templated to share the identical logup structure.
 */
template <typename FF_> class Poseidon2OpQueueRelationImpl {
  public:
    using FF = FF_;

    static constexpr size_t NUM_LOOKUP_TERMS = 1;
    static constexpr size_t NUM_TABLE_TERMS = 1;

    static constexpr std::array<size_t, 3> SUBRELATION_PARTIAL_LENGTHS{
        5, // inverse correctness (degree 3 + scaling = 4)
        5, // logup balance (degree 4, no scaling)
        3, // boolean check on read_tag (degree 2 + scaling = 3)
    };

    static constexpr std::array<bool, 3> SUBRELATION_LINEARLY_INDEPENDENT{
        true,  // inverse correctness: per-row
        false, // logup balance: sum across trace
        true,  // boolean check: per-row
    };

    template <typename AllEntities> inline static bool skip([[maybe_unused]] const AllEntities& in)
    {
        // Skip if BOTH the read selector and the table tag are zero at this row
        return in.lagrange_poseidon2_op.is_zero() && in.w_r_shift.is_zero();
    }

    /**
     * @brief Compute the read term: γ + w_l + w_r·β + w_o·β² + w_4·β³ + w_l_shift·β⁴
     */
    template <typename Accumulator, typename AllEntities, typename Parameters>
    static Accumulator compute_read_term(const AllEntities& in, const Parameters& params)
    {
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;
        using ParamCoeff = typename Parameters::DataType::CoefficientAccumulator;

        const auto w_l_m = CoefficientAccumulator(in.w_l);
        const auto w_r_m = CoefficientAccumulator(in.w_r);
        const auto w_o_m = CoefficientAccumulator(in.w_o);
        const auto w_4_m = CoefficientAccumulator(in.w_4);
        const auto w_l_shift_m = CoefficientAccumulator(in.w_l_shift);
        const auto gamma_m = ParamCoeff(params.gamma);
        const auto beta_m = ParamCoeff(params.beta);
        const auto beta_sqr_m = ParamCoeff(params.beta_sqr);
        const auto beta_cube_m = ParamCoeff(params.beta_cube);
        const auto beta_four_m = ParamCoeff(params.beta_four);

        // γ + w_l + w_r·β + w_o·β² + w_4·β³ + w_l_shift·β⁴
        return Accumulator(w_l_m + gamma_m + w_r_m * beta_m + w_o_m * beta_sqr_m + w_4_m * beta_cube_m +
                           w_l_shift_m * beta_four_m);
    }

    /**
     * @brief Compute the table term: γ + op_wire_1 + op_wire_2·β + op_wire_3·β² + op_wire_4·β³ + op_wire_5·β⁴
     */
    template <typename Accumulator, typename AllEntities, typename Parameters>
    static Accumulator compute_table_term(const AllEntities& in, const Parameters& params)
    {
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;
        using ParamCoeff = typename Parameters::DataType::CoefficientAccumulator;

        const auto op1_m = CoefficientAccumulator(in.poseidon2_op_wire_1);
        const auto op2_m = CoefficientAccumulator(in.poseidon2_op_wire_2);
        const auto op3_m = CoefficientAccumulator(in.poseidon2_op_wire_3);
        const auto op4_m = CoefficientAccumulator(in.poseidon2_op_wire_4);
        const auto op5_m = CoefficientAccumulator(in.poseidon2_op_wire_5);
        const auto gamma_m = ParamCoeff(params.gamma);
        const auto beta_m = ParamCoeff(params.beta);
        const auto beta_sqr_m = ParamCoeff(params.beta_sqr);
        const auto beta_cube_m = ParamCoeff(params.beta_cube);
        const auto beta_four_m = ParamCoeff(params.beta_four);

        // γ + op1 + op2·β + op3·β² + op4·β³ + op5·β⁴
        return Accumulator(op1_m + gamma_m + op2_m * beta_m + op3_m * beta_sqr_m + op4_m * beta_cube_m +
                           op5_m * beta_four_m);
    }

    /**
     * @brief Compute inverse_exists predicate: 1 if either is_read or read_tag is active.
     * @details inverse_exists = is_read + read_tag - is_read · read_tag
     *        = 1 - (1 - is_read)(1 - read_tag)
     */
    template <typename Accumulator, typename AllEntities>
    static Accumulator compute_inverse_exists(const AllEntities& in)
    {
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        const auto is_read = Accumulator(CoefficientAccumulator(in.lagrange_poseidon2_op));
        const auto read_tag = Accumulator(CoefficientAccumulator(in.w_r_shift));

        return is_read + read_tag - is_read * read_tag;
    }

    /**
     * @brief Get a reference to the inverse polynomial for compute_logderivative_inverse.
     */
    template <typename Polynomials> static auto& get_inverse_polynomial(Polynomials& polynomials)
    {
        return polynomials.poseidon2_op_wire_inverses;
    }

    /**
     * @brief Determine whether the inverse needs to be computed at a given row.
     */
    template <typename AllValues> static bool operation_exists_at_row(const AllValues& row)
    {
        return (row.lagrange_poseidon2_op == 1 || row.w_r_shift == 1);
    }

    /**
     * @brief Compute the logderivative inverse polynomial for Poseidon2 op wire logup.
     * @details At each row where operation_exists_at_row() is true, compute
     * I = 1 / (read_term · table_term), then batch invert.
     */
    template <typename Polynomials>
    static void compute_logderivative_inverse(Polynomials& polynomials,
                                              auto& relation_parameters,
                                              const size_t circuit_size)
    {
        auto& inverse_polynomial = get_inverse_polynomial(polynomials);

        size_t min_iterations_per_thread = 1 << 6;
        size_t num_threads = bb::calculate_num_threads(circuit_size, min_iterations_per_thread);

        parallel_for(num_threads, [&](ThreadChunk chunk) {
            for (size_t i : chunk.range(circuit_size)) {
                auto row = polynomials.get_row(i);
                if (operation_exists_at_row(row)) {
                    auto value = compute_read_term<FF>(row, relation_parameters) *
                                 compute_table_term<FF>(row, relation_parameters);
                    inverse_polynomial.at(i) = value;
                }
            }
        });

        FF::batch_invert(inverse_polynomial.coeffs());
    }

    /**
     * @brief Accumulate the 3 subrelation contributions.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor)
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;
        using ShortAccumulator = std::tuple_element_t<2, ContainerOverSubrelations>;

        const auto inverses = Accumulator(CoefficientAccumulator(in.poseidon2_op_wire_inverses));
        const auto read_term = compute_read_term<Accumulator>(in, params);
        const auto table_term = compute_table_term<Accumulator>(in, params);
        const auto inverse_exists = compute_inverse_exists<Accumulator>(in);
        const auto is_read = Accumulator(CoefficientAccumulator(in.lagrange_poseidon2_op));
        const auto read_tag_m = CoefficientAccumulator(in.w_r_shift);

        // Subrelation 1: Inverse correctness (per-row, degree 3)
        // I · L · T - inverse_exists = 0
        std::get<0>(accumulator) += (read_term * table_term * inverses - inverse_exists) * scaling_factor;

        // Subrelation 2: Logup balance (accumulated, no scaling factor)
        // Σ [is_read · I · T - read_tag · I · L] = 0
        auto tmp = is_read * table_term;
        tmp -= Accumulator(read_tag_m) * read_term;
        tmp *= inverses;
        std::get<1>(accumulator) += tmp;

        // Subrelation 3: Boolean check on read_tag (per-row, degree 2)
        // read_tag² - read_tag = 0
        const auto read_tag = ShortAccumulator(read_tag_m);
        std::get<2>(accumulator) += (read_tag * read_tag - read_tag) * scaling_factor;
    }
};

template <typename FF> using Poseidon2OpQueueRelation = Relation<Poseidon2OpQueueRelationImpl<FF>>;

} // namespace bb
