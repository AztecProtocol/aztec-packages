#include "common.hpp"

#include "init.hpp"

#include "aztec3/circuits/abis/complete_address.hpp"
#include "aztec3/circuits/abis/contract_deployment_data.hpp"
#include "aztec3/circuits/abis/function_data.hpp"
#include "aztec3/circuits/abis/kernel_circuit_public_inputs.hpp"
#include "aztec3/circuits/abis/new_contract_data.hpp"
#include "aztec3/circuits/abis/private_circuit_public_inputs.hpp"
#include "aztec3/circuits/abis/private_kernel/private_call_data.hpp"
#include "aztec3/circuits/abis/read_request_membership_witness.hpp"
#include "aztec3/circuits/hash.hpp"
#include "aztec3/constants.hpp"
#include "aztec3/utils/array.hpp"
#include "aztec3/utils/dummy_circuit_builder.hpp"

using DummyBuilder = aztec3::utils::DummyCircuitBuilder;

using aztec3::circuits::abis::CompleteAddress;
using aztec3::circuits::abis::ContractDeploymentData;
using aztec3::circuits::abis::ContractLeafPreimage;
using aztec3::circuits::abis::FunctionData;
using aztec3::circuits::abis::KernelCircuitPublicInputs;
using aztec3::circuits::abis::NewContractData;
using aztec3::circuits::abis::ReadRequestMembershipWitness;

using aztec3::utils::array_push;
using aztec3::utils::is_array_empty;
using aztec3::utils::push_array_to_array;
using aztec3::utils::validate_array;
using DummyBuilder = aztec3::utils::DummyCircuitBuilder;
using CircuitErrorCode = aztec3::utils::CircuitErrorCode;
using aztec3::circuits::abis::private_kernel::PrivateCallData;

