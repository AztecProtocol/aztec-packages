// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/relations/ecc_vm/ecc_bools_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_lookup_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_msm_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_point_table_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_set_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_transcript_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_wnaf_relation_impl.hpp"

#include <type_traits>

namespace bb {

namespace detail {
template <typename AllEntities, typename = void> struct IsShortUnivariateContainer : std::false_type {};

template <typename AllEntities>
struct IsShortUnivariateContainer<
    AllEntities,
    std::void_t<decltype(std::remove_cvref_t<decltype(std::declval<const AllEntities&>().get_all()[0])>::LENGTH)>>
    : std::bool_constant<std::remove_cvref_t<decltype(std::declval<const AllEntities&>().get_all()[0])>::LENGTH == 2> {
};
} // namespace detail

template <template <typename> typename RelationImpl_, typename FF_>
class ECCVMShortRelationAdapterImpl : public RelationImpl_<FF_> {
  public:
    using FF = FF_;
    using FullRelation = Relation<RelationImpl_<FF>>;
    static constexpr size_t RELATION_LENGTH = FullRelation::RELATION_LENGTH;

    template <typename ShortEntities> static auto extend_short_edges(const ShortEntities& in)
    {
        typename ECCVMFlavor::template ProverUnivariates<RELATION_LENGTH> extended_edges;
        const auto in_edges = in.get_all();
        const auto extended_edges_view = extended_edges.get_all();
        for (size_t idx = 0; idx < extended_edges_view.size(); ++idx) {
            extended_edges_view[idx] = in_edges[idx].template extend_to<RELATION_LENGTH>();
        }
        return extended_edges;
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor)
    {
        if constexpr (detail::IsShortUnivariateContainer<AllEntities>::value) {
            const auto extended_edges = extend_short_edges(in);
            RelationImpl_<FF>::accumulate(accumulator, extended_edges, params, scaling_factor);
        } else {
            RelationImpl_<FF>::accumulate(accumulator, in, params, scaling_factor);
        }
    }

    template <typename Accumulator, typename AllEntities, typename Parameters>
    static Accumulator compute_grand_product_numerator(const AllEntities& in, const Parameters& params)
    {
        if constexpr (detail::IsShortUnivariateContainer<AllEntities>::value) {
            const auto extended_edges = extend_short_edges(in);
            return RelationImpl_<FF>::template compute_grand_product_numerator<Accumulator>(extended_edges, params);
        } else {
            return RelationImpl_<FF>::template compute_grand_product_numerator<Accumulator>(in, params);
        }
    }

    template <typename Accumulator, typename AllEntities, typename Parameters>
    static Accumulator compute_grand_product_denominator(const AllEntities& in, const Parameters& params)
    {
        if constexpr (detail::IsShortUnivariateContainer<AllEntities>::value) {
            const auto extended_edges = extend_short_edges(in);
            return RelationImpl_<FF>::template compute_grand_product_denominator<Accumulator>(extended_edges, params);
        } else {
            return RelationImpl_<FF>::template compute_grand_product_denominator<Accumulator>(in, params);
        }
    }
};

template <typename FF>
using ECCVMTranscriptShortRelation = Relation<ECCVMShortRelationAdapterImpl<ECCVMTranscriptRelationImpl, FF>>;
template <typename FF>
using ECCVMPointTableShortRelation = Relation<ECCVMShortRelationAdapterImpl<ECCVMPointTableRelationImpl, FF>>;
template <typename FF>
using ECCVMWnafShortRelation = Relation<ECCVMShortRelationAdapterImpl<ECCVMWnafRelationImpl, FF>>;
template <typename FF> using ECCVMMSMShortRelation = Relation<ECCVMShortRelationAdapterImpl<ECCVMMSMRelationImpl, FF>>;
template <typename FF> using ECCVMSetShortRelation = Relation<ECCVMShortRelationAdapterImpl<ECCVMSetRelationImpl, FF>>;
template <typename FF>
using ECCVMLookupShortRelation = Relation<ECCVMShortRelationAdapterImpl<ECCVMLookupRelationImpl, FF>>;
template <typename FF>
using ECCVMBoolsShortRelation = Relation<ECCVMShortRelationAdapterImpl<ECCVMBoolsRelationImpl, FF>>;

} // namespace bb
