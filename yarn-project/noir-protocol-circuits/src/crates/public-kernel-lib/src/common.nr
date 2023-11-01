use crate::abis::public_circuit_public_inputs::publicCircuitPublicInputs;
use crate::abis::kernel_circuit_public_inputs::KernelCircuitPublicInputsBuilder;
use crate::utils::arrays;
use crate::abis::previous_kernel_data::PreviousKernelData;
use crate::abis::public_kernel::public_kernel_inputs_data::publicCallData;
use crate::abis::combined_accumulated_data::{CombinedAccumulatedData, CombinedAccumulatedDataBuilder};
use crate::abis::public_kernel::public_kernel_inputs_data::ReadRequestMembershipWitnesspublicData;
use crate::hash::{read_request_root_from_siblings, function_tree_root_from_siblings, contract_tree_root_from_siblings, silo_commitment, silo_nullifier,stdlib_recursion_verification_key_compress_native_vk, compute_new_contract_address_hash, compute_l2_to_l1_hash,compute_constructor_hash, compute_logs_hash};
use crate::address::{EthAddress, Address};
use crate::abis::function_data::FunctionData;
use crate::point::Point;
use crate::abis::new_contract_data::NewContractData;
use crate::abis::complete_address::CompleteAddress;
use crate::utils::bounded_vec::BoundedVec;

use dep::aztec::constants_gen::{
    MAX_READ_REQUESTS_PER_CALL,
    MAX_NEW_NULLIFIERS_PER_CALL,
    EMPTY_NULLIFIED_COMMITMENT,
    MAX_NEW_L2_TO_L1_MSGS_PER_CALL,
    MAX_NEW_COMMITMENTS_PER_CALL,
};

pub fn validate_arrays(app_public_inputs : PublicCircuitPublicInputs) {
    // Each of the following arrays is expected to be zero-padded.
    // In addition, some of the following arrays (new_commitments, etc...) are passed
    // to push_array_to_array() routines which rely on the passed arrays to be well-formed.
    
    arrays::validate_array(app_public_inputs.return_values);
    arrays::validate_array(app_public_inputs.read_requests);
    arrays::validate_array(app_public_inputs.pending_read_requests);
    arrays::validate_array(app_public_inputs.new_commitments);
    arrays::validate_array(app_public_inputs.new_nullifiers);
    arrays::validate_array(app_public_inputs.nullified_commitments);
    arrays::validate_array(app_public_inputs.public_kernel_inputs_stack);
    arrays::validate_array(app_public_inputs.public_kernel_inputs_stack);
    arrays::validate_array(app_public_inputs.new_l2_to_l1_msgs);
    
    // encrypted_logs_hash and unencrypted_logs_hash have their own integrity checks.
}

// Validate that all pre-images on the call stack hash to equal the accumulated data
pub fn validate_call_stack(public_call : PublicCallData) {
    let stack = public_call.call_stack_item.public_inputs().public_kernel_inputs_stack;
    let preimages = public_call.public_call_stack_preimages;

    let our_contract_address = public_call.call_stack_item.contract_address;
    let our_storage_address = public_call.call_stack_item.public_inputs.call_context.storage_contract_address;
    let our_msg_sender = public_call.call_stack_item.public_inputs.call_context.msg_sender;
    let our_portal_contract_address =
        public_call.call_stack_item.public_inputs.call_context.portal_contract_address;
    
    assert(stack.len() == preimages.len()); // This is not in the cpp code.
    for i in 0..stack.len() {
        let hash = stack[i];
        let preimage = preimages[i];

        let is_delegate_call = preimage.public_inputs.call_context.is_delegate_call;
        let is_static_call = preimage.public_inputs.call_context.is_static_call;
        let contract_being_called = preimage.contract_address;

        // Note: this assumes it's computationally infeasible to have `0` as a valid call_stack_item_hash.
        // Assumes `hash == 0` means "this stack item is empty".

        let calculated_hash = if hash == 0 {
            0
        } else {
            preimage.hash()
        };
        assert(hash == calculated_hash, "call stack item hash doesn't match preimage hash");

        // here we validate the msg sender for each call on the stack
        // we need to consider regular vs delegate calls
        let preimage_msg_sender = preimage.public_inputs.call_context.msg_sender;
        let expected_msg_sender = is_delegate_call ? our_msg_sender : our_contract_address;
        assert(preimage_msg_sender==expected_msg_sender, "call_stack_msg_sender doesn't match expected_msg_sender");

        // here we validate the storage address for each call on the stack
        // we need to consider regular vs delegate calls
        let preimage_storage_address = preimage.public_inputs.call_context.storage_contract_address;
        let expected_storage_address = is_delegate_call ? our_storage_address : contract_being_called;
        assert(preimage_storage_address==expected_storage_address, "call_stack_storage_address doesnt match expected_storage_address");

        // if it is a delegate call then we check that the portal contract in the pre image is our portal contract
        let preimage_portal_address = preimage.public_inputs.call_context.portal_contract_address;
        let expected_portal_address = our_portal_contract_address;
        assert(preimage_portal_address==expected_portal_address, "call_stack_portal_contract_address doesnt match expected_portal_address");

        let num_contract_storage_update_requests = preimage.public_inputs.contract_storage_update_requests.len();
        assert(!is_static_call || num_contract_storage_update_requests == 0,"contract_storage_update_requests should be empty for static call")
    }
}