namespace aztec3::circuits::kernel::private_kernel {

void common_validate_call_stack(DummyBuilder& builder, PrivateCallData<NT> const& private_call)
{
    const auto& stack = private_call.call_stack_item.public_inputs.private_call_stack;
    const auto& preimages = private_call.private_call_stack_preimages;
    for (size_t i = 0; i < stack.size(); ++i) {
        const auto& hash = stack[i];
        const auto& preimage = preimages[i];

        // Note: this assumes it's computationally infeasible to have `0` as a valid call_stack_item_hash.
        // Assumes `hash == 0` means "this stack item is empty".
        const auto calculated_hash = hash == 0 ? 0 : preimage.hash();
        builder.do_assert(hash == calculated_hash,
                          format("private_call_stack[", i, "] = ", hash, "; does not reconcile"),
                          CircuitErrorCode::PRIVATE_KERNEL__PRIVATE_CALL_STACK_ITEM_HASH_MISMATCH);
    }
}

/**
 * @brief Validate all read requests against the historical note hash tree root.
 * Use their membership witnesses to do so. If the historical root is not yet
 * initialized, initialize it using the first read request here (if present).
 *
 * @details More info here:
 * - https://discourse.aztec.network/t/to-read-or-not-to-read/178
 * - https://discourse.aztec.network/t/spending-notes-which-havent-yet-been-inserted/180
 *
 * @param builder
 * @param historical_note_hash_tree_root This is a reference to the historical root which all
 * read requests are checked against here.
 * @param read_requests the commitments being read by this private call - 'transient note reads' here are
 * `inner_note_hashes` (not yet siloed, not unique), but 'pre-existing note reads' are `unique_siloed_note_hashes`
 * @param read_request_membership_witnesses used to compute the note hash tree root
 * for a given request which is essentially a membership check
 */
void common_validate_read_requests(DummyBuilder& builder,
                                   NT::fr const& historical_note_hash_tree_root,
                                   std::array<fr, MAX_READ_REQUESTS_PER_CALL> const& read_requests,
                                   std::array<ReadRequestMembershipWitness<NT, NOTE_HASH_TREE_HEIGHT>,
                                              MAX_READ_REQUESTS_PER_CALL> const& read_request_membership_witnesses)
{
    // membership witnesses must resolve to the same note hash tree root
    // for every request in all kernel iterations
    for (size_t rr_idx = 0; rr_idx < aztec3::MAX_READ_REQUESTS_PER_CALL; rr_idx++) {
        const auto& read_request = read_requests[rr_idx];
        const auto& witness = read_request_membership_witnesses[rr_idx];

        // A pending commitment is the one that is not yet added to note hash tree
        // A "transient read" is when we try to "read" a pending commitment within a transaction
        // between function calls, as opposed to reading the outputs of a previous transaction
        // which is a "pending read".
        // We determine if it is a transient read depending on the leaf index from the membership witness
        // Note that the Merkle membership proof would be null and void in case of an transient read
        // but we use the leaf index as a placeholder to detect a 'pending note read'.
        if (read_request != 0 && !witness.is_transient) {
            const auto& root_for_read_request =
                root_from_sibling_path<NT>(read_request, witness.leaf_index, witness.sibling_path);
            builder.do_assert(
                root_for_read_request == historical_note_hash_tree_root,
                format("note hash tree root mismatch at read_request[",
                       rr_idx,
                       "]",
                       "\n\texpected root:    ",
                       historical_note_hash_tree_root,
                       "\n\tbut got root*:    ",
                       root_for_read_request,
                       "\n\tread_request**:   ",
                       read_request,
                       "\n\tleaf_index: ",
                       witness.leaf_index,
                       "\n\tis_transient: ",
                       witness.is_transient,
                       "\n\thint_to_commitment: ",
                       witness.hint_to_commitment,
                       "\n\t* got root by treating the read_request as a leaf in the note hash tree "
                       "and merkle-hashing to a root using the membership witness"
                       "\n\t** for 'pre-existing note reads', the read_request is the unique_siloed_note_hash "
                       "(it has been hashed with contract address and then a nonce)"),
                CircuitErrorCode::PRIVATE_KERNEL__READ_REQUEST_NOTE_HASH_TREE_ROOT_MISMATCH);
            // TODO(https://github.com/AztecProtocol/aztec-packages/issues/1354): do we need to enforce
            // that a non-transient read_request was derived from the proper/current contract address?
        }
    }
}

/**
 * @brief We validate that relevant arrays assumed to be zero-padded on the right comply to this format.
 *
 * @param builder
 * @param app_public_inputs Reference to the private_circuit_public_inputs of the current kernel iteration.
 */
void common_validate_arrays(DummyBuilder& builder, PrivateCircuitPublicInputs<NT> const& app_public_inputs)
{
    // Each of the following arrays is expected to be zero-padded.
    // In addition, some of the following arrays (new_commitments, etc...) are passed
    // to push_array_to_array() routines which rely on the passed arrays to be well-formed.
    validate_array(builder, app_public_inputs.return_values, "App public inputs - Return values");
    validate_array(builder, app_public_inputs.read_requests, "App public inputs - Read requests");
    validate_array(builder, app_public_inputs.new_commitments, "App public inputs - New commitments");
    validate_array(builder, app_public_inputs.new_nullifiers, "App public inputs - New nullifiers");
    validate_array(builder, app_public_inputs.nullified_commitments, "App public inputs - Nullified commitments");
    validate_array(builder, app_public_inputs.private_call_stack, "App public inputs - Private call stack");
    validate_array(builder, app_public_inputs.public_call_stack, "App public inputs - Public call stack");
    validate_array(builder, app_public_inputs.new_l2_to_l1_msgs, "App public inputs - New L2 to L1 messages");
    // encrypted_logs_hash and unencrypted_logs_hash have their own integrity checks.
}

/**
 * @brief We validate that relevant arrays assumed to be zero-padded on the right comply to this format.
 *
 * @param builder
 * @param end Reference to previous_kernel.public_inputs.end.
 */
void common_validate_previous_kernel_arrays(DummyBuilder& builder, CombinedAccumulatedData<NT> const& end)
{
    // Each of the following arrays is expected to be zero-padded.
    validate_array(builder, end.read_requests, "Accumulated data - Read Requests");
    validate_array(builder, end.new_commitments, "Accumulated data - New commitments");
    validate_array(builder, end.new_nullifiers, "Accumulated data - New nullifiers");
    validate_array(builder, end.nullified_commitments, "Accumulated data - Nullified commitments");
    validate_array(builder, end.private_call_stack, "Accumulated data - Private call stack");
    validate_array(builder, end.public_call_stack, "Accumulated data - Public call stack");
    validate_array(builder, end.new_l2_to_l1_msgs, "Accumulated data - New L2 to L1 messages");
}

void common_validate_previous_kernel_0th_nullifier(DummyBuilder& builder, CombinedAccumulatedData<NT> const& end)
{
    builder.do_assert(end.new_nullifiers[0] != 0,
                      "The 0th nullifier in the accumulated nullifier array is zero",
                      CircuitErrorCode::PRIVATE_KERNEL__0TH_NULLIFIER_IS_ZERO);
}

void common_validate_previous_kernel_values(DummyBuilder& builder, CombinedAccumulatedData<NT> const& end)
{
    common_validate_previous_kernel_arrays(builder, end);
    common_validate_previous_kernel_0th_nullifier(builder, end);
}

void common_update_end_values(DummyBuilder& builder,
                              PrivateCallData<NT> const& private_call,
                              KernelCircuitPublicInputs<NT>& public_inputs)
{
    const auto private_call_public_inputs = private_call.call_stack_item.public_inputs;

    const auto& read_requests = private_call_public_inputs.read_requests;
    const auto& read_request_membership_witnesses = private_call.read_request_membership_witnesses;


    const auto& new_commitments = private_call_public_inputs.new_commitments;
    const auto& new_nullifiers = private_call_public_inputs.new_nullifiers;
    const auto& nullified_commitments = private_call_public_inputs.nullified_commitments;

    const auto& is_static_call = private_call_public_inputs.call_context.is_static_call;

    if (is_static_call) {
        // No state changes are allowed for static calls:
        builder.do_assert(is_array_empty(new_commitments) == true,
                          "new_commitments must be empty for static calls",
                          CircuitErrorCode::PRIVATE_KERNEL__NEW_COMMITMENTS_PROHIBITED_IN_STATIC_CALL);
        builder.do_assert(is_array_empty(new_nullifiers) == true,
                          "new_nullifiers must be empty for static calls",
                          CircuitErrorCode::PRIVATE_KERNEL__NEW_NULLIFIERS_PROHIBITED_IN_STATIC_CALL);
    }

    const auto& storage_contract_address = private_call_public_inputs.call_context.storage_contract_address;

    // Transient read requests and witnesses are accumulated in public_inputs.end
    // We silo the read requests (domain separation per contract address)
    {
        for (size_t i = 0; i < read_requests.size(); ++i) {
            const auto& read_request = read_requests[i];
            const auto& witness = read_request_membership_witnesses[i];
            if (witness.is_transient) {  // only forward transient to public inputs
                // TODO (David): This is pushing zeroed read requests for public inputs if they are transient. Is that
                // correct?
                const auto siloed_read_request =
                    read_request == 0 ? 0 : silo_commitment<NT>(storage_contract_address, read_request);
                array_push(builder,
                           public_inputs.end.read_requests,
                           siloed_read_request,
                           format(PRIVATE_KERNEL_CIRCUIT_ERROR_MESSAGE_BEGINNING,
                                  "too many transient read requests in one tx"));
            }
        }
    }

    // Enhance commitments and nullifiers with domain separation whereby domain is the contract.
    {
        // nullifiers
        std::array<NT::fr, MAX_NEW_NULLIFIERS_PER_CALL> siloed_new_nullifiers{};
        for (size_t i = 0; i < MAX_NEW_NULLIFIERS_PER_CALL; ++i) {
            siloed_new_nullifiers[i] =
                new_nullifiers[i] == 0 ? 0 : silo_nullifier<NT>(storage_contract_address, new_nullifiers[i]);
        }
        push_array_to_array(
            builder,
            siloed_new_nullifiers,
            public_inputs.end.new_nullifiers,
            format(PRIVATE_KERNEL_CIRCUIT_ERROR_MESSAGE_BEGINNING, "too many new nullifiers in one tx"));

        // commitments
        std::array<NT::fr, MAX_NEW_COMMITMENTS_PER_CALL> siloed_new_commitments{};
        for (size_t i = 0; i < new_commitments.size(); ++i) {
            siloed_new_commitments[i] =
                new_commitments[i] == 0 ? 0 : silo_commitment<NT>(storage_contract_address, new_commitments[i]);
        }
        push_array_to_array(
            builder,
            siloed_new_commitments,
            public_inputs.end.new_commitments,
            format(PRIVATE_KERNEL_CIRCUIT_ERROR_MESSAGE_BEGINNING, "too many new commitments in one tx"));

        // nullified commitments (for matching transient nullifiers to transient commitments)
        // Since every new_nullifiers entry is paired with a nullified_commitment, EMPTY
        // is used here for nullified_commitments of persistable nullifiers. EMPTY will still
        // take up a slot in the nullified_commitments array so that the array lines up properly
        // with new_nullifiers. This is necessary since the constant-size circuit-array functions
        // we use assume that the first 0-valued array entry designates the end of the array.
        std::array<NT::fr, MAX_NEW_NULLIFIERS_PER_CALL> siloed_nullified_commitments{};
        for (size_t i = 0; i < MAX_NEW_NULLIFIERS_PER_CALL; ++i) {
            siloed_nullified_commitments[i] =
                nullified_commitments[i] == fr(0) ? fr(0)  // don't silo when empty
                : nullified_commitments[i] == fr(EMPTY_NULLIFIED_COMMITMENT)
                    ? fr(EMPTY_NULLIFIED_COMMITMENT)  // don't silo when empty
                    : silo_commitment<NT>(storage_contract_address, nullified_commitments[i]);
        }

        push_array_to_array(
            builder,
            siloed_nullified_commitments,
            public_inputs.end.nullified_commitments,
            format(PRIVATE_KERNEL_CIRCUIT_ERROR_MESSAGE_BEGINNING, "too many new nullified commitments in one tx"));
    }

    {  // call stacks
        const auto& this_private_call_stack = private_call_public_inputs.private_call_stack;
        push_array_to_array(
            builder,
            this_private_call_stack,
            public_inputs.end.private_call_stack,
            format(PRIVATE_KERNEL_CIRCUIT_ERROR_MESSAGE_BEGINNING, "too many private call stacks in one tx"));

        const auto& this_public_call_stack = private_call_public_inputs.public_call_stack;
        push_array_to_array(
            builder,
            this_public_call_stack,
            public_inputs.end.public_call_stack,
            format(PRIVATE_KERNEL_CIRCUIT_ERROR_MESSAGE_BEGINNING, "too many public call stacks in one tx"));
    }

    {  // new l2 to l1 messages
        const auto& portal_contract_address = private_call.portal_contract_address;
        const auto& new_l2_to_l1_msgs = private_call_public_inputs.new_l2_to_l1_msgs;
        std::array<NT::fr, MAX_NEW_L2_TO_L1_MSGS_PER_CALL> new_l2_to_l1_msgs_to_insert{};
        for (size_t i = 0; i < new_l2_to_l1_msgs.size(); ++i) {
            if (!new_l2_to_l1_msgs[i].is_zero()) {
                new_l2_to_l1_msgs_to_insert[i] = compute_l2_to_l1_hash<NT>(storage_contract_address,
                                                                           private_call_public_inputs.version,
                                                                           portal_contract_address,
                                                                           private_call_public_inputs.chain_id,
                                                                           new_l2_to_l1_msgs[i]);
            }
        }
        push_array_to_array(
            builder,
            new_l2_to_l1_msgs_to_insert,
            public_inputs.end.new_l2_to_l1_msgs,
            format(PRIVATE_KERNEL_CIRCUIT_ERROR_MESSAGE_BEGINNING, "too many new l2 to l1 messages in one tx"));
    }

    {  // logs hashes
        // See the following thread if not clear:
        // https://discourse.aztec.network/t/proposal-forcing-the-sequencer-to-actually-submit-data-to-l1/426
        const auto& previous_encrypted_logs_hash = public_inputs.end.encrypted_logs_hash;
        const auto& current_encrypted_logs_hash = private_call_public_inputs.encrypted_logs_hash;
        public_inputs.end.encrypted_logs_hash = accumulate_sha256<NT>({ previous_encrypted_logs_hash[0],
                                                                        previous_encrypted_logs_hash[1],
                                                                        current_encrypted_logs_hash[0],
                                                                        current_encrypted_logs_hash[1] });

        const auto& previous_unencrypted_logs_hash = public_inputs.end.unencrypted_logs_hash;
        const auto& current_unencrypted_logs_hash = private_call_public_inputs.unencrypted_logs_hash;
        public_inputs.end.unencrypted_logs_hash = accumulate_sha256<NT>({ previous_unencrypted_logs_hash[0],
                                                                          previous_unencrypted_logs_hash[1],
                                                                          current_unencrypted_logs_hash[0],
                                                                          current_unencrypted_logs_hash[1] });

        // Add log preimages lengths from current iteration to accumulated lengths
        public_inputs.end.encrypted_log_preimages_length = public_inputs.end.encrypted_log_preimages_length +
                                                           private_call_public_inputs.encrypted_log_preimages_length;
        public_inputs.end.unencrypted_log_preimages_length =
            public_inputs.end.unencrypted_log_preimages_length +
            private_call_public_inputs.unencrypted_log_preimages_length;
    }
}

void common_contract_logic(DummyBuilder& builder,
                           PrivateCallData<NT> const& private_call,
                           KernelCircuitPublicInputs<NT>& public_inputs,
                           ContractDeploymentData<NT> const& contract_dep_data,
                           FunctionData<NT> const& function_data)
{
    const auto private_call_public_inputs = private_call.call_stack_item.public_inputs;
    const auto& storage_contract_address = private_call_public_inputs.call_context.storage_contract_address;
    const auto& portal_contract_address = private_call.portal_contract_address;

    // TODO(#3062) VKs are mocked out for now
    // const auto private_call_vk_hash = stdlib::recursion::verification_key<CT::bn254>::hash_native(private_call.vk);
    const auto private_call_vk_hash = 0;

    const auto is_contract_deployment = public_inputs.constants.tx_context.is_contract_deployment_tx;

    if (is_contract_deployment) {
        auto constructor_hash =
            compute_constructor_hash(function_data, private_call_public_inputs.args_hash, private_call_vk_hash);

        auto const new_contract_address = CompleteAddress<NT>::compute(contract_dep_data.deployer_public_key,
                                                                       contract_dep_data.contract_address_salt,
                                                                       contract_dep_data.function_tree_root,
                                                                       constructor_hash)
                                              .address;

        // Add new contract data if its a contract deployment function
        NewContractData<NT> const native_new_contract_data{ new_contract_address,
                                                            portal_contract_address,
                                                            contract_dep_data.function_tree_root };

        array_push(builder,
                   public_inputs.end.new_contracts,
                   native_new_contract_data,
                   format(PRIVATE_KERNEL_CIRCUIT_ERROR_MESSAGE_BEGINNING, "too many contracts created in one tx"));

        // TODO(#3062) VKs are mocked out for now
        // builder.do_assert(contract_dep_data.constructor_vk_hash == private_call_vk_hash,
        //                   "constructor_vk_hash doesn't match private_call_vk_hash",
        //                   CircuitErrorCode::PRIVATE_KERNEL__INVALID_CONSTRUCTOR_VK_HASH);

        // must imply == derived address
        builder.do_assert(storage_contract_address == new_contract_address,
                          "contract address supplied doesn't match derived address",
                          CircuitErrorCode::PRIVATE_KERNEL__INVALID_CONTRACT_ADDRESS);

        // compute contract address nullifier
        auto const blake_input = new_contract_address.to_field().to_buffer();
        auto const new_contract_address_nullifier = NT::fr::serialize_from_buffer(NT::blake2s(blake_input).data());

        // push the contract address nullifier to nullifier vector
        array_push(builder,
                   public_inputs.end.new_nullifiers,
                   new_contract_address_nullifier,
                   format(PRIVATE_KERNEL_CIRCUIT_ERROR_MESSAGE_BEGINNING,
                          "too many nullifiers in one tx to add the new contract address"));
    } else {
        // non-contract deployments must specify contract address being interacted with
        builder.do_assert(storage_contract_address != 0,
                          "contract address can't be 0 for non-contract deployment related transactions",
                          CircuitErrorCode::PRIVATE_KERNEL__INVALID_CONTRACT_ADDRESS);

        /* We need to compute the root of the contract tree, starting from the function's VK:
         * - Compute the vk_hash (done above)
         * - Compute the function_leaf: hash(function_selector, is_internal, is_private, vk_hash, acir_hash)
         * - Hash the function_leaf with the function_leaf's sibling_path to get the function_tree_root
         * - Compute the contract_leaf: hash(contract_address, portal_contract_address, function_tree_root)
         * - Hash the contract_leaf with the contract_leaf's sibling_path to get the contract_tree_root
         */

        // Ensures that if the function is internal, only the contract itself can call it
        if (private_call.call_stack_item.function_data.is_internal) {
            builder.do_assert(
                storage_contract_address == private_call.call_stack_item.public_inputs.call_context.msg_sender,
                "call is internal, but msg_sender is not self",
                CircuitErrorCode::PRIVATE_KERNEL__IS_INTERNAL_BUT_NOT_SELF_CALL);
        }

        // The logic below ensures that the contract exists in the contracts tree
        auto const& computed_function_tree_root =
            function_tree_root_from_siblings<NT>(private_call.call_stack_item.function_data.selector,
                                                 private_call.call_stack_item.function_data.is_internal,
                                                 true,  // is_private
                                                 private_call_vk_hash,
                                                 private_call.acir_hash,
                                                 private_call.function_leaf_membership_witness.leaf_index,
                                                 private_call.function_leaf_membership_witness.sibling_path);

        auto const& computed_contract_tree_root =
            contract_tree_root_from_siblings<NT>(computed_function_tree_root,
                                                 storage_contract_address,
                                                 portal_contract_address,
                                                 private_call.contract_leaf_membership_witness.leaf_index,
                                                 private_call.contract_leaf_membership_witness.sibling_path);

        auto const& purported_contract_tree_root =
            private_call.call_stack_item.public_inputs.block_header.contract_tree_root;

        builder.do_assert(
            computed_contract_tree_root == purported_contract_tree_root,
            "computed_contract_tree_root doesn't match purported_contract_tree_root",
            CircuitErrorCode::PRIVATE_KERNEL__COMPUTED_CONTRACT_TREE_ROOT_AND_PURPORTED_CONTRACT_TREE_ROOT_MISMATCH);
    }
}

}  // namespace aztec3::circuits::kernel::private_kernel
