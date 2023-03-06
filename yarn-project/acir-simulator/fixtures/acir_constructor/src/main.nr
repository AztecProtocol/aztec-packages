global MAX_ARGS: comptime Field = 5;
global MAX_RETURN_VALUES: comptime Field = 5;
global MAX_LOGS: comptime Field = 5;
global MAX_NEW_COMMITMENTS: comptime Field = 5;
global MAX_NEW_NULLIFIERS: comptime Field = 5;
global MAX_PRIVATE_CALL_STACK : comptime Field = 5;
global MAX_PUBLIC_CALL_STACK: comptime Field = 5;
global MAX_L1_MSG_STACK : comptime Field = 5;


struct PublicInputs {
    call_context : CallContext,

    args : [Field; MAX_ARGS],
    return_values : [Field; MAX_RETURN_VALUES],
    logs : [Field; MAX_LOGS],

    new_commitments : [Field; MAX_NEW_COMMITMENTS],
    new_nullifiers : [Field; MAX_NEW_NULLIFIERS],

    private_call_stack : [Field; MAX_PRIVATE_CALL_STACK],
    public_call_stack : [Field; MAX_PUBLIC_CALL_STACK],
    l1_message_stack : [Field; MAX_L1_MSG_STACK],

    old_private_data_tree_root : Field,
    old_nullifier_tree_root : Field,
    old_contract_tree_root : Field,
    
    contract_deployment_data: ContractDeploymentData,
}

struct CallContext {
    msg_sender : Field,
    storage_contract_address : Field,
    portal_contract_address : Field,

    is_delegate_call : bool,
    is_static_call : bool,
    is_contract_deployment: bool,
}

struct ContractDeploymentData {
    constructor_vk_hash : Field,
    function_tree_root : Field,
    contract_address_salt : Field,
    portal_contract_address : Field,
    hide_private_function_data : bool,
}

fn constrain_call_contexts(a: CallContext, b: CallContext) {
    constrain a.msg_sender == b.msg_sender;
    constrain a.storage_contract_address == b.storage_contract_address;
    constrain a.portal_contract_address == b.portal_contract_address;

    constrain a.is_delegate_call == b.is_delegate_call;
    constrain a.is_static_call == b.is_static_call;
    constrain a.is_contract_deployment == b.is_contract_deployment;
}

fn constrain_contract_deployment_data(a: ContractDeploymentData, b: ContractDeploymentData) {
    constrain a.constructor_vk_hash == b.constructor_vk_hash;
    constrain a.function_tree_root == b.function_tree_root;
    constrain a.contract_address_salt == b.contract_address_salt;
    constrain a.portal_contract_address == b.portal_contract_address;
    constrain a.hide_private_function_data == b.hide_private_function_data;
}

fn main(
    public_inputs: pub PublicInputs,
    args: [Field; MAX_ARGS], 
    call_context: CallContext, 
    contract_deployment_data: ContractDeploymentData
    ) {
    constrain_call_contexts(public_inputs.call_context, call_context);

    constrain public_inputs.args == args;
    constrain public_inputs.return_values == [0; MAX_RETURN_VALUES];
    constrain public_inputs.logs == [0; MAX_LOGS];

    constrain public_inputs.new_commitments == [0; MAX_NEW_COMMITMENTS];
    constrain public_inputs.new_nullifiers == [0; MAX_NEW_NULLIFIERS];

    constrain public_inputs.private_call_stack == [0; MAX_PRIVATE_CALL_STACK];
    constrain public_inputs.public_call_stack == [0; MAX_PUBLIC_CALL_STACK];
    constrain public_inputs.l1_message_stack == [0; MAX_L1_MSG_STACK];

    constrain public_inputs.old_private_data_tree_root == 0;
    constrain public_inputs.old_nullifier_tree_root == 0;
    constrain public_inputs.old_contract_tree_root == 0;

    constrain_contract_deployment_data(public_inputs.contract_deployment_data, contract_deployment_data);
}
