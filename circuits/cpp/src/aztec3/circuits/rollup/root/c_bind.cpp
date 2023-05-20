#include "c_bind.h"

#include "index.hpp"
#include "init.hpp"

#include "aztec3/circuits/abis/private_kernel/private_call_data.hpp"
#include "aztec3/circuits/abis/signed_tx_request.hpp"
#include <aztec3/circuits/abis/kernel_circuit_public_inputs.hpp>
#include <aztec3/circuits/abis/private_kernel/private_inputs.hpp>
#include <aztec3/circuits/mock/mock_kernel_circuit.hpp>
#include <aztec3/constants.hpp>
#include <aztec3/utils/types/native_types.hpp>

#include "barretenberg/common/serialize.hpp"
#include "barretenberg/plonk/composer/turbo_composer.hpp"
#include "barretenberg/serialize/cbind.hpp"
#include "barretenberg/srs/reference_string/env_reference_string.hpp"

namespace {
using Composer = plonk::UltraComposer;
using NT = aztec3::utils::types::NativeTypes;
using DummyComposer = aztec3::utils::DummyComposer;
using aztec3::circuits::rollup::native_root_rollup::root_rollup_circuit;
using aztec3::circuits::rollup::native_root_rollup::RootRollupInputs;
using aztec3::circuits::rollup::native_root_rollup::RootRollupPublicInputs;

}  // namespace


WASM_EXPORT size_t root_rollup__init_proving_key(uint8_t const** pk_buf)
{
    std::vector<uint8_t> pk_vec(42, 0);

    auto* raw_buf = (uint8_t*)malloc(pk_vec.size());
    memcpy(raw_buf, (void*)pk_vec.data(), pk_vec.size());
    *pk_buf = raw_buf;

    return pk_vec.size();
}

WASM_EXPORT size_t root_rollup__init_verification_key(uint8_t const* pk_buf, uint8_t const** vk_buf)
{
    std::vector<uint8_t> vk_vec(42, 0);
    // TODO remove when proving key is used
    (void)pk_buf;  // unused

    auto* raw_buf = (uint8_t*)malloc(vk_vec.size());
    memcpy(raw_buf, (void*)vk_vec.data(), vk_vec.size());
    *vk_buf = raw_buf;

    return vk_vec.size();
}

static auto root_rollup__sim_helper(RootRollupInputs root_rollup_inputs)
{
    DummyComposer composer = DummyComposer("root_rollup__sim");
    RootRollupPublicInputs const result = root_rollup_circuit(composer, root_rollup_inputs);
    return composer.result_or_error(result);
}

CBIND(root_rollup__sim, root_rollup__sim_helper)

WASM_EXPORT size_t root_rollup__verify_proof(uint8_t const* vk_buf, uint8_t const* proof, uint32_t length)
{
    (void)vk_buf;  // unused
    (void)proof;   // unused
    (void)length;  // unused
    return 1U;
}
