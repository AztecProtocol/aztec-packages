#pragma once

#include "init.hpp"

#include "aztec3/circuits/abis/kernel_circuit_public_inputs.hpp"
#include "aztec3/circuits/abis/new_contract_data.hpp"
#include "aztec3/circuits/hash.hpp"
#include "aztec3/constants.hpp"
#include "aztec3/utils/array.hpp"
#include "aztec3/utils/dummy_composer.hpp"

using DummyComposer = aztec3::utils::DummyComposer;

using aztec3::circuits::abis::ContractLeafPreimage;
using aztec3::circuits::abis::KernelCircuitPublicInputs;

using aztec3::utils::is_array_empty;
using aztec3::utils::push_array_to_array;
using DummyComposer = aztec3::utils::DummyComposer;
using CircuitErrorCode = aztec3::utils::CircuitErrorCode;


namespace aztec3::circuits::kernel::private_kernel {

template <typename KernelPrivateInput>
void common_validate_call_stack(DummyComposer& composer, KernelPrivateInput const& private_inputs)
{
    const auto& stack = private_inputs.private_call.call_stack_item.public_inputs.private_call_stack;
    const auto& preimages = private_inputs.private_call.private_call_stack_preimages;
    for (size_t i = 0; i < stack.size(); ++i) {
        const auto& hash = stack[i];
        const auto& preimage = preimages[i];

        // Note: this assumes it's computationally infeasible to have `0` as a valid call_stack_item_hash.
        // Assumes `hash == 0` means "this stack item is empty".
        const auto calculated_hash = hash == 0 ? 0 : preimage.hash();
        composer.do_assert(hash == calculated_hash,
                           format("private_call_stack[", i, "] = ", hash, "; does not reconcile"),
                           CircuitErrorCode::PRIVATE_KERNEL__PRIVATE_CALL_STACK_ITEM_HASH_MISMATCH);
    }
}

/**
 * @brief Validates the kernel execution of the current iteration
 * @tparam The type of kernel input
 * @param composer The circuit composer
 * @param public_kernel_inputs The inputs to this iteration of the kernel circuit
 */
template <typename KernelInput>
void common_validate_kernel_execution(DummyComposer& composer, KernelInput const& private_inputs)
{
    common_validate_call_context(composer, private_inputs);
    common_validate_call_stack(composer, private_inputs);
};

template <typename KernelPrivateInput> void common_update_end_values(DummyComposer& composer,
                                                                     KernelPrivateInput const& private_inputs,
                                                                     KernelCircuitPublicInputs<NT>& public_inputs)
{
    const auto private_call_public_inputs = private_inputs.private_call.call_stack_item.public_inputs;

    const auto& new_commitments = private_call_public_inputs.new_commitments;
    const auto& new_nullifiers = private_call_public_inputs.new_nullifiers;

    const auto& is_static_call = private_call_public_inputs.call_context.is_static_call;

    if (is_static_call) {
        // No state changes are allowed for static calls:
        composer.do_assert(is_array_empty(new_commitments) == true,
                           "new_commitments must be empty for static calls",
                           CircuitErrorCode::PRIVATE_KERNEL__NEW_COMMITMENTS_NOT_EMPTY_FOR_STATIC_CALL);
        composer.do_assert(is_array_empty(new_nullifiers) == true,
                           "new_nullifiers must be empty for static calls",
                           CircuitErrorCode::PRIVATE_KERNEL__NEW_NULLIFIERS_NOT_EMPTY_FOR_STATIC_CALL);
    }

    const auto& storage_contract_address = private_call_public_inputs.call_context.storage_contract_address;

    // Enhance commitments and nullifiers with domain separation whereby domain is the contract.
    {  // commitments & nullifiers
        std::array<NT::fr, NEW_COMMITMENTS_LENGTH> siloed_new_commitments;
        for (size_t i = 0; i < new_commitments.size(); ++i) {
            siloed_new_commitments[i] = new_commitments[i] == 0 ? 0
                                                                : add_contract_address_to_commitment<NT>(
                                                                      storage_contract_address, new_commitments[i]);
        }

        std::array<NT::fr, NEW_NULLIFIERS_LENGTH> siloed_new_nullifiers;
        for (size_t i = 0; i < new_nullifiers.size(); ++i) {
            siloed_new_nullifiers[i] = new_nullifiers[i] == 0 ? 0
                                                              : add_contract_address_to_nullifier<NT>(
                                                                    storage_contract_address, new_nullifiers[i]);
        }

        push_array_to_array(siloed_new_commitments, public_inputs.end.new_commitments);
        push_array_to_array(siloed_new_nullifiers, public_inputs.end.new_nullifiers);
    }

    {  // call stacks
        const auto& this_private_call_stack = private_call_public_inputs.private_call_stack;
        push_array_to_array(this_private_call_stack, public_inputs.end.private_call_stack);
    }

    {  // new l2 to l1 messages
        const auto& portal_contract_address = private_inputs.private_call.portal_contract_address;
        const auto& new_l2_to_l1_msgs = private_call_public_inputs.new_l2_to_l1_msgs;
        std::array<NT::fr, NEW_L2_TO_L1_MSGS_LENGTH> new_l2_to_l1_msgs_to_insert;
        for (size_t i = 0; i < new_l2_to_l1_msgs.size(); ++i) {
            if (!new_l2_to_l1_msgs[i].is_zero()) {
                // @todo @LHerskind chain-ids and rollup version id should be added here. Right now, just hard coded.
                // @todo @LHerskind chain-id is hardcoded for foundry
                const auto chain_id = fr(31337);
                new_l2_to_l1_msgs_to_insert[i] = compute_l2_to_l1_hash<NT>(storage_contract_address,
                                                                           fr(1),  // rollup version id
                                                                           portal_contract_address,
                                                                           chain_id,
                                                                           new_l2_to_l1_msgs[i]);
            }
        }
        push_array_to_array(new_l2_to_l1_msgs_to_insert, public_inputs.end.new_l2_to_l1_msgs);
    }
}

}  // namespace aztec3::circuits::kernel::private_kernel