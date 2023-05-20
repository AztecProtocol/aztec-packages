#include "c_bind.h"

#include "index.hpp"
#include "utils.hpp"

#include "barretenberg/srs/reference_string/env_reference_string.hpp"
#include <barretenberg/serialize/cbind.hpp>

namespace {
using Composer = plonk::UltraComposer;
using NT = aztec3::utils::types::NativeTypes;
using DummyComposer = aztec3::utils::DummyComposer;
using aztec3::circuits::abis::KernelCircuitPublicInputs;
using aztec3::circuits::abis::PreviousKernelData;
using aztec3::circuits::abis::SignedTxRequest;
using aztec3::circuits::abis::private_kernel::PrivateCallData;
using aztec3::circuits::abis::private_kernel::PrivateInputs;
using aztec3::circuits::kernel::private_kernel::native_private_kernel_circuit;
using aztec3::circuits::kernel::private_kernel::private_kernel_circuit;
using aztec3::circuits::kernel::private_kernel::utils::dummy_previous_kernel;

}  // namespace

// WASM Cbinds

// TODO(dbanks12): might be able to get rid of proving key buffer
WASM_EXPORT size_t private_kernel__init_proving_key(uint8_t const** pk_buf)
{
    std::vector<uint8_t> pk_vec(42, 0);

    auto* raw_buf = (uint8_t*)malloc(pk_vec.size());
    memcpy(raw_buf, (void*)pk_vec.data(), pk_vec.size());
    *pk_buf = raw_buf;

    return pk_vec.size();
}

WASM_EXPORT size_t private_kernel__init_verification_key(uint8_t const* pk_buf, uint8_t const** vk_buf)
{
    (void)pk_buf;

    // TODO(dbanks12) actual verification key?
    // NT:VKData vk_data = { 0 };

    std::vector<uint8_t> vk_vec(42, 0);
    // write(vk_vec, vk_data);

    auto* raw_buf = (uint8_t*)malloc(vk_vec.size());
    memcpy(raw_buf, (void*)vk_vec.data(), vk_vec.size());
    *vk_buf = raw_buf;

    return vk_vec.size();
}

CBIND(private_kernel__dummy_previous_kernel, []() { return dummy_previous_kernel(); });

//// TODO(dbanks12): comment about how KernelCircuitPublicInputs is a confusing name
// TODO(AD) some of these could take const reference types if func_traits were improved (faster)
static auto private_kernel__sim_helper(SignedTxRequest<NT> signed_tx_request,
                                       PrivateCallData<NT> private_call_data,
                                       PreviousKernelData<NT> previous_kernel,
                                       bool first_iteration)
{
    DummyComposer composer = DummyComposer("private_kernel__sim");
    if (first_iteration) {
        previous_kernel = dummy_previous_kernel();

        previous_kernel.public_inputs.end.private_call_stack[0] = private_call_data.call_stack_item.hash();
        previous_kernel.public_inputs.constants.historic_tree_roots.private_historic_tree_roots.private_data_tree_root =
            private_call_data.call_stack_item.public_inputs.historic_private_data_tree_root;
        previous_kernel.public_inputs.constants.historic_tree_roots.private_historic_tree_roots.nullifier_tree_root =
            private_call_data.call_stack_item.public_inputs.historic_nullifier_tree_root;
        previous_kernel.public_inputs.constants.historic_tree_roots.private_historic_tree_roots.contract_tree_root =
            private_call_data.call_stack_item.public_inputs.historic_contract_tree_root;
        previous_kernel.public_inputs.constants.historic_tree_roots.private_historic_tree_roots
            .l1_to_l2_messages_tree_root =
            private_call_data.call_stack_item.public_inputs.historic_l1_to_l2_messages_tree_root;
        // previous_kernel.public_inputs.constants.historic_tree_roots.private_kernel_vk_tree_root =
        previous_kernel.public_inputs.constants.tx_context = signed_tx_request.tx_request.tx_context;
        previous_kernel.public_inputs.is_private = true;
    }

    PrivateInputs<NT> const private_inputs = PrivateInputs<NT>{
        .signed_tx_request = signed_tx_request,
        .previous_kernel = previous_kernel,
        .private_call = private_call_data,
    };

    KernelCircuitPublicInputs<NT> const result =
        native_private_kernel_circuit(composer, private_inputs, first_iteration);

    return composer.result_or_error(result);
}
CBIND(private_kernel__sim, private_kernel__sim_helper);

static auto private_kernel__prove_helper(SignedTxRequest<NT> signed_tx_request,
                                         PrivateCallData<NT> private_call_data,
                                         PreviousKernelData<NT> previous_kernel,
                                         bool first_iteration)
{
    auto crs_factory = std::make_shared<EnvReferenceStringFactory>();
    if (first_iteration) {
        previous_kernel = dummy_previous_kernel(true);

        previous_kernel.public_inputs.end.private_call_stack[0] = private_call_data.call_stack_item.hash();
        previous_kernel.public_inputs.constants.historic_tree_roots.private_historic_tree_roots.private_data_tree_root =
            private_call_data.call_stack_item.public_inputs.historic_private_data_tree_root;
        previous_kernel.public_inputs.constants.historic_tree_roots.private_historic_tree_roots.contract_tree_root =
            private_call_data.call_stack_item.public_inputs.historic_contract_tree_root;
        previous_kernel.public_inputs.constants.historic_tree_roots.private_historic_tree_roots
            .l1_to_l2_messages_tree_root =
            private_call_data.call_stack_item.public_inputs.historic_l1_to_l2_messages_tree_root;
        previous_kernel.public_inputs.constants.tx_context = signed_tx_request.tx_request.tx_context;
        previous_kernel.public_inputs.is_private = true;
    }
    PrivateInputs<NT> const private_inputs = PrivateInputs<NT>{
        .signed_tx_request = signed_tx_request,
        .previous_kernel = previous_kernel,
        .private_call = private_call_data,
    };

    Composer private_kernel_composer = Composer(crs_factory);
    auto private_kernel_prover = private_kernel_composer.create_prover();

    KernelCircuitPublicInputs<NT> public_inputs;
    public_inputs = private_kernel_circuit(private_kernel_composer, private_inputs, first_iteration);
    NT::Proof result = private_kernel_prover.construct_proof();
    // TODO(AD): Have to provide a way to forward errors from plonk::UltraComposer
    // return private_kernel_composer.result_or_error(result.proof_data);
    return result.proof_data;
}
CBIND(private_kernel__prove, private_kernel__prove_helper);
WASM_EXPORT size_t private_kernel__verify_proof(uint8_t const* vk_buf, uint8_t const* proof, uint32_t length)
{
    (void)vk_buf;  // unused
    (void)proof;   // unused
    (void)length;  // unused
    return 1U;
}