// Validates the call context of the current iteration
pub fn validate_call_context(public_call: PublicCallData){
    let call_stack_item = public_call.call_stack_item;
    let is_delegate_call = call_stack_item.public_inputs.call_context.is_delegate_call;
    let is_static_call = call_stack_item.public_inputs.call_context.is_static_call;
    let contract_address = call_stack_item.contract_address;
    let storage_contract_address = call_stack_item.public_inputs.call_context.storage_contract_address;
    let contract_storage_update_requests_length =
        call_stack_item.public_inputs.contract_storage_update_requests.len();

    assert(!is_delegate_call || contract_address != storage_contract_address,
                      "curent contract address must not match storage contract address for delegate calls");
    assert(
        !is_static_call || contract_storage_update_requests_length == 0,
        "No contract storage update requests are allowed for static calls");

}

// Validates the kernel execution of the current iteration
pub fn common_validate_kernel_execution(public_call: PublicCallData)
{
    common_validate_call_context(public_call);
    common_validate_call_stack(public_call);
};

//Validates inputs to the kernel circuit that are common to all invocation scenarios
pub fn common_validate_inputs(public_call: PublicCallData){
    // Validates commons inputs for all type of kernel inputs
    let this_call_stack_item: PublicCallStackItem = public_call.call_stack_item;
    assert(this_call_stack_item.public_inputs.call_context.is_contract_deployment == false,
                      "Contract deployment can't be a public function");
    assert(this_call_stack_item.contract_address != 0,
                      "Contract address must be non-zero");
    assert(this_call_stack_item.function_data.selector.value != 0,
                      "Function signature must be non-zero");
    assert(this_call_stack_item.function_data.is_constructor == false,
                      "Constructors can't be public functions");
    assert(this_call_stack_item.function_data.is_private == false,
                      "Cannot execute a private function with the public kernel circuit");
    assert(public_call.public_kernel_inputs.bytecode_hash != 0,
                      "Bytecode hash must be non-zero");

    if (this_call_stack_item.function_data.is_internal) {
        let target = this_call_stack_item.contract_address;
        let sender = this_call_stack_item.public_inputs.call_context.msg_sender;

        assert(target == sender, "call is internal, but msg_sender is not self");
    }
}

pub fn perform_static_call_checks(public_kernel_inputs: PublicCallData){
    let public_kernel_inputs_public_inputs = public_kernel_inputs.call_stack_item.public_inputs();

    let is_static_call = public_kernel_inputspublic_inputs.call_context.is_static_call;
    // If the call is a static call, there should be no new commitments or nullifiers.
    let new_commitments = private_call_public_inputs.new_commitments;
    let new_nullifiers = private_call_public_inputs.new_nullifiers;

    if is_static_call {
        // No state changes are allowed for static calls:
        assert(arrays::is_empty_array(new_commitments), "new_commitments must be empty for static calls");
        assert(arrays::is_empty_array(new_nullifiers), "new_nullifiers must be empty for static calls");
    }
}

pub fn propagate_valid_public_data_update_requests(public_kernel_inputs: PublicKernelInputs, public_inputs: &mut KernelCircuitPublicInputsBuilder){
    const auto& contract_address = public_kernel_inputs.public_kernel_inputs.call_stack_item.contract_address;
    const auto& update_requests =
        public_kernel_inputs.public_kernel_inputs.call_stack_item.public_inputs.contract_storage_update_requests;
    for (size_t i = 0; i < MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX; ++i) {
        const auto& update_request = update_requests[i];
        if (update_request.is_empty()) {
            continue;
        }
        const auto new_write = PublicDataUpdateRequest<NT>{
            .leaf_index = compute_public_data_tree_index<NT>(contract_address, update_request.storage_slot),
            .old_value = compute_public_data_tree_value<NT>(update_request.old_value),
            .new_value = compute_public_data_tree_value<NT>(update_request.new_value),
        };
        array_push(
            builder,
            circuit_outputs.end.public_data_update_requests,
            new_write,
            format(PUBLIC_KERNEL_CIRCUIT_ERROR_MESSAGE_BEGINNING, "too many public data update requests in one tx"));
    }

}


