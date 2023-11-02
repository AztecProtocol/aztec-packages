use crate::{
    transaction::{
        request::TxRequest,
        context::TxContext,
    },
    address::EthAddress,
    contrakt::{
        deployment_data::ContractDeploymentData,
    },
    abis::{
        combined_constant_data::CombinedConstantData,
        previous_kernel_data::PreviousKernelData,
        private_kernel::private_call_data::PrivateCallData,
        historical_block_data::HistoricalBlockData,
        call_context::CallContext,
        private_circuit_public_inputs::PrivateCircuitPublicInputs,
        complete_address::CompleteAddress,
        call_stack_item::{PrivateCallStackItem, CallStackItem},
    },
    hash::{
        NUM_FIELDS_PER_SHA256,
        compute_constructor_hash,
    },
    utils::bounded_vec::BoundedVec,
    point::Point,
    mocked::{Proof, VerificationKey},
    tests::fixtures,
};
use dep::aztec::{
    abi::hash_args,
    constants_gen::{
        EMPTY_NULLIFIED_COMMITMENT,
        MAX_READ_REQUESTS_PER_CALL,
        MAX_NEW_COMMITMENTS_PER_CALL,
        MAX_NEW_NULLIFIERS_PER_CALL,
        MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL,
        MAX_PENDING_READ_REQUESTS_PER_CALL,
        MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL,
        MAX_NEW_L2_TO_L1_MSGS_PER_CALL,
        RETURN_VALUES_LENGTH,
        NOTE_HASH_TREE_HEIGHT,
    }
};

struct PrivateAppInputs {
    call_context: CallContext, 
    historical_block_data: HistoricalBlockData,
    contract_deployment_data: ContractDeploymentData,
    args_hash: Field,
    chain_id: Field,
    version: Field,
}

struct PrivateCircuitPublicInputsBuilder {
    call_context : CallContext,
    
    args_hash : Field,
    return_values : BoundedVec<Field, RETURN_VALUES_LENGTH>,

    read_requests : BoundedVec<Field, MAX_READ_REQUESTS_PER_CALL>,
    pending_read_requests : BoundedVec<Field, MAX_PENDING_READ_REQUESTS_PER_CALL>,

    new_commitments : BoundedVec<Field, MAX_NEW_COMMITMENTS_PER_CALL>,
    new_nullifiers : BoundedVec<Field, MAX_NEW_NULLIFIERS_PER_CALL>,
    nullified_commitments : BoundedVec<Field, MAX_NEW_NULLIFIERS_PER_CALL>,

    private_call_stack : BoundedVec<Field, MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL>,
    public_call_stack : BoundedVec<Field, MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL>,
    new_l2_to_l1_msgs : BoundedVec<Field, MAX_NEW_L2_TO_L1_MSGS_PER_CALL>,

    encrypted_logs_hash : [Field; NUM_FIELDS_PER_SHA256],
    unencrypted_logs_hash : [Field; NUM_FIELDS_PER_SHA256],

    encrypted_log_preimages_length : Field,
    unencrypted_log_preimages_length : Field,

    historical_block_data : HistoricalBlockData,

    contract_deployment_data : ContractDeploymentData,

    chain_id : Field,
    version : Field,
}

impl PrivateCircuitPublicInputsBuilder {
    pub fn new(inputs: PrivateAppInputs) -> Self {
        Self {
            call_context: inputs.call_context,

            args_hash : inputs.args_hash,
            return_values : BoundedVec::new(0),

            read_requests : BoundedVec::new(0),
            pending_read_requests : BoundedVec::new(0),

            new_commitments : BoundedVec::new(0),
            new_nullifiers : BoundedVec::new(0),
            nullified_commitments : BoundedVec::new(0),

            private_call_stack : BoundedVec::new(0),
            public_call_stack : BoundedVec::new(0),
            new_l2_to_l1_msgs : BoundedVec::new(0),

            encrypted_logs_hash : [0; NUM_FIELDS_PER_SHA256],
            unencrypted_logs_hash : [0; NUM_FIELDS_PER_SHA256],

            encrypted_log_preimages_length : 0,
            unencrypted_log_preimages_length : 0,

            historical_block_data : inputs.historical_block_data,

            contract_deployment_data : inputs.contract_deployment_data,

            chain_id : inputs.chain_id,
            version : inputs.version,
        }
    }

    pub fn finish(self) ->  PrivateCircuitPublicInputs {
        PrivateCircuitPublicInputs {
            call_context : self.call_context,
            args_hash : self.args_hash,
            return_values : self.return_values.storage,

            read_requests : self.read_requests.storage,
            pending_read_requests : self.pending_read_requests.storage,

            new_commitments : self.new_commitments.storage,
            new_nullifiers : self.new_nullifiers.storage,
            nullified_commitments : self.nullified_commitments.storage,

            private_call_stack : self.private_call_stack.storage,
            public_call_stack : self.public_call_stack.storage,
            new_l2_to_l1_msgs : self.new_l2_to_l1_msgs.storage,

            encrypted_logs_hash : self.encrypted_logs_hash,
            unencrypted_logs_hash : self.unencrypted_logs_hash,

            encrypted_log_preimages_length : self.encrypted_log_preimages_length,
            unencrypted_log_preimages_length : self.unencrypted_log_preimages_length,

            historical_block_data : self.historical_block_data,

            contract_deployment_data : self.contract_deployment_data,

            chain_id : self.chain_id,
            version : self.version,
        }
    }
}

