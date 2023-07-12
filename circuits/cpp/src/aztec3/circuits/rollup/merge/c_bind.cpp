#include "c_bind.h"

#include "index.hpp"

#include "aztec3/utils/dummy_circuit_builder.hpp"

#include <barretenberg/barretenberg.hpp>

namespace {
using NT = aztec3::utils::types::NativeTypes;
using DummyBuilder = aztec3::utils::DummyCircuitBuilder;
using aztec3::circuits::abis::BaseOrMergeRollupPublicInputs;
using aztec3::circuits::abis::MergeRollupInputs;
using aztec3::circuits::rollup::merge::merge_rollup_circuit;
}  // namespace
// WASM Cbinds

auto merge_rollup__sim_helper(MergeRollupInputs<NT> merge_rollup_inputs)
{
    DummyComposer composer = DummyComposer("merge_rollup__sim");
    BaseOrMergeRollupPublicInputs const result = merge_rollup_circuit(composer, merge_rollup_inputs);
    return composer.result_or_error(result);
}

CBIND(merge_rollup__sim, merge_rollup__sim_helper);