pub fn initialize_end_values(previous_kernel : PreviousKernelData, circuit_outputs: &mut KernelCircuitPublicInputsBuilder) {
    // Initialises the circuit outputs with the end state of the previous iteration
    circuit_outputs.constants = previous_kernel.public_inputs.constants;

    // Ensure the arrays are the same as previously, before we start pushing more data onto them in other
    // functions within this circuit:
    let end = circuit_outputs.end;
    let start = previous_kernel.public_inputs.end;

    end.new_commitments = arrays::array_to_bounded_vec(start.new_commitments, arrays::is_empty, 0);
    end.new_nullifiers = arrays::array_to_bounded_vec(start.new_nullifiers, arrays::is_empty, 0);

    end.private_call_stack = arrays::array_to_bounded_vec(start.private_call_stack, arrays::is_empty, 0);
    end.public_call_stack = arrays::array_to_bounded_vec(start.public_call_stack, arrays::is_empty, 0);
    end.new_l2_to_l1_msgs = arrays::array_to_bounded_vec(start.new_l2_to_l1_msgs, arrays::is_empty, 0);

    end.optionally_revealed_data = start.optionally_revealed_data;

    end.public_data_update_requests = start.public_data_update_requests;
    end.public_data_reads = start.public_data_reads;

    // Public kernel does not modify encrypted logs values --> we just copy them to output
    end.encrypted_logs_hash = start.encrypted_logs_hash;
    end.encrypted_log_preimages_length = start.encrypted_log_preimages_length;

    end.new_contracts = arrays::array_to_bounded_vec(previous_kernel.public_inputs.end.new_contracts, |ncd: NewContractData| ncd.is_empty(), NewContractData::default());
}

