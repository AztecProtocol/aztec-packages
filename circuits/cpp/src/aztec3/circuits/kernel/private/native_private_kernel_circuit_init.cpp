#include "common.hpp"

#include "aztec3/circuits/abis/combined_constant_data.hpp"
#include "aztec3/circuits/abis/combined_historic_tree_roots.hpp"
#include "aztec3/circuits/abis/private_historic_tree_roots.hpp"
#include "aztec3/circuits/abis/private_kernel/private_kernel_inputs_init.hpp"
#include "aztec3/circuits/hash.hpp"
#include "aztec3/circuits/kernel/private/init.hpp"
#include "aztec3/constants.hpp"
#include "aztec3/utils/array.hpp"

using aztec3::circuits::abis::CombinedConstantData;
using aztec3::circuits::abis::CombinedHistoricTreeRoots;
using aztec3::circuits::abis::PrivateHistoricTreeRoots;
using aztec3::circuits::abis::private_kernel::PrivateKernelInputsInit;
using aztec3::utils::array_push;
using aztec3::utils::is_array_empty;
using CircuitErrorCode = aztec3::utils::CircuitErrorCode;

namespace aztec3::circuits::kernel::private_kernel {

// using plonk::stdlib::merkle_tree::

// // TODO: NEED TO RECONCILE THE `proof`'s public inputs (which are uint8's) with the
// // private_call.call_stack_item.public_inputs!
// CT::AggregationObject verify_proofs(Composer& composer,
//                                     PrivateKernelInputsInit<CT> const& private_inputs,
//                                     size_t const& num_private_call_public_inputs,
//                                     size_t const& num_private_kernel_public_inputs)
// {
//     CT::AggregationObject aggregation_object = Aggregator::aggregate(
//         &composer, private_inputs.private_call.vk, private_inputs.private_call.proof,
//         num_private_call_public_inputs);

//     Aggregator::aggregate(&composer,
//                           private_inputs.previous_kernel.vk,
//                           private_inputs.previous_kernel.proof,
//                           num_private_kernel_public_inputs,
//                           aggregation_object);

//     return aggregation_object;
// }

void initialise_end_values(PrivateKernelInputsInit<NT> const& private_inputs,
                           KernelCircuitPublicInputs<NT>& public_inputs)
{
    // Define the constants data.
    auto const& private_call_public_inputs = private_inputs.private_call.call_stack_item.public_inputs;
    auto const constants = CombinedConstantData<NT>{
        .historic_tree_roots =
            CombinedHistoricTreeRoots<NT>{
                .private_historic_tree_roots =
                    PrivateHistoricTreeRoots<NT>{
                        // TODO(dbanks12): remove historic root from app circuit public inputs and
                        // add it to PrivateCallData: https://github.com/AztecProtocol/aztec-packages/issues/778
                        // Then use this:
                        // .private_data_tree_root = private_inputs.private_call.historic_private_data_tree_root,
                        .private_data_tree_root = private_call_public_inputs.historic_private_data_tree_root,
                        .nullifier_tree_root = private_call_public_inputs.historic_nullifier_tree_root,
                        .contract_tree_root = private_call_public_inputs.historic_contract_tree_root,
                        .l1_to_l2_messages_tree_root = private_call_public_inputs.historic_l1_to_l2_messages_tree_root,
                    },
            },
        .tx_context = private_inputs.signed_tx_request.tx_request.tx_context,
    };

    // Set the constants in public_inputs.
    public_inputs.constants = constants;
}

void validate_this_private_call_against_tx_request(DummyComposer& composer,
                                                   PrivateKernelInputsInit<NT> const& private_inputs)
{
    // TODO(mike): this logic might need to change to accommodate the weird edge 3 initial txs (the 'main' tx, the 'fee'
    // tx, and the 'gas rebate' tx).

    // Confirm that the SignedTxRequest (user's intent) matches the private call being executed
    const auto& tx_request = private_inputs.signed_tx_request.tx_request;
    const auto& call_stack_item = private_inputs.private_call.call_stack_item;

    composer.do_assert(
        tx_request.to == call_stack_item.contract_address,
        "user's intent does not match initial private call (tx_request.to must match call_stack_item.contract_address)",
        CircuitErrorCode::PRIVATE_KERNEL__USER_INTENT_MISMATCH_BETWEEN_TX_REQUEST_AND_CALL_STACK_ITEM);

    composer.do_assert(tx_request.function_data.hash() == call_stack_item.function_data.hash(),
                       "user's intent does not match initial private call (tx_request.function_data must match "
                       "call_stack_item.function_data)",
                       CircuitErrorCode::PRIVATE_KERNEL__USER_INTENT_MISMATCH_BETWEEN_TX_REQUEST_AND_CALL_STACK_ITEM);

    composer.do_assert(tx_request.args_hash == call_stack_item.public_inputs.args_hash,
                       "user's intent does not match initial private call (tx_request.args must match "
                       "call_stack_item.public_inputs.args)",
                       CircuitErrorCode::PRIVATE_KERNEL__USER_INTENT_MISMATCH_BETWEEN_TX_REQUEST_AND_CALL_STACK_ITEM);
};

void validate_inputs(DummyComposer& composer, PrivateKernelInputsInit<NT> const& private_inputs)
{
    const auto& this_call_stack_item = private_inputs.private_call.call_stack_item;

    composer.do_assert(this_call_stack_item.function_data.is_private == true,
                       "Cannot execute a non-private function with the private kernel circuit",
                       CircuitErrorCode::PRIVATE_KERNEL__NON_PRIVATE_FUNCTION_EXECUTED_WITH_PRIVATE_KERNEL);

    // TODO(mike): change to allow 3 initial calls on the private call stack, so a fee can be paid and a gas
    // rebate can be paid.

    /* If we are going to have 3 initial calls on the private call stack,
     * then do we still need the `private_call_stack`
     * despite no longer needing a full `previous_kernel`
     */

    composer.do_assert(this_call_stack_item.public_inputs.call_context.is_delegate_call == false,
                       "Users cannot make a delegatecall",
                       CircuitErrorCode::PRIVATE_KERNEL__UNSUPPORTED_OP);
    composer.do_assert(this_call_stack_item.public_inputs.call_context.is_static_call == false,
                       "Users cannot make a static call",
                       CircuitErrorCode::PRIVATE_KERNEL__UNSUPPORTED_OP);

    // The below also prevents delegatecall/staticcall in the base case
    composer.do_assert(this_call_stack_item.public_inputs.call_context.storage_contract_address ==
                           this_call_stack_item.contract_address,
                       "Storage contract address must be that of the called contract",
                       CircuitErrorCode::PRIVATE_KERNEL__CONTRACT_ADDRESS_MISMATCH);
}

void update_end_values(DummyComposer& composer,
                       PrivateKernelInputsInit<NT> const& private_inputs,
                       KernelCircuitPublicInputs<NT>& public_inputs)
{
    // We only initialized constants member of public_inputs so far. Therefore, there must not be any
    // new nullifiers or logs as part of public_inputs.
    ASSERT(is_array_empty(public_inputs.end.new_nullifiers));
    ASSERT(public_inputs.end.encrypted_logs_hash[0] == fr(0));
    ASSERT(public_inputs.end.encrypted_logs_hash[1] == fr(0));
    ASSERT(public_inputs.end.unencrypted_logs_hash[0] == fr(0));
    ASSERT(public_inputs.end.unencrypted_logs_hash[1] == fr(0));
    ASSERT(public_inputs.end.encrypted_log_preimages_length == fr(0));
    ASSERT(public_inputs.end.unencrypted_log_preimages_length == fr(0));

    // Since it's the first iteration, we need to push the the tx hash nullifier into the `new_nullifiers` array
    array_push(composer, public_inputs.end.new_nullifiers, private_inputs.signed_tx_request.hash());

    // Note that we do not need to nullify the transaction request nonce anymore.
    // Should an account want to additionally use nonces for replay protection or handling cancellations,
    // they will be able to do so in the account contract logic:
    // https://github.com/AztecProtocol/aztec-packages/issues/660
}

// NOTE: THIS IS A VERY UNFINISHED WORK IN PROGRESS.
// TODO(mike): is there a way to identify whether an input has not been used by ths circuit? This would help us
// more-safely ensure we're constraining everything.
KernelCircuitPublicInputs<NT> native_private_kernel_circuit_initial(DummyComposer& composer,
                                                                    PrivateKernelInputsInit<NT> const& private_inputs)
{
    // We'll be pushing data to this during execution of this circuit.
    KernelCircuitPublicInputs<NT> public_inputs{};

    // Do this before any functions can modify the inputs.
    initialise_end_values(private_inputs, public_inputs);

    validate_inputs(composer, private_inputs);

    validate_this_private_call_against_tx_request(composer, private_inputs);

    // TODO(rahul) FIXME - https://github.com/AztecProtocol/aztec-packages/issues/499
    // Noir doesn't have hash index so it can't hash private call stack item correctly
    // TODO(dbanks12): may need to comment out hash check in here according to TODO above
    // TODO(jeanmon) FIXME - https://github.com/AztecProtocol/aztec-packages/issues/671
    // common_validate_call_stack(composer, private_inputs.private_call);

    common_validate_read_requests(
        composer,
        private_inputs.private_call.call_stack_item.public_inputs.call_context.storage_contract_address,
        private_inputs.private_call.call_stack_item.public_inputs.read_requests,
        private_inputs.private_call.read_request_membership_witnesses,
        public_inputs.constants.historic_tree_roots.private_historic_tree_roots.private_data_tree_root);

    // TODO(dbanks12): feels like update_end_values should happen after contract logic
    update_end_values(composer, private_inputs, public_inputs);
    common_update_end_values(composer, private_inputs.private_call, public_inputs);

    common_contract_logic(composer,
                          private_inputs.private_call,
                          public_inputs,
                          private_inputs.signed_tx_request.tx_request.tx_context.contract_deployment_data,
                          private_inputs.signed_tx_request.tx_request.function_data);

    // We'll skip any verification in this native implementation, because for a Local Developer Testnet, there won't
    // _be_ a valid proof to verify!!! auto aggregation_object = verify_proofs(composer,
    //                                         private_inputs,
    //                                         _private_inputs.private_call.vk->num_public_inputs,
    //                                         _private_inputs.previous_kernel.vk->num_public_inputs);

    // TODO(dbanks12): kernel vk membership check!

    // In the native version, as there is no verify_proofs call, we can initialize aggregation object with the default
    // constructor.
    NT::AggregationObject const empty_aggregation_object{};
    public_inputs.end.aggregation_object = empty_aggregation_object;

    return public_inputs;
};

}  // namespace aztec3::circuits::kernel::private_kernel