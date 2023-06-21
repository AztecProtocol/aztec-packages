#include "c_bind.h"

#include "index.hpp"
#include "init.hpp"

#include "aztec3/circuits/abis/kernel_circuit_public_inputs.hpp"
#include "aztec3/circuits/abis/private_kernel/private_call_data.hpp"
#include "aztec3/circuits/abis/rollup/base/base_or_merge_rollup_public_inputs.hpp"
#include "aztec3/circuits/mock/mock_kernel_circuit.hpp"
#include "aztec3/constants.hpp"
#include "aztec3/utils/dummy_composer.hpp"
#include "aztec3/utils/types/native_types.hpp"

#include <barretenberg/barretenberg.hpp>
#include <barretenberg/serialize/cbind.hpp>

namespace {
using Composer = plonk::UltraPlonkComposer;
using NT = aztec3::utils::types::NativeTypes;
using DummyComposer = aztec3::utils::DummyComposer;
using aztec3::circuits::abis::BaseOrMergeRollupPublicInputs;
using aztec3::circuits::abis::BaseRollupInputs;
using aztec3::circuits::rollup::native_base_rollup::base_rollup_circuit;

}  // namespace

// WASM Cbinds
WASM_EXPORT size_t base_rollup__init_proving_key(uint8_t const** pk_buf)
{
    std::vector<uint8_t> pk_vec(42, 0);

    auto* raw_buf = (uint8_t*)malloc(pk_vec.size());
    memcpy(raw_buf, (void*)pk_vec.data(), pk_vec.size());
    *pk_buf = raw_buf;

    return pk_vec.size();
}

WASM_EXPORT size_t base_rollup__init_verification_key(uint8_t const* pk_buf, uint8_t const** vk_buf)
{
    std::vector<uint8_t> vk_vec(42, 0);
    // TODO remove when proving key is used
    (void)pk_buf;  // unused

    auto* raw_buf = (uint8_t*)malloc(vk_vec.size());
    memcpy(raw_buf, (void*)vk_vec.data(), vk_vec.size());
    *vk_buf = raw_buf;

    return vk_vec.size();
}

static auto base_rollup__sim_helper(BaseRollupInputs<NT> base_rollup_inputs)
{
    DummyComposer composer = DummyComposer("base_rollup__sim");
    // TODO accept proving key and use that to initialize composers
    // this info is just to prevent error for unused pk_buf
    // TODO do we want to accept it or just get it from our factory?
    // auto crs_factory = std::make_shared<EnvReferenceStringFactory>();

    BaseOrMergeRollupPublicInputs<NT> const result = base_rollup_circuit(composer, base_rollup_inputs);
    return composer.result_or_error(result);
}

CBIND(base_rollup__sim, base_rollup__sim_helper);