pub fn update_public_end_values(public_kernel_inputs: PublicKernelInputs, public_inputs : &mut KernelCircuitPublicInputsBuilder) {
    public_inputs.is_private = false;

    perform_static_call_checks(public_kernel_inputs);
    let public_kernel_inputs_public_inputs = public_kernel_inputs.call_stack_item.public_inputs();



    let storage_contract_address = public_kernel_inputs_public_inputs.call_context.storage_contract_address;
    
    // Transient read requests and witnesses are accumulated in public_inputs.end
    // We silo the read requests (domain separation per contract address)
    assert(read_requests.len() == read_request_membership_witnesses.len()); // This is not done in the cpp code.
    let mut siloed_read_requests: BoundedVec<Field,MAX_READ_REQUESTS_PER_CALL> = BoundedVec::new(0);

    assert(read_requests.len() == MAX_READ_REQUESTS_PER_CALL); // This is not done in the cpp code
    for i in 0..MAX_READ_REQUESTS_PER_CALL {
        let read_request = read_requests[i];
        let witness = read_request_membership_witnesses[i];
        if witness.is_transient & (read_request != 0) {  // only forward transient to public inputs
            siloed_read_requests.push(silo_commitment(storage_contract_address, read_request))
        }
    }
    public_inputs.end.read_requests.push_vec(siloed_read_requests);

    // Enhance commitments and nullifiers with domain separation whereby domain is the contract.
    //
    // nullifiers
    let mut siloed_new_nullifiers : BoundedVec<Field,MAX_NEW_NULLIFIERS_PER_CALL> = BoundedVec::new(0);
    assert(new_nullifiers.len() == MAX_NEW_NULLIFIERS_PER_CALL);
    for i in 0..MAX_NEW_NULLIFIERS_PER_CALL {
        let new_nullifier = new_nullifiers[i];
        if new_nullifier != 0 {
            siloed_new_nullifiers.push(silo_nullifier(storage_contract_address, new_nullifier));
        }
    }

    public_inputs.end.new_nullifiers.push_vec(siloed_new_nullifiers);

    // commitments
    let mut siloed_new_commitments : BoundedVec<Field, MAX_NEW_COMMITMENTS_PER_CALL> = BoundedVec::new(0);
    assert(new_commitments.len() == MAX_NEW_COMMITMENTS_PER_CALL);
    for i in 0..MAX_NEW_COMMITMENTS_PER_CALL {
        let new_commitment = new_commitments[i];
        if new_commitment != 0 {
            siloed_new_commitments.push(silo_commitment(storage_contract_address, new_commitment));
        }
    }
    public_inputs.end.new_commitments.push_vec(siloed_new_commitments);

    // nullified commitments (for matching transient nullifiers to transient commitments)
    // Since every new_nullifiers entry is paired with a nullified_commitment, EMPTY
    // is used here for nullified_commitments of persistable nullifiers. EMPTY will still
    // take up a slot in the nullified_commitments array so that the array lines up properly
    // with new_nullifiers. This is necessary since the constant-size circuit-array functions
    // we use assume that the first 0-valued array entry designates the end of the array.
    let mut siloed_nullified_commitments : BoundedVec<Field, MAX_NEW_NULLIFIERS_PER_CALL> = BoundedVec::new(0);
    for i in 0..MAX_NEW_NULLIFIERS_PER_CALL {
        // TODO(David): There are two ways to specify that a nullified commitment is empty.
        // Either with 0 or the special EMPTY_NULLIFIED_COMMITMENT constant
        // We do not silo when the commitment is either one of these empty states.

        let nullified_commitment_is_zero = nullified_commitments[i] == 0;
        let nullified_commitment_is_empty_constant = nullified_commitments[i] == EMPTY_NULLIFIED_COMMITMENT;
        let siloed_nullified_commitment = if nullified_commitment_is_zero {
            0
        } else if nullified_commitment_is_empty_constant {
            EMPTY_NULLIFIED_COMMITMENT
        } else {
            silo_commitment(storage_contract_address, nullified_commitments[i])
        };

        if siloed_nullified_commitment != 0 {
            siloed_nullified_commitments.push(siloed_nullified_commitment);
        }
    }
    // TODO(Kev): These operations should be carefully checked with the cpp array_push code
    public_inputs.end.nullified_commitments.push_vec(siloed_nullified_commitments);

    // Call stacks
    let public_kernel_inputs_stack = arrays::array_to_bounded_vec(public_kernel_inputs_public_inputs.public_kernel_inputs_stack, arrays::is_empty, 0);
    public_inputs.end.public_kernel_inputs_stack.push_vec(public_kernel_inputs_stack);

    propagate_new_l2_to_l1_messages(public_kernel_inputs, public_inputs);
    // logs hashes
    // See the following thread if not clear:
    // https://discourse.aztec.network/t/proposal-forcing-the-sequencer-to-actually-submit-data-to-l1/426
    let previous_encrypted_logs_hash = public_inputs.end.encrypted_logs_hash;
    let current_encrypted_logs_hash = public_kernel_inputs_public_inputs.encrypted_logs_hash;
    public_inputs.end.encrypted_logs_hash = compute_logs_hash(previous_encrypted_logs_hash,current_encrypted_logs_hash);
    let previous_unencrypted_logs_hash = public_inputs.end.unencrypted_logs_hash;
    let current_unencrypted_logs_hash = public_kernel_inputs_public_inputs.unencrypted_logs_hash;
    public_inputs.end.unencrypted_logs_hash = compute_logs_hash(previous_unencrypted_logs_hash,current_unencrypted_logs_hash);
    
    // Add log preimages lengths from current iteration to accumulated lengths
    public_inputs.end.encrypted_log_preimages_length = public_inputs.end.encrypted_log_preimages_length +
                                                           public_kernel_inputs_public_inputs.encrypted_log_preimages_length;
    public_inputs.end.unencrypted_log_preimages_length = public_inputs.end.unencrypted_log_preimages_length + public_kernel_inputs_public_inputs.unencrypted_log_preimages_length;
}

pub fn propagate_new_l2_to_l1_messages(public_kernel_inputs: PublicKernelInputs, public_inputs: KernelCircuitPublicInputs){
    // new l2 to l1 messages
    let portal_contract_address = public_kernel_inputs.portal_contract_address;
    let new_l2_to_l1_msgs = public_kernel_inputs_public_inputs.new_l2_to_l1_msgs;
    let mut new_l2_to_l1_msgs_to_insert : BoundedVec<Field, MAX_NEW_L2_TO_L1_MSGS_PER_CALL> = BoundedVec::new(0);
    for i in 0..MAX_NEW_L2_TO_L1_MSGS_PER_CALL {
        let msg_is_zero = new_l2_to_l1_msgs[i] == 0;
        if msg_is_zero == false {
            let new_l2_to_l1_msgs = compute_l2_to_l1_hash(storage_contract_address,
                                                                           public_kernel_inputs_public_inputs.version,
                                                                           portal_contract_address,
                                                                           public_kernel_inputs_public_inputs.chain_id,
                                                                           new_l2_to_l1_msgs[i]);
            new_l2_to_l1_msgs_to_insert.push(new_l2_to_l1_msgs)
        }
    }
    public_inputs.end.new_l2_to_l1_msgs.push_vec(new_l2_to_l1_msgs_to_insert);
}

