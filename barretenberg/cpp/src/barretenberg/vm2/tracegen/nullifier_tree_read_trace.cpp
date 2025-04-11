#include "barretenberg/vm2/tracegen/nullifier_tree_read_trace.hpp"

#include "barretenberg/vm/aztec_constants.hpp"

namespace bb::avm2::tracegen {

void NullifierTreeReadTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::NullifierTreeReadEvent>::Container& events,
    TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;

    for (const auto& event : events) {
        bool exists = event.low_leaf_preimage.leaf.nullifier == event.nullifier;
        FF nullifier_low_leaf_nullifier_diff_inv =
            exists ? 0 : (event.nullifier - event.low_leaf_preimage.leaf.nullifier).invert();

        bool next_nullifier_is_nonzero = false;
        FF next_nullifier_inv = 0;
        if (!exists) {
            next_nullifier_is_nonzero = event.low_leaf_preimage.nextKey != 0;
            next_nullifier_inv = next_nullifier_is_nonzero ? event.low_leaf_preimage.nextKey.invert() : 0;
        }

        trace.set(
            row,
            { { { C::nullifier_read_sel, 1 },
                { C::nullifier_read_exists, exists },
                { C::nullifier_read_nullifier, event.nullifier },
                { C::nullifier_read_root, event.root },
                { C::nullifier_read_low_leaf_nullifier, event.low_leaf_preimage.leaf.nullifier },
                { C::nullifier_read_low_leaf_next_index, event.low_leaf_preimage.nextIndex },
                { C::nullifier_read_low_leaf_next_nullifier, event.low_leaf_preimage.nextKey },
                { C::nullifier_read_low_leaf_index, event.low_leaf_index },
                { C::nullifier_read_low_leaf_hash, event.low_leaf_hash },
                { C::nullifier_read_tree_height, NULLIFIER_TREE_HEIGHT },
                { C::nullifier_read_leaf_not_exists, !exists },
                { C::nullifier_read_nullifier_low_leaf_nullifier_diff_inv, nullifier_low_leaf_nullifier_diff_inv },
                { C::nullifier_read_one, 1 },
                { C::nullifier_read_next_nullifier_is_nonzero, next_nullifier_is_nonzero },
                { C::nullifier_read_next_nullifier_inv, next_nullifier_inv } } });
        row++;
    }
}

} // namespace bb::avm2::tracegen
