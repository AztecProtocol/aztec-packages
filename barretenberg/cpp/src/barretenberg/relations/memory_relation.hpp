// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

template <typename FF_> class MemoryRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 6> SUBRELATION_PARTIAL_LENGTHS{
        6, // memory sub-relation;
        6, // ROM consistency sub-relation 1
        6, // ROM consistency sub-relation 2
        6, // RAM consistency sub-relation 1
        6, // RAM consistency sub-relation 2
        6  // RAM consistency sub-relation 3
    };

    static constexpr std::array<size_t, 6> TOTAL_LENGTH_ADJUSTMENTS{
        1, // memory sub-relation
        1, // ROM consistency sub-relation 1
        1, // ROM consistency sub-relation 2
        1, // RAM consistency sub-relation 1
        1, // RAM consistency sub-relation 2
        1  // RAM consistency sub-relation 3
    };

    /**
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero
     *
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in) { return in.q_memory.is_zero(); }

    /**
     * @brief RAM/ROM memory relation
     * @details Adds contributions for identities associated with RAM/ROM memory operations custom gates:
     *  * RAM/ROM read-write consistency check
     *  * RAM timestamp difference consistency check
     *  * RAM/ROM index difference consistency check
     *
     * Multiple selectors are used to 'switch' memory gates on/off according to the following pattern:
     *
     * | gate type                    | q_mem | q_1 | q_2 | q_4 | q_m | q_c | q_arith |
     * | ---------------------------- | ----- | --- | --- | --- | --- | --- | ------  |
     * | RAM/ROM access gate          | 1     | 1   | 0   | 0   | 1   | --- | 0       |
     * | RAM timestamp check          | 1     | 1   | 0   | 1   | 0   | --- | 0       |
     * | ROM consistency check        | 1     | 1   | 1   | 0   | 0   | --- | 0       |
     * | RAM consistency check        | 1     | 0   | 0   | 0   | 0   | 0   | 1       |
     *
     * NOTE: Proposed updated selector pattern (i.e. replace q_arith with q_3):
     *
     * | gate type                    | q_mem | q_1 | q_2 | q_3 | q_4 | q_m | q_c |
     * | ---------------------------- | ----- | --- | --- | --- | --- | --- | --- |
     * | RAM/ROM access gate          | 1     | 1   | 0   | 0   | 0   | 1   | --- |
     * | RAM timestamp check          | 1     | 1   | 0   | 0   | 1   | 0   | --- |
     * | ROM consistency check        | 1     | 1   | 1   | 0   | 0   | 0   | --- |
     * | RAM consistency check        | 1     | 0   | 0   | 1   | 0   | 0   | 0   |
     *
     * N.B. The RAM consistency check identity is degree 3. To keep the overall quotient degree at <=5, only 2 selectors
     * can be used to select it.
     *
     * N.B.2 The q_c selector is used to store circuit-specific values in the RAM/ROM access gate
     *
     * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in an std::array containing the Totaly extended Univariate edges.
     * @param parameters contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    inline static void accumulate(ContainerOverSubrelations& accumulators,
                                  const AllEntities& in,
                                  const Parameters& params,
                                  const FF& scaling_factor)
    {
        PROFILE_THIS_NAME("Memory::accumulate");
        // all accumulators are of the same length, so we set our accumulator type to (arbitrarily) be the first one.
        // if there were one that were shorter, we could also profitably use a `ShortAccumulator` type. however,
        // that is not the case here.
        using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
        using View = typename Accumulator::View;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        using ParameterView = GetParameterView<Parameters, View>;
        using ParameterCoefficientAccumulator = typename ParameterView::CoefficientAccumulator;

        const auto& eta_m = ParameterCoefficientAccumulator(params.eta);
        const auto& eta_two_m = ParameterCoefficientAccumulator(params.eta_two);
        const auto& eta_three_m = ParameterCoefficientAccumulator(params.eta_three);

        auto w_1_m = CoefficientAccumulator(in.w_l);
        auto w_2_m = CoefficientAccumulator(in.w_r);
        auto w_3_m = CoefficientAccumulator(in.w_o);
        auto w_4_m = CoefficientAccumulator(in.w_4);
        auto w_1_shift_m = CoefficientAccumulator(in.w_l_shift);
        auto w_2_shift_m = CoefficientAccumulator(in.w_r_shift);
        auto w_3_shift_m = CoefficientAccumulator(in.w_o_shift);
        auto w_4_shift_m = CoefficientAccumulator(in.w_4_shift);

        auto q_1_m = CoefficientAccumulator(in.q_l);
        auto q_2_m = CoefficientAccumulator(in.q_r);
        auto q_4_m = CoefficientAccumulator(in.q_4);
        auto q_m_m = CoefficientAccumulator(in.q_m);
        auto q_c_m = CoefficientAccumulator(in.q_c);
        auto q_arith_m = CoefficientAccumulator(in.q_arith);

        auto q_memory_m = CoefficientAccumulator(in.q_memory);

        /**
         * MEMORY
         *
         * A RAM memory record contains a tuple of the following fields:
         *  * i: `index` of memory cell being accessed
         *  * t: `timestamp` of memory cell being accessed (used for RAM, set to 0 for ROM)
         *  * v: `value` of memory cell being accessed
         *  * a: `access` type of record. read: 0 = read, 1 = write
         *  * r: `record` of memory cell. record = access + index * eta + timestamp * η₂ + value * η₃
         *
         * A ROM memory record contains a tuple of the following fields:
         *  * i: `index` of memory cell being accessed
         *  * v: `value1` of memory cell being accessed (ROM tables can store up to 2 values per index)
         *  * v2:`value2` of memory cell being accessed (ROM tables can store up to 2 values per index)
         *  * r: `record` of memory cell. record = index * eta + value2 * η₂ + value1 * η₃
         *
         *  When performing a read/write access, the values of i, t, v, v2, a, r are stored in the following wires +
         * selectors, depending on whether the gate is a RAM read/write or a ROM read
         *
         *  | gate type | i  | v2/t  |  v | a  | r  |
         *  | --------- | -- | ----- | -- | -- | -- |
         *  | ROM       | w1 | w2    | w3 | -- | w4 |
         *  | RAM       | w1 | w2    | w3 | qc | w4 |
         *
         * (for accesses where `index` is a circuit constant, it is assumed the circuit will apply a copy constraint on
         * `w2` to fix its value)
         *
         **/

        /**
         * Memory Record Check
         * Partial degree: 1
         * Total degree: 2
         *
         * A ROM/RAM access gate can be evaluated with the `memory_record_check` identity:
         *
         * qc + w1 \eta + w2 η₂ + w3 η₃ - w4 = 0
         *
         * For ROM gates, qc = 0
         * Here, informally, w4 is the "record" (a.k.a. fingerprint) of the access gate.
         */

        // memory_record_check and partial_record_check_m have either deg 1 or 2 (the latter refers to the
        // functional univariate degree when we use PG as opposed to sumcheck.)
        auto memory_record_check_m = w_3_m * eta_three_m;
        memory_record_check_m += w_2_m * eta_two_m;
        memory_record_check_m += w_1_m * eta_m;
        memory_record_check_m += q_c_m;
        auto partial_record_check_m = memory_record_check_m; // used later in RAM consistency check
        memory_record_check_m = memory_record_check_m - w_4_m;

        auto memory_record_check = Accumulator(memory_record_check_m);
        /**
         * ROM Consistency Check
         * Partial degree: 1
         * Total degree: 4
         *
         * For every ROM read, we require a multiset check applied between the record witnesses and a
         * second set of records that are sorted. (See the Plookup paper.)
         * In fact, due to our implementation, this is automatic; we implicitly have copy-constraints realizing the
         * multiset equality. In other words, the multiset check will be instantiated by a permutation check.
         *
         * We apply the following checks for the sorted records:
         *
         * 1. w1, w2, w3 correctly map to 'index', 'v1, 'v2' for a given record value at w4
         * 2. index values for adjacent records are monotonically increasing
         * 3. if, at gate i, index_i == index_{i + 1}, then value1_i == value1_{i + 1} and value2_i == value2_{i + 1}
         *
         */
        auto neg_index_delta_m = w_1_m - w_1_shift_m;
        auto index_delta_is_zero_m = neg_index_delta_m + FF(1); // deg 1
        auto record_delta_m = w_4_shift_m - w_4_m;

        Accumulator index_is_monotonically_increasing(neg_index_delta_m.sqr() +
                                                      neg_index_delta_m); // check if next index minus current index is
                                                                          // 0 or 1. deg 2

        auto adjacent_values_match_if_adjacent_indices_match =
            Accumulator(index_delta_is_zero_m * record_delta_m); // deg 2

        auto q_memory_by_scaling_m = q_memory_m * scaling_factor; // deg 1
        auto q_memory_by_scaling = Accumulator(q_memory_by_scaling_m);
        auto q_one_by_two_m = q_1_m * q_2_m; // deg 2
        auto q_one_by_two = Accumulator(q_one_by_two_m);
        auto q_one_by_two_by_memory_by_scaling = q_one_by_two * q_memory_by_scaling; // deg 3

        std::get<1>(accumulators) +=
            adjacent_values_match_if_adjacent_indices_match * q_one_by_two_by_memory_by_scaling;            // deg 5
        std::get<2>(accumulators) += index_is_monotonically_increasing * q_one_by_two_by_memory_by_scaling; // deg 5
        auto ROM_consistency_check_identity = memory_record_check * q_one_by_two; // deg 3 or 4

        /**
         * RAM Consistency Check
         *
         * The 'access' type of the record is extracted with the expression `w_4 - partial_record_check`
         * (i.e. for an honest Prover `w1 * η + w2 * η₂ + w3 * η₃ - w4 = access`.
         * This is validated by requiring `access` to be boolean
         *
         * For two adjacent entries in the sorted list if _both_
         *  A) index values match
         *  B) adjacent access value is 0 (i.e. next gate is a READ)
         * then
         *  C) both values must match.
         * The gate boolean check is
         * (A && B) => C  === !(A && B) || C ===  !A || !B || C
         *
         * N.B. it is the responsibility of the circuit writer to ensure that every RAM cell is initialized
         * with a WRITE operation.
         */
        auto neg_access_type_m = (partial_record_check_m - w_4_m); // will be 0 or 1 for honest Prover; deg 1 or 2
        Accumulator neg_access_type(neg_access_type_m);
        auto access_check = neg_access_type.sqr() + neg_access_type; // check value is 0 or 1; deg 2 or 4

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/757): If we sorted in
        // reverse order we could re-use `partial_record_check`  1 -  (w3' * eta_three + w2' * eta_two + w1' *
        // eta) deg 1 or 2
        auto neg_next_gate_access_type_m = w_3_shift_m * eta_three_m;
        neg_next_gate_access_type_m += w_2_shift_m * eta_two_m;
        neg_next_gate_access_type_m += w_1_shift_m * eta_m;
        neg_next_gate_access_type_m = neg_next_gate_access_type_m - w_4_shift_m;
        Accumulator neg_next_gate_access_type(neg_next_gate_access_type_m); // deg 1 or 2
        auto value_delta_m = w_3_shift_m - w_3_m;
        auto adjacent_values_match_if_adjacent_indices_match_and_next_access_is_a_read_operation =
            Accumulator(index_delta_is_zero_m * value_delta_m) *
            Accumulator(neg_next_gate_access_type_m + FF(1)); // deg 3 or 4

        // We can't apply the RAM consistency check identity on the final entry in the sorted list (the wires in the
        // next gate would make the identity fail).  We need to validate that its 'access type' bool is correct. Can't
        // do  with an arithmetic gate because of the  `eta` factors. We need to check that the *next* gate's access
        // type is  correct, to cover this edge case
        // deg 2 or 4
        auto next_gate_access_type_is_boolean = neg_next_gate_access_type.sqr() + neg_next_gate_access_type;

        auto q_arith_by_memory_and_scaling = Accumulator(q_arith_m * q_memory_by_scaling_m);
        // Putting it all together...
        std::get<3>(accumulators) +=
            adjacent_values_match_if_adjacent_indices_match_and_next_access_is_a_read_operation *
            q_arith_by_memory_and_scaling;                                                              // deg 5 or 6
        std::get<4>(accumulators) += index_is_monotonically_increasing * q_arith_by_memory_and_scaling; // deg 4
        std::get<5>(accumulators) += next_gate_access_type_is_boolean * q_arith_by_memory_and_scaling;  // deg 4 or 6

        auto RAM_consistency_check_identity = access_check * q_arith_by_memory_and_scaling; // deg 3 or 5

        /**
         * RAM Timestamp Consistency Check
         *
         * | w1 | w2 | w3 | w4 |
         * | index | timestamp | timestamp_check | -- |
         *
         * Let delta_index = index_{i + 1} - index_{i}
         *
         * Iff delta_index == 0, timestamp_check = timestamp_{i + 1} - timestamp_i
         * Else timestamp_check = 0
         */
        auto timestamp_delta_m = w_2_shift_m - w_2_m;                                            // deg 1
        auto RAM_timestamp_check_identity_m = index_delta_is_zero_m * timestamp_delta_m - w_3_m; // deg 2
        Accumulator RAM_timestamp_check_identity(RAM_timestamp_check_identity_m);
        /**
         * The complete RAM/ROM memory identity
         * Partial degree:
         */
        auto memory_identity = ROM_consistency_check_identity;                        // deg 3 or 4
        memory_identity += RAM_timestamp_check_identity * Accumulator(q_4_m * q_1_m); // deg 4
        memory_identity += memory_record_check * Accumulator(q_m_m * q_1_m); // deg 4 ( = deg 4 + (deg 3 or deg 4))

        // (deg 4) + (deg 4) + (deg 3)
        memory_identity *= q_memory_by_scaling;            // deg 5
        memory_identity += RAM_consistency_check_identity; // deg 5 ( = deg 5 + (deg 3 or deg 5))
        std::get<0>(accumulators) += memory_identity;      // deg 5
    };
};

template <typename FF> using MemoryRelation = Relation<MemoryRelationImpl<FF>>;
} // namespace bb
