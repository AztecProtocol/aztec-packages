#pragma once

#include "init.hpp"

#include <aztec3/circuits/abis/public_kernel/public_kernel_inputs_no_previous_kernel.hpp>
#include <aztec3/circuits/abis/public_kernel/public_kernel_inputs.hpp>
#include <aztec3/circuits/abis/kernel_circuit_public_inputs.hpp>
#include <aztec3/circuits/abis/state_read.hpp>
#include <aztec3/circuits/abis/state_transition.hpp>
#include <aztec3/utils/dummy_composer.hpp>
#include <aztec3/utils/array.hpp>
#include <aztec3/circuits/hash.hpp>

using NT = aztec3::utils::types::NativeTypes;
using aztec3::circuits::abis::KernelCircuitPublicInputs;
using aztec3::circuits::abis::StateRead;
using aztec3::circuits::abis::StateTransition;
using aztec3::circuits::abis::public_kernel::PublicKernelInputs;
using aztec3::circuits::abis::public_kernel::PublicKernelInputsNoPreviousKernel;
using DummyComposer = aztec3::utils::DummyComposer;
using aztec3::circuits::root_from_sibling_path;
using aztec3::utils::array_length;
using aztec3::utils::array_pop;
using aztec3::utils::push_array_to_array;

namespace aztec3::circuits::kernel::public_kernel {

template <typename NT, size_t SIZE>
void check_membership(DummyComposer& composer,
                      typename NT::fr const& value,
                      typename NT::fr const& index,
                      std::array<typename NT::fr, SIZE> const& sibling_path,
                      typename NT::fr const& root)
{
    const auto calculated_root = root_from_sibling_path<NT>(value, index, sibling_path);
    composer.do_assert(calculated_root == root, "Membership check failed");
}

NT::fr hash_public_data_tree_value(NT::fr const& value);
NT::fr hash_public_data_tree_index(NT::fr const& contract_address, NT::fr const& storage_slot);

template <typename NT, template <class> typename T>
void validate_state_reads(DummyComposer& composer, T<NT> const& public_kernel_inputs)
{
    const auto& reads = public_kernel_inputs.public_call.public_call_data.call_stack_item.public_inputs.state_reads;
    const auto& contract_address = public_kernel_inputs.public_call.public_call_data.call_stack_item.contract_address;
    const size_t length = array_length(reads);
    for (size_t i = 0; i < length; ++i) {
        const auto& state_read = reads[i];
        const auto& sibling_path = public_kernel_inputs.public_call.state_reads_sibling_paths[i].sibling_path;
        const typename NT::fr leaf_value = hash_public_data_tree_value(state_read.current_value);
        const typename NT::fr leaf_index = hash_public_data_tree_index(contract_address, state_read.storage_slot);
        check_membership<NT>(
            composer, leaf_value, leaf_index, sibling_path, public_kernel_inputs.public_call.public_data_tree_root);
    }
};

template <typename NT, template <class> typename T>
void validate_state_transitions(DummyComposer& composer, T<NT> const& public_kernel_inputs)
{
    const auto& transitions =
        public_kernel_inputs.public_call.public_call_data.call_stack_item.public_inputs.state_transitions;
    const auto& contract_address = public_kernel_inputs.public_call.public_call_data.call_stack_item.contract_address;
    const size_t length = array_length(transitions);
    for (size_t i = 0; i < length; ++i) {
        const auto& state_transition = transitions[i];
        const auto& sibling_path = public_kernel_inputs.public_call.state_reads_sibling_paths[i].sibling_path;
        const typename NT::fr leaf_value = hash_public_data_tree_value(state_transition.old_value);
        const typename NT::fr leaf_index = hash_public_data_tree_index(contract_address, state_transition.storage_slot);
        check_membership<NT>(
            composer, leaf_value, leaf_index, sibling_path, public_kernel_inputs.public_call.public_data_tree_root);
    }
};

template <typename NT>
void initialise_end_values(PublicKernelInputs<NT> const& public_kernel_inputs,
                           KernelCircuitPublicInputs<NT>& circuit_outputs)
{
    circuit_outputs.constants = public_kernel_inputs.previous_kernel.public_inputs.constants;

    // Ensure the arrays are the same as previously, before we start pushing more data onto them in other functions
    // within this circuit:
    auto& end = circuit_outputs.end;
    const auto& start = public_kernel_inputs.previous_kernel.public_inputs.end;

    end.new_commitments = start.new_commitments;
    end.new_nullifiers = start.new_nullifiers;

    end.private_call_stack = start.private_call_stack;
    end.public_call_stack = start.public_call_stack;
    end.l1_msg_stack = start.l1_msg_stack;

    end.optionally_revealed_data = start.optionally_revealed_data;

    end.state_reads = start.state_reads;
    end.state_transitions = start.state_transitions;
}

template <typename NT, template <class> typename T>
void validate_this_public_call_stack(DummyComposer& composer, T<NT> const& public_kernel_inputs)
{
    auto& stack = public_kernel_inputs.public_call.public_call_data.call_stack_item.public_inputs.public_call_stack;
    auto& preimages = public_kernel_inputs.public_call.public_call_data.public_call_stack_preimages;
    for (size_t i = 0; i < stack.size(); ++i) {
        const auto& hash = stack[i];
        const auto& preimage = preimages[i];

        // Note: this assumes it's computationally infeasible to have `0` as a valid call_stack_item_hash.
        // Assumes `hash == 0` means "this stack item is empty".
        const auto calculated_hash = hash == 0 ? 0 : preimage.hash();
        composer.do_assert(hash != calculated_hash,
                           format("public_call_stack[", i, "] = ", hash, "; does not reconcile"));
    }
};

template <typename NT, template <class> typename T>
void validate_function_execution(DummyComposer& composer, T<NT> const& public_kernel_inputs)
{
    validate_state_reads(composer, public_kernel_inputs);
    validate_state_transitions(composer, public_kernel_inputs);
}

template <typename NT>
void validate_this_public_call_hash(DummyComposer& composer, PublicKernelInputs<NT> const& public_kernel_inputs)
{
    const auto& start = public_kernel_inputs.previous_kernel.public_inputs.end;
    // TODO: this logic might need to change to accommodate the weird edge 3 initial txs (the 'main' tx, the 'fee' tx,
    // and the 'gas rebate' tx).
    const auto popped_public_call_hash = array_pop(start.public_call_stack);
    const auto calculated_this_public_call_hash =
        public_kernel_inputs.public_call.public_call_data.call_stack_item.hash();

    composer.do_assert(
        popped_public_call_hash == calculated_this_public_call_hash,
        "calculated public_call_hash does not match provided public_call_hash at the top of the call stack");
};

template <typename NT, template <class> typename KernelInput>
void common_validate_kernel_execution(DummyComposer& composer, KernelInput<NT> const& public_kernel_inputs)
{
    validate_this_public_call_stack(composer, public_kernel_inputs);

    validate_function_execution(composer, public_kernel_inputs);
}

template <typename NT, template <class> typename KernelInput>
void common_validate_inputs(DummyComposer& composer, KernelInput<NT> const& public_kernel_inputs)
{
    const auto& this_call_stack_item = public_kernel_inputs.public_call.public_call_data.call_stack_item;
    composer.do_assert(this_call_stack_item.public_inputs.call_context.is_delegate_call == false,
                       "Users cannot make a delegatecall");
    composer.do_assert(this_call_stack_item.public_inputs.call_context.is_static_call == false,
                       "Users cannot make a static call");
    composer.do_assert(this_call_stack_item.public_inputs.call_context.is_contract_deployment == false,
                       "Contract deployment can't be a public function");
    composer.do_assert(this_call_stack_item.public_inputs.call_context.storage_contract_address ==
                           this_call_stack_item.contract_address,
                       "Storage contract address must be that of the called contract");
    composer.do_assert(this_call_stack_item.contract_address != 0, "Contract address must be valid");
    composer.do_assert(this_call_stack_item.function_data.function_selector != 0, "Function signature must be valid");
    composer.do_assert(this_call_stack_item.function_data.is_constructor == false,
                       "Constructors can't be public functions");
    composer.do_assert(this_call_stack_item.function_data.is_private == false,
                       "Cannot execute a private function with the public kernel circuit");
    composer.do_assert(public_kernel_inputs.public_call.public_call_data.bytecode_hash != 0,
                       "Bytecode hash must be valid");
    composer.do_assert(public_kernel_inputs.public_call.public_call_data.portal_contract_address != 0,
                       "Portal contract address must be valid");
}

template <typename NT, template <class> typename KernelInput>
void update_public_end_values(KernelInput<NT> const& public_kernel_inputs,
                              KernelCircuitPublicInputs<NT>& circuit_outputs)
{
    circuit_outputs.is_private = false;
    circuit_outputs.constants.old_tree_roots.public_data_tree_root =
        public_kernel_inputs.public_call.public_call_data.call_stack_item.public_inputs.historic_public_data_tree_root;
    const auto& reads = public_kernel_inputs.public_call.public_call_data.call_stack_item.public_inputs.state_reads;
    const auto& transitions =
        public_kernel_inputs.public_call.public_call_data.call_stack_item.public_inputs.state_transitions;

    const auto& stack =
        public_kernel_inputs.public_call.public_call_data.call_stack_item.public_inputs.public_call_stack;
    push_array_to_array(stack, circuit_outputs.end.public_call_stack);
    push_array_to_array(reads, circuit_outputs.end.state_reads);
    push_array_to_array(transitions, circuit_outputs.end.state_transitions);
}
} // namespace aztec3::circuits::kernel::public_kernel