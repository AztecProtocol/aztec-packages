// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke, Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include <array>
#include <tuple>

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

/**
 * @brief Log-derivative lookup argument relation for establishing lookup reads from tables with 3 or fewer columns
 *
 * @details The lookup argument seeks to prove lookups from a column by establishing the following sum:
 * \f[
 *  \sum_{i=0}^{n-1} q_{\text{logderiv_lookup},i} \cdot \frac{1}{\text{lookup_term}_i}
 *                                  - \text{read_count}_i \cdot \frac{1}{\text{table_term}_i} = 0
 * \f]
 * where
 * \f[
 *  \text{table_term} = \text{table_col}_1 + \gamma + \text{table_col}_2 \cdot \beta
 *                                  + \text{table_col}_3 \cdot \beta^2 + \text{table_index} \cdot \beta^3
 * \f]
 * and
 * \f[
 *  \text{lookup_term} = \text{derived_table_entry}_1 + \gamma + \text{derived_table_entry}_2 \cdot \beta
 *                     + \text{derived_table_entry}_3 \cdot \beta^2 + \text{table_index} \cdot \beta^3
 * \f]
 * with
 * \f[
 *   \text{derived_table_entry}_i = w_i - \text{col_step_size}_i \cdot w_{i,\text{shift}}
 * \f]
 * (read note for explanation).
 *
 * This expression is motivated by taking the derivative of the log of a more conventional grand product style set
 * equivalence argument (see e.g. https://eprint.iacr.org/2022/1530.pdf for details).
 *
 * In practice, we must rephrase this expression in terms of polynomials, one of which is a polynomial \f$I\f$
 * containing (indirectly) the rational functions in the above expression:
 * \f$I_i = 1/[(\text{lookup_term}_i) \cdot (\text{table_term}_i)]\f$. This leads to two subrelations. The first
 * demonstrates that the inverse polynomial \f$I\f$ is correctly formed. The second is the primary lookup identity,
 * where the rational functions are replaced by the use of the inverse polynomial \f$I\f$. These two subrelations can
 * be expressed as follows:
 *
 * <b>Subrelation 1 (Inverse correctness):</b>
 * \f[
 * I_i \cdot (\text{lookup_term}_i) \cdot (\text{table_term}_i) - 1 = 0
 * \f]
 *
 * <b>Subrelation 2 (Lookup identity):</b>
 * \f[
 * \sum_{i=0}^{n-1} [q_{\text{logderiv_lookup}} \cdot I_i \cdot \text{table_term}_i
 *                                  - \text{read_count}_i \cdot I_i \cdot \text{lookup_term}_i] = 0
 * \f]
 *
 * To not compute the inverse terms packed in \f$I_i\f$ for indices not included in the sum we introduce a
 * witness called inverse_exists, which is zero when either read_count\f$_i\f$ is nonzero (a boolean called
 * read_tag) or we have a read gate. This is represented by setting \f$\text{inverse_exists} = 1 - (1 -
 * \text{read_tag}) \cdot (1 - \text{is_read_gate})\f$. Since is_read_gate is only dependent on selector values,
 * we can assume that the verifier can check that it is boolean. However, if read_tag (which is a derived witness),
 * is not constrained to be boolean, one can set the inverse_exists to any value when is_read_gate = 0, because
 * inverse_exists is a linear function of read_tag then. Thus we have a third subrelation that ensures read_tag is
 * a boolean value.
 *
 * <b>Subrelation 3 (Boolean check):</b>
 * \f[
 * \text{read_tag} \cdot \text{read_tag} - \text{read_tag} = 0
 * \f]
 *
 * Further constraining of read_tags and read_counts is not required, since by tampering read_tags a malicious
 * prover can only skip a table_term. This is disadvantageous for the cheating prover as it reduces the size of the
 * lookup table. Hence, a malicious prover cannot abuse this to prove an incorrect lookup.
 *
 * @note Subrelation (2) is "linearly dependent" in the sense that it establishes that a sum across all rows of the
 * execution trace is zero, rather than that some expression holds independently at each row. Accordingly, this
 * subrelation is not multiplied by a scaling factor at each accumulation step.
 *
 * @note The "real" table entries must be 'derived' from wire values since instead of storing actual values in wires
 * we store successive accumulators, the differences of which are equal to entries in a table. This is an efficiency
 * trick for the case where entries of the "real" table correspond to limbs of a value too large to be supported by
 * the lookup table. This way we avoid using additional gates to reconstruct full size values from the limbs contained
 * in tables. See the documentation in method bb::plookup::get_lookup_accumulators().
 *
 * IMPORTANT: γ and β must be independent challenges for soundness.
 */

template <typename FF_> class LogDerivLookupRelationImpl {
  public:
    using FF = FF_;
    static constexpr size_t TABLE_TERMS = 1; // the number of table terms in the lookup relation
    // 1 + polynomial degree of this relation
    static constexpr size_t INVERSE_SUBRELATION_LENGTH = 5; // both subrelations are degree 4
    static constexpr size_t LOOKUP_SUBRELATION_LENGTH = 5;  // both subrelations are degree 4
    static constexpr size_t BOOLEAN_CHECK_SUBRELATION_LENGTH =
        3; // deg + 1 of the relation checking that read_tag_m is a boolean value

    static constexpr std::array<size_t, 3> SUBRELATION_PARTIAL_LENGTHS{
        INVERSE_SUBRELATION_LENGTH,      // inverse construction sub-relation
        LOOKUP_SUBRELATION_LENGTH,       // log derivative lookup argument sub-relation
        BOOLEAN_CHECK_SUBRELATION_LENGTH // boolean check sub-relation
    };

    static constexpr std::array<bool, 3>
        SUBRELATION_LINEARLY_INDEPENDENT = { true /*Inverse subrelation*/,
                                             false /*Lookup subrelation*/,
                                             true /*read_tag boolean check subrelation*/ };

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        // Ensure the input does not contain a lookup gate or data that is being read
        return in.q_lookup.is_zero() && in.lookup_read_counts.is_zero();
    }

    /**
     * @brief Does the provided row contain data relevant to table lookups
     *
     * @details Used to determine whether the polynomial of inverses must be computed at a given row. In order to avoid
     * unnecessary computation, the polynomial of inverses \f$I\f$ is only computed for rows at which the lookup
     * relation is "active". It is active if either (1) the present row contains a lookup gate (i.e.
     * \f$q_{\text{lookup}} = 1\f$), or (2) the present row contains table data that has been looked up in this circuit
     * (lookup_read_tags \f$= 1\f$, or equivalently, if the row in consideration has index \f$i\f$, the data in
     * polynomials table\f$_i\f$ has been utilized in the circuit).
     *
     */
    template <typename AllValues> static bool operation_exists_at_row(const AllValues& row)
    {
        // is the row a lookup gate or does it contain table data that has been read at some point in this circuit
        return (row.q_lookup == 1) || (row.lookup_read_tags == 1);
    }

    // Get the inverse polynomial for this relation
    template <typename AllEntities> static auto& get_inverse_polynomial(AllEntities& in) { return in.lookup_inverses; }

    /**
     * @brief Compute the Accumulator whose values indicate whether the inverse is computed or not
     *
     * @details This is needed for efficiency since we don't need to compute the inverse unless the log derivative
     * lookup relation is active at a given row. We skip the inverse computation for all the rows that
     * \f$\text{read_count}_i = 0\f$ AND read_selector is 0.
     *
     * @note read_tag is constructed such that \f$\text{read_tag}_i \in \{0, 1\}\f$. We add a subrelation to check
     * that read_tag is a boolean value.
     *
     * @tparam Accumulator Accumulator type for polynomial evaluations
     * @tparam AllEntities Type containing all polynomial entities
     * @param in All entities
     * @return Accumulator indicating whether inverse should be computed
     */
    template <typename Accumulator, typename AllEntities>
    static Accumulator compute_inverse_exists(const AllEntities& in)
    {
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        const auto row_has_write = CoefficientAccumulator(in.lookup_read_tags);
        const auto row_has_read = CoefficientAccumulator(in.q_lookup);
        // Relation checking: is_read_gate == 1 || read_tag == 1
        // Important note: the relation written below assumes that is_read_gate and read_tag are boolean values, which
        // is guaranteed by the boolean_check subrelation. If not, fixing one of the two, the return value is a linear
        // function in the other variable and can be set to an arbitrary value independent of the fixed value. See the
        // boolean_check subrelation for more explanation.
        // 1 - (1 - row_has_write) * (1- row_has_read)
        //  degree                1             1                1                 1     =    2
        return Accumulator(-(row_has_write * row_has_read) + row_has_write + row_has_read);
    }

    /**
     * @brief Compute the table term
     *
     * @details Computes \f$\text{table}_1 + \gamma + \text{table}_2 \cdot \beta + \text{table}_3 \cdot \beta^2 +
     * \text{table}_4 \cdot \beta^3\f$, where table\f$_{1,2,3}\f$ correspond to the (maximum) three columns of the
     * lookup table and table\f$_4\f$ is the unique identifier of the lookup table (table_index).
     *
     * @tparam Accumulator Accumulator type for polynomial evaluations
     * @tparam AllEntities Type containing all polynomial entities
     * @tparam Parameters Type containing relation parameters
     * @param in All entities
     * @param params Relation parameters (gamma, eta, eta_two, eta_three)
     * @return Accumulator containing the computed table term
     */
    // Compute table_1 + gamma + table_2 * eta + table_3 * eta_2 + table_4 * eta_3
    // table_1,2,3 correspond to the (maximum) three columns of the lookup table and table_4 is the unique identifier
    // of the lookup table table_index
    template <typename Accumulator, typename AllEntities, typename Parameters>
    static Accumulator compute_table_term(const AllEntities& in, const Parameters& params)
    {
        using ParameterCoefficientAccumulator = typename Parameters::DataType::CoefficientAccumulator;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        const auto gamma = ParameterCoefficientAccumulator(params.gamma);
        const auto beta = ParameterCoefficientAccumulator(params.beta);
        const auto beta_sqr = ParameterCoefficientAccumulator(params.beta_sqr);
        const auto beta_cube = ParameterCoefficientAccumulator(params.beta_cube);

        auto table_1 = CoefficientAccumulator(in.table_1);
        auto table_2 = CoefficientAccumulator(in.table_2);
        auto table_3 = CoefficientAccumulator(in.table_3);
        auto table_4 = CoefficientAccumulator(in.table_4);

        // degree          1     0           1         0          1         0        =   1
        auto result = (table_2 * beta) + (table_3 * beta_sqr) + (table_4 * beta_cube);
        result += table_1;
        result += gamma;
        return Accumulator(result);
    }

    template <typename Accumulator, typename AllEntities, typename Parameters>
    static Accumulator compute_lookup_term(const AllEntities& in, const Parameters& params)
    {
        using ParameterCoefficientAccumulator = typename Parameters::DataType::CoefficientAccumulator;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        const auto gamma = ParameterCoefficientAccumulator(params.gamma);
        const auto beta = ParameterCoefficientAccumulator(params.beta);
        const auto beta_sqr = ParameterCoefficientAccumulator(params.beta_sqr);
        const auto beta_cube = ParameterCoefficientAccumulator(params.beta_cube);

        auto w_1 = CoefficientAccumulator(in.w_l);
        auto w_2 = CoefficientAccumulator(in.w_r);
        auto w_3 = CoefficientAccumulator(in.w_o);

        auto w_1_shift = CoefficientAccumulator(in.w_l_shift);
        auto w_2_shift = CoefficientAccumulator(in.w_r_shift);
        auto w_3_shift = CoefficientAccumulator(in.w_o_shift);

        auto table_index = CoefficientAccumulator(in.q_o);
        auto negative_column_1_step_size = CoefficientAccumulator(in.q_r);
        auto negative_column_2_step_size = CoefficientAccumulator(in.q_m);
        auto negative_column_3_step_size = CoefficientAccumulator(in.q_c);

        // The wire values for lookup gates are accumulators structured in such a way that the differences w_i -
        // step_size*w_i_shift result in values present in column i of a corresponding table. See the documentation in
        // method bb::plookup::get_lookup_accumulators() in  for a detailed explanation.
        // degree                                      1                 1         1       0 = 2
        auto derived_table_entry_1 = (negative_column_1_step_size * w_1_shift) + (w_1 + gamma);
        // degree                                        1             1          1 =    2
        auto derived_table_entry_2 = (negative_column_2_step_size * w_2_shift) + w_2;
        // degree                                         1              1          1 = 2
        auto derived_table_entry_3 = (negative_column_3_step_size * w_3_shift) + w_3;
        //                              1           0    = 1
        auto table_index_entry = table_index * beta_cube;

        // (w_1 + γ + q_2*w_1_shift) + β(w_2 + q_m*w_2_shift) + β²(w_3 + q_c*w_3_shift) + β³*q_index.
        // deg 2 or 3
        // degree                            2              0                      2                    0   =   2
        auto result = Accumulator(derived_table_entry_2) * beta + Accumulator(derived_table_entry_3) * beta_sqr;
        result += Accumulator(derived_table_entry_1 + table_index_entry);
        return result;
    }

    /**
     * @brief Construct the polynomial \f$I\f$ whose components are the inverse of the product of the read and write
     * terms
     *
     * @details If the denominators of log derivative lookup relation are lookup_term and table_term, then
     * \f$I_i = (\text{lookup_term}_i \cdot \text{table_term}_i)^{-1}\f$.
     *
     * @note Importantly, \f$I_i = 0\f$ for rows \f$i\f$ at which there is no read or write, so the cost of this method
     * is proportional to the actual number of lookups.
     *
     */
    template <typename Polynomials>
    static void compute_logderivative_inverse(Polynomials& polynomials,
                                              auto& relation_parameters,
                                              const size_t circuit_size)
    {
        BB_BENCH_NAME("Lookup::compute_logderivative_inverse");
        auto& inverse_polynomial = get_inverse_polynomial(polynomials);

        size_t min_iterations_per_thread = 1 << 6; // min number of iterations for which we'll spin up a unique thread
        size_t num_threads = bb::calculate_num_threads(circuit_size, min_iterations_per_thread);

        parallel_for(num_threads, [&](ThreadChunk chunk) {
            for (size_t i : chunk.range(circuit_size)) {
                // We only compute the inverse if this row contains a lookup gate or data that has been looked up
                if (polynomials.q_lookup.get(i) == 1 || polynomials.lookup_read_tags.get(i) == 1) {
                    // TODO(https://github.com/AztecProtocol/barretenberg/issues/940): avoid get_row if possible.
                    auto row = polynomials.get_row(i); // Note: this is a copy. use sparingly!
                    auto value = compute_lookup_term<FF>(row, relation_parameters) *
                                 compute_table_term<FF>(row, relation_parameters);
                    inverse_polynomial.at(i) = value;
                }
            }
        });

        // Compute inverse polynomial I in place by inverting the product at each row
        FF::batch_invert(inverse_polynomial.coeffs());
    };

    /**
     * @brief Accumulate the subrelation contributions for reads from a lookup table
     * @details Three subrelations are required per bus column, first to establish correctness of the precomputed
     * inverses, second to establish the validity of the read, third establishes that read_tags is a boolean value.
     * @param accumulator transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in an std::array containing the fully extended Accumulator edges.
     * @param params contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor)
    {
        // declare the accumulator of the maximum length, in non-ZK Flavors, they are of the same length,
        // whereas in ZK Flavors, the accumulator corresponding log derivative lookup argument sub-relation is the
        // longest
        using ShortAccumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
        using BooleanCheckerAccumulator = typename std::tuple_element_t<2, ContainerOverSubrelations>;
        using ShortView = typename ShortAccumulator::View;

        using Accumulator = typename std::tuple_element_t<1, ContainerOverSubrelations>;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        // allows to re-use the values accumulated by the accumulator of the size smaller than
        // the size of Accumulator declared above

        const auto inverses_m = CoefficientAccumulator(in.lookup_inverses); // Degree 1
        const Accumulator inverses(inverses_m);
        const auto read_counts_m = CoefficientAccumulator(in.lookup_read_counts); // Degree 1
        const auto read_selector_m = CoefficientAccumulator(in.q_lookup);         // Degree 1

        const auto inverse_exists = compute_inverse_exists<Accumulator>(in);   // Degree 2
        const auto lookup_term = compute_lookup_term<Accumulator>(in, params); // Degree 2
        const auto table_term = compute_table_term<Accumulator>(in, params);   // Degree 1

        // Establish the correctness of the polynomial of inverses I. Note: inverses is computed so that the value is 0
        // if !inverse_exists.
        // Degrees:                 5                 2           1           1                          0
        const Accumulator logderiv_first_term = (lookup_term * table_term * inverses - inverse_exists) * scaling_factor;
        std::get<0>(accumulator) += ShortView(logderiv_first_term); // Deg 5

        // Establish validity of the read. Note: no scaling factor here since this constraint is 'linearly dependent,
        // i.e. enforced across the entire trace, not on a per-row basis.
        // Degrees:                         1                  2          =       3
        Accumulator tmp = Accumulator(read_selector_m) * table_term;
        tmp -= (Accumulator(read_counts_m) * lookup_term);
        tmp *= inverses;                 // degree 4(5)
        std::get<1>(accumulator) += tmp; // Deg 4 (5)

        // We should make sure that the read_tag is a boolean value
        const auto read_tag_m = CoefficientAccumulator(in.lookup_read_tags);
        const auto read_tag = BooleanCheckerAccumulator(read_tag_m);
        // degree                          1         1                       0(1) =  2
        std::get<2>(accumulator) += (read_tag * read_tag - read_tag) * scaling_factor;
    }
};

template <typename FF> using LogDerivLookupRelation = Relation<LogDerivLookupRelationImpl<FF>>;

} // namespace bb
