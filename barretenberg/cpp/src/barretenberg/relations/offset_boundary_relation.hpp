// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/relations/relation_types.hpp"
#include <array>
#include <utility>

namespace bb {

/**
 * @brief Offset-area boundary relation: enforces `e_i(x) = 0` on the offset rows for a
 * user-supplied list of entities `e_1, ..., e_N`.
 *
 * @details Parametrized by a Policy that supplies:
 *   - `using FF = ...;`
 *   - `static constexpr size_t NUM_SUBRELATIONS = N;`
 *   - `template <typename AllEntities> static auto entities(const AllEntities& in);` — returns a
 *     std::tuple of N entity references. Subrelation `i` is the identity `e_i = 0` of degree 1.
 *
 * The relation is tagged `IS_OFFSET_ONLY = true`, so sumcheck scales its contribution by
 * `L = L_0 + L_1 + L_2 + L_3` (the indicator of rows 0..3) instead of `(1 - L)`. A flavor opts
 * in by listing an instantiation in its `Relations` tuple.
 *
 * Correctness precondition: each `e_i` must vanish on rows 0..3 by construction (e.g. the
 * trace places real data starting at row `TRACE_OFFSET`). In ZK flavors that fill rows 1..3
 * with random masks, the listed entities must not be among the masked ones (Mega's
 * `ecc_op_wire_j` qualifies since ECC-op masking is performed by inserting random ops, not
 * by masked polynomial rows).
 */
template <typename Policy> class OffsetBoundaryRelationImpl {
  public:
    using FF = typename Policy::FF;

    static constexpr bool IS_OFFSET_ONLY = true;

    static constexpr size_t NUM_SUBRELATIONS = Policy::NUM_SUBRELATIONS;

    // Every subrelation is `entity = 0`: degree 1, so partial length 2.
    static constexpr std::array<size_t, NUM_SUBRELATIONS> SUBRELATION_PARTIAL_LENGTHS = [] {
        std::array<size_t, NUM_SUBRELATIONS> lengths{};
        lengths.fill(2);
        return lengths;
    }();

    /**
     * @param evals  per-subrelation accumulators
     * @param in     current row / edge entities
     * @param scaling_factor  outer scaling (pow-β etc.), applied as-is; the L / (1-L)
     *                        factor is applied upstream at α-batching, not here.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    inline static void accumulate(ContainerOverSubrelations& evals,
                                  const AllEntities& in,
                                  const Parameters& /*params*/,
                                  const FF& scaling_factor)
    {
        const auto entities = Policy::entities(in);
        accumulate_subrelations(evals, entities, scaling_factor, std::make_index_sequence<NUM_SUBRELATIONS>{});
    }

  private:
    template <typename ContainerOverSubrelations, typename EntitiesTuple, size_t... I>
    inline static void accumulate_subrelations(ContainerOverSubrelations& evals,
                                               const EntitiesTuple& entities,
                                               const FF& scaling_factor,
                                               std::index_sequence<I...>)
    {
        (accumulate_one<I>(evals, std::get<I>(entities), scaling_factor), ...);
    }

    template <size_t I, typename ContainerOverSubrelations, typename Entity>
    inline static void accumulate_one(ContainerOverSubrelations& evals, const Entity& entity, const FF& scaling_factor)
    {
        using Accumulator = std::tuple_element_t<I, ContainerOverSubrelations>;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;
        std::get<I>(evals) += Accumulator(CoefficientAccumulator(entity)) * scaling_factor;
    }
};

template <typename Policy> using OffsetBoundaryRelation = Relation<OffsetBoundaryRelationImpl<Policy>>;

} // namespace bb
