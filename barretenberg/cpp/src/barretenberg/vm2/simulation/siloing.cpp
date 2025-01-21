#include "barretenberg/vm2/simulation/siloing.hpp"

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm/aztec_constants.hpp"
#include "barretenberg/vm2/simulation/events/siloing_event.hpp"

namespace bb::avm2::simulation {

using Poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

FF Siloing::silo(const FF& generator, const FF& elem, const FF& silo_by, SiloingType type)
{
    // TODO: Cache and deduplicate.
    // TODO: Use poseidon gadget.
    auto siloed_elem = Poseidon2::hash({ generator, silo_by, elem });
    events.emit({ .type = type, .elem = elem, .siloed_by = silo_by, .siloed_elem = siloed_elem });
    return siloed_elem;
}

} // namespace bb::avm2::simulation