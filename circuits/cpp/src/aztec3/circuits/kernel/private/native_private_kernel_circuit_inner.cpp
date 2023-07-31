#include "common.hpp"
#include "init.hpp"

#include "aztec3/circuits/abis/kernel_circuit_public_inputs.hpp"
#include "aztec3/circuits/abis/new_contract_data.hpp"
#include "aztec3/circuits/abis/previous_kernel_data.hpp"
#include "aztec3/circuits/abis/private_kernel/private_kernel_inputs_inner.hpp"
#include "aztec3/constants.hpp"
#include "aztec3/utils/array.hpp"
#include "aztec3/utils/dummy_circuit_builder.hpp"

namespace aztec3::circuits::kernel::private_kernel {

using aztec3::circuits::abis::ContractLeafPreimage;
using aztec3::circuits::abis::KernelCircuitPublicInputs;
using aztec3::circuits::abis::private_kernel::PrivateKernelInputsInner;

using aztec3::utils::array_length;
using aztec3::utils::array_pop;
using DummyBuilder = aztec3::utils::DummyCircuitBuilder;
using CircuitErrorCode = aztec3::utils::CircuitErrorCode;

// using plonk::stdlib::merkle_tree::

// // TODO: NEED TO RECONCILE THE `proof`'s public inputs (which are uint8's) with the
// // private_call.call_stack_item.public_inputs!
// CT::AggregationObject verify_proofs(Builder& builder,
//                                     PrivateInputs<CT> const& private_inputs,
//                                     size_t const& num_private_call_public_inputs,
//                                     size_t const& num_private_kernel_public_inputs)
// {
//     CT::AggregationObject aggregation_object = Aggregator::aggregate(
//         &builder, private_inputs.private_call.vk, private_inputs.private_call.proof,
//         num_private_call_public_inputs);

//     Aggregator::aggregate(&builder,
//                           private_inputs.previous_kernel.vk,
//                           private_inputs.previous_kernel.proof,
//                           num_private_kernel_public_inputs,
//                           aggregation_object);

//     return aggregation_object;
// }
void initialise_end_values(PreviousKernelData<NT> const& previous_kernel, KernelCircuitPublicInputs<NT>& public_inputs)
{
    common_inner_ordering_initialise_end_values(previous_kernel, public_inputs);

    // Ensure the arrays are the same as previously, before we start pushing more data onto them in other
    // functions within this circuit:
    auto& end = public_inputs.end;
    const auto& start = previous_kernel.public_inputs.end;

    end.read_requests = start.read_requests;
    end.read_request_membership_witnesses = start.read_request_membership_witnesses;
}


void validate_this_private_call_hash(DummyBuilder& builder,
                                     PrivateKernelInputsInner<NT> const& private_inputs,
                                     KernelCircuitPublicInputs<NT>& public_inputs)
{
    // TODO(mike): this logic might need to change to accommodate the weird edge 3 initial txs (the 'main' tx, the 'fee'
    // tx, and the 'gas rebate' tx).
    const auto popped_private_call_hash = array_pop(public_inputs.end.private_call_stack);
    const auto calculated_this_private_call_hash = private_inputs.private_call.call_stack_item.hash();

    builder.do_assert(
        popped_private_call_hash == calculated_this_private_call_hash,
        format("calculated private_call_hash (",
               calculated_this_private_call_hash,
               ") does not match provided private_call_hash (",
               popped_private_call_hash,
               ") at the top of the call stack"),
        CircuitErrorCode::PRIVATE_KERNEL__CALCULATED_PRIVATE_CALL_HASH_AND_PROVIDED_PRIVATE_CALL_HASH_MISMATCH);
};

void validate_contract_tree_root(DummyBuilder& builder, PrivateKernelInputsInner<NT> const& private_inputs)
{
    auto const& purported_contract_tree_root =
        private_inputs.private_call.call_stack_item.public_inputs.historic_contract_tree_root;
    auto const& previous_kernel_contract_tree_root =
        private_inputs.previous_kernel.public_inputs.constants.historic_tree_roots.private_historic_tree_roots
            .contract_tree_root;
    builder.do_assert(
        purported_contract_tree_root == previous_kernel_contract_tree_root,
        "purported_contract_tree_root doesn't match previous_kernel_contract_tree_root",
        CircuitErrorCode::PRIVATE_KERNEL__PURPORTED_CONTRACT_TREE_ROOT_AND_PREVIOUS_KERNEL_CONTRACT_TREE_ROOT_MISMATCH);
}

void validate_inputs(DummyBuilder& builder, PrivateKernelInputsInner<NT> const& private_inputs)
{
    const auto& this_call_stack_item = private_inputs.private_call.call_stack_item;

    builder.do_assert(this_call_stack_item.function_data.is_private == true,
                      "Cannot execute a non-private function with the private kernel circuit",
                      CircuitErrorCode::PRIVATE_KERNEL__NON_PRIVATE_FUNCTION_EXECUTED_WITH_PRIVATE_KERNEL);

    const auto& start = private_inputs.previous_kernel.public_inputs.end;

    // TODO(mike): we might want to range-constrain the call_count to prevent some kind of overflow errors. Having said
    // that, iterating 2^254 times isn't feasible.

    NT::fr const start_private_call_stack_length = array_length(start.private_call_stack);

    builder.do_assert(private_inputs.previous_kernel.public_inputs.is_private == true,
                      "Cannot verify a non-private kernel snark in the private kernel circuit",
                      CircuitErrorCode::PRIVATE_KERNEL__NON_PRIVATE_KERNEL_VERIFIED_WITH_PRIVATE_KERNEL);
    builder.do_assert(this_call_stack_item.function_data.is_constructor == false,
                      "A constructor must be executed as the first tx in the recursion",
                      CircuitErrorCode::PRIVATE_KERNEL__CONSTRUCTOR_EXECUTED_IN_RECURSION);
    builder.do_assert(start_private_call_stack_length != 0,
                      "Cannot execute private kernel circuit with an empty private call stack",
                      CircuitErrorCode::PRIVATE_KERNEL__PRIVATE_CALL_STACK_EMPTY);

    common_validate_previous_kernel_read_requests(
        builder, start.read_requests, start.read_request_membership_witnesses);
}

// NOTE: THIS IS A VERY UNFINISHED WORK IN PROGRESS.
// TODO(mike): is there a way to identify whether an input has not been used by ths circuit? This would help us
// more-safely ensure we're constraining everything.
KernelCircuitPublicInputs<NT> native_private_kernel_circuit_inner(DummyBuilder& builder,
                                                                  PrivateKernelInputsInner<NT> const& private_inputs)
{
    // We'll be pushing data to this during execution of this circuit.
    KernelCircuitPublicInputs<NT> public_inputs{};

    // Do this before any functions can modify the inputs.
    initialise_end_values(private_inputs.previous_kernel, public_inputs);

    validate_inputs(builder, private_inputs);

    // TODO(jeanmon) Resuscitate after issue 499 is fixed as explained below.
    // Remove the array_pop below when uncommenting this validation.
    // validate_this_private_call_hash(builder, private_inputs, public_inputs);
    array_pop(public_inputs.end.private_call_stack);

    // TODO(dbanks12): may need to comment out hash check in here according to TODO above
    // TODO(jeanmon) FIXME - https://github.com/AztecProtocol/aztec-packages/issues/671
    // common_validate_call_stack(builder, private_inputs.private_call);

    common_validate_read_requests(
        builder,
        private_inputs.private_call.call_stack_item.public_inputs.call_context.storage_contract_address,
        public_inputs.constants.historic_tree_roots.private_historic_tree_roots.private_data_tree_root,
        private_inputs.private_call.call_stack_item.public_inputs.read_requests,  // read requests from private call
        private_inputs.private_call.read_request_membership_witnesses);


    // TODO(dbanks12): feels like update_end_values should happen later
    common_update_end_values(builder, private_inputs.private_call, public_inputs);

    // ensure that historic/purported contract tree root matches the one in previous kernel
    validate_contract_tree_root(builder, private_inputs);

    const auto private_call_stack_item = private_inputs.private_call.call_stack_item;
    common_contract_logic(builder,
                          private_inputs.private_call,
                          public_inputs,
                          private_call_stack_item.public_inputs.contract_deployment_data,
                          private_call_stack_item.function_data);

    // We'll skip any verification in this native implementation, because for a Local Developer Testnet, there won't
    // _be_ a valid proof to verify!!! auto aggregation_object = verify_proofs(builder,
    //                                         private_inputs,
    //                                         _private_inputs.private_call.vk->num_public_inputs,
    //                                         _private_inputs.previous_kernel.vk->num_public_inputs);

    // TODO(dbanks12): kernel vk membership check!

    // Note: given that we skipped the verify_proof function, the aggregation object we get at the end will just be the
    // same as we had at the start. public_inputs.end.aggregation_object = aggregation_object;
    public_inputs.end.aggregation_object = private_inputs.previous_kernel.public_inputs.end.aggregation_object;

    return public_inputs;
};

}  // namespace aztec3::circuits::kernel::private_kernel