#pragma once

#include "barretenberg/vm2/constraining/relations/interactions_base.hpp"

namespace bb::avm2 {

/////////////////// LOOKUPS ///////////////////

template <typename FF_, typename Settings_>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void lookup_relation_base<FF_, Settings_>::accumulate(ContainerOverSubrelations& accumulator,
                                                      const AllEntities& in,
                                                      const Parameters& params,
                                                      const FF_& scaling_factor)
{
    GenericLookupRelationImpl<Settings_, FF_>::accumulate(accumulator, in, params, scaling_factor);
}

} // namespace bb::avm2