/**
 * @brief Accumulates unencrypted logs hashes and lengths.
 * @tparam The type of kernel input
 * @param public_kernel_inputs The inputs to this iteration of the kernel circuit
 * @param circuit_outputs The circuit outputs to be populated
 * @note See the following thread if not clear:
 *       https://discourse.aztec.network/t/proposal-forcing-the-sequencer-to-actually-submit-data-to-l1/426
 * @note Used by public kernels which had previous iterations.
 */
pub fn accumulate_unencrypted_logs(public_kernel_inputs: PublicKernelInputs,
                                    public_inputs: KernelCircuitPublicInputs)
{
    let public_kernel_inputs_public_inputs = public_kernel_inputs.public_kernel_inputs.call_stack_item.public_inputs;

    let& previous_kernel_end = public_kernel_inputs.previous_kernel.public_inputs.end;
    let& previous_unencrypted_logs_hash = previous_kernel_end.unencrypted_logs_hash;

    let& current_unencrypted_logs_hash = public_kernel_inputs_public_inputs.unencrypted_logs_hash;
    circuit_outputs.end.unencrypted_logs_hash = accumulate_sha256<NT>({ previous_unencrypted_logs_hash[0],
                                                                        previous_unencrypted_logs_hash[1],
                                                                        current_unencrypted_logs_hash[0],
                                                                        current_unencrypted_logs_hash[1] });

    // Add log preimages lengths from current iteration to accumulated lengths
    let& current_unencrypted_log_preimages_length = public_kernel_inputs_public_inputs.unencrypted_log_preimages_length;
    circuit_outputs.end.unencrypted_log_preimages_length =
        previous_kernel_end.unencrypted_log_preimages_length + current_unencrypted_log_preimages_length;
}

// from public/common.cpp
pub fn common_initialise_end_values(public_kernel_inputs: PublicKernelInputs, circuit_outputs: KernelCircuitPublicInputs)
{
    // Initialises the circuit outputs with the end state of the previous iteration
    circuit_outputs.constants = public_kernel_inputs.previous_kernel.public_inputs.constants;

    // Ensure the arrays are the same as previously, before we start pushing more data onto them in other functions
    // within this circuit:
    let end = circuit_outputs.end;
    let start = public_kernel_inputs.previous_kernel.public_inputs.end;

    end.new_commitments = start.new_commitments;
    end.new_nullifiers = start.new_nullifiers;

    end.private_call_stack = start.private_call_stack;
    end.public_kernel_inputs_stack = start.public_kernel_inputs_stack;
    end.new_l2_to_l1_msgs = start.new_l2_to_l1_msgs;

    end.optionally_revealed_data = start.optionally_revealed_data;

    end.public_data_update_requests = start.public_data_update_requests;
    end.public_data_reads = start.public_data_reads;

    // Public kernel does not modify encrypted logs values --> we just copy them to output
    end.encrypted_logs_hash = start.encrypted_logs_hash;
    end.encrypted_log_preimages_length = start.encrypted_log_preimages_length;

    end.new_contracts = start.new_contracts;
}

/**
 * @brief Validates that the call stack item for this circuit iteration is at the top of the call stack
 * @param builder The circuit builder
 * @param public_kernel_inputs The inputs to this iteration of the kernel circuit
 */
 pub fn validate_this_public_call_hash(public_kernel_inputs: PublicKernelInputs, public_inputs: &mut KernelCircuitPublicInputs)
{
    // If public call stack is empty, we bail so array_pop doesn't throw_or_abort
    assert(public_inputs.end.public_kernel_inputs_stack.len() == 0 , "Public call stack can't be empty");

    // Pops the current function execution from the stack and validates it against the call stack item

    // TODO: this logic might need to change to accommodate the weird edge 3 initial txs (the 'main' tx, the 'fee' tx,
    // and the 'gas rebate' tx).
    let popped_public_kernel_inputs_hash = public_inputs.end.public_kernel_inputs_stack.pop();
    let calculated_this_public_kernel_inputs_hash = public_kernel_inputs.end.public_kernel_inputs.call_stack_item.hash();

    assert(
        popped_public_kernel_inputs_hash == calculated_this_public_kernel_inputs_hash,
        "calculated public_kernel_inputs_hash does not match provided public_kernel_inputs_hash at the top of the call stack");
};