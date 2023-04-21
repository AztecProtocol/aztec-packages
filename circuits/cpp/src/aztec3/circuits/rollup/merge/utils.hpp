#pragma once
#include "aztec3/circuits/abis/rollup/base/base_or_merge_rollup_public_inputs.hpp"
#include "aztec3/utils/dummy_composer.hpp"
#include "index.hpp"
#include "init.hpp"
namespace aztec3::circuits::rollup::merge::utils {

namespace {
using NT = aztec3::utils::types::NativeTypes;
using aztec3::circuits::abis::MergeRollupInputs;
using aztec3::circuits::abis::PreviousRollupData;
using DummyComposer = aztec3::utils::DummyComposer;
} // namespace

MergeRollupInputs<NT> dummy_merge_rollup_inputs(DummyComposer& composer);
std::array<PreviousRollupData<NT>, 2> previous_rollup_datas(DummyComposer& composer);

} // namespace aztec3::circuits::rollup::merge::utils
