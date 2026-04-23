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
 * @brief Reusable "entities vanish on offset rows" relation.
 *
 * @details Parametrized by a Policy that supplies:
 *   - using FF = ...;
 *   - static constexpr size_t NUM_SUBRELATIONS = N;
 *   - template <typename AllEntities>
 *     static auto entities(const AllEntities& in);
 *       // returns a std::tuple (or any indexable pack) of N references to entities
 *       // that must vanish on rows 0 .. NUM_DISABLED_ROWS_IN_SUMCHECK - 1.
 *
 * Each subrelation is the identity check `entity_i = 0`, degree 1 (partial length 2).
 *
 * The relation is tagged `IS_OFFSET_ONLY = true` so sumcheck applies the `L` factor
 * (not `(1 - L)`) when batching its contributions. Flavors opt in by listing an
 * instantiation in their `Relations` tuple. No flavor that omits the instantiation
 * is affected.
 *
 * Not safe to use in ZK flavors: rows 1..3 carry random masks there, so "= 0" checks
 * would fail.
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