fn build_contract_deployment_data(is_constructor: bool) -> ContractDeploymentData {
    let mut contract_deployment_data = ContractDeploymentData {
        deployer_public_key: Point::ZERO(),
        constructor_vk_hash: 0,
        function_tree_root: 0,
        contract_address_salt: 0,
        portal_contract_address: EthAddress::ZERO(),
    };
    if is_constructor {
        let contract_data = fixtures::contracts::default_contract;
        let constructor = fixtures::contract_functions::default_constructor;

        contract_deployment_data = ContractDeploymentData {
            deployer_public_key: fixtures::DEPLOYER_PUBLIC_KEY,
            constructor_vk_hash: constructor.vk_hash,
            function_tree_root: contract_data.function_tree_root,
            contract_address_salt: contract_data.contract_address_salt,
            portal_contract_address: contract_data.portal_contract_address,
        };
    }
    contract_deployment_data
}

fn build_tx_context(is_constructor: bool) -> TxContext {
    let contract_deployment_data = build_contract_deployment_data(is_constructor);
     TxContext {
        is_fee_payment_tx: false,
        is_rebate_payment_tx: false,
        is_contract_deployment_tx: is_constructor,
        contract_deployment_data,
        chain_id: 1,
        version: 0,
    }
}

pub fn build_tx_request(
    is_constructor: bool, 
    private_call_data: PrivateCallData,
) -> TxRequest {
    let tx_context = build_tx_context(is_constructor);
    TxRequest {
        origin: private_call_data.call_stack_item.inner.contract_address,
        args_hash: private_call_data.call_stack_item.inner.public_inputs.args_hash,
        tx_context,
        function_data: private_call_data.call_stack_item.function_data(),
    }
}

pub fn create_private_call_data(is_constructor: bool) -> PrivateCallData {
    let args_hash = hash_args([]);

    let contract_data = fixtures::contracts::default_contract;
    let portal_contract_address = contract_data.portal_contract_address;

    let contract_function = if is_constructor {
        fixtures::contract_functions::default_constructor
    } else {
        fixtures::contract_functions::default_contract_function
    };
    let function_data = contract_function.data;

    let contract_deployment_data = build_contract_deployment_data(is_constructor);

    let contract_address = if is_constructor {
        let constructor = fixtures::contract_functions::default_constructor;
        let constructor_hash = compute_constructor_hash(constructor.data, args_hash, constructor.vk_hash);
        CompleteAddress::compute(
            contract_deployment_data.deployer_public_key,
            contract_deployment_data.contract_address_salt,
            contract_deployment_data.function_tree_root,
            constructor_hash,
        ).address
    } else {
        contract_data.address
    };

    let call_context = CallContext {
        msg_sender: fixtures::MSG_SENDER,
        storage_contract_address: contract_address,
        portal_contract_address,
        function_selector: function_data.selector,
        is_delegate_call: false,
        is_static_call: false,
        is_contract_deployment: is_constructor,
    };

    let app_inputs = PrivateAppInputs {
        call_context, 
        historical_block_data: fixtures::HISTORICAL_BLOCK_DATA,
        contract_deployment_data,
        args_hash,
        chain_id: 0,
        version: 1,
    };

    let public_inputs = PrivateCircuitPublicInputsBuilder::new(app_inputs).finish();

    let call_stack_item = PrivateCallStackItem {
        inner: CallStackItem {
            contract_address,
            public_inputs,
            is_execution_request: false,
            function_data,
        }
    };

    PrivateCallData {
        call_stack_item,
        private_call_stack_preimages: dep::std::unsafe::zeroed(),
        proof: Proof {},
        vk: VerificationKey {},
        function_leaf_membership_witness: contract_function.membership_witness,
        contract_leaf_membership_witness: contract_data.membership_witness,
        read_request_membership_witnesses: dep::std::unsafe::zeroed(),
        portal_contract_address,
        acir_hash: contract_function.acir_hash,
    }
}

pub fn create_previous_kernel_data(is_constructor: bool) -> PreviousKernelData {
    let mut previous_kernel: PreviousKernelData = dep::std::unsafe::zeroed();

    let tx_context = build_tx_context(is_constructor);

    previous_kernel.public_inputs.constants = CombinedConstantData {
        block_data: fixtures::HISTORICAL_BLOCK_DATA,
        tx_context,
    };

    previous_kernel.public_inputs.is_private = true;

    previous_kernel.public_inputs.end.new_nullifiers[0] = 321; // 0th nullifier must be non-zero.
    previous_kernel.public_inputs.end.nullified_commitments[0] = EMPTY_NULLIFIED_COMMITMENT;

    previous_kernel.public_inputs.end.private_call_stack[0] = 1;

    previous_kernel
}
