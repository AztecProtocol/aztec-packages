// Derives the private inputs of a minimal real-kernel Chonk flow: one app call folded by
// `private_kernel_init`, terminated by `private_kernel_reset_tail` and wrapped by
// `hiding_kernel_to_rollup`. Everything the kernels check by re-hashing (contract address, function
// tree membership, VK tree membership, public data tree non-membership) is derived here, so the flow
// needs no captured fixtures. The derivation runs unconstrained: this program only generates
// witnesses for other circuits and nothing in it is proven.
use private_kernel_lib::{PaddedSideEffects, PrivateKernelResetHints};
use protocol_test_utils::{
    FixtureBuilder,
    fixtures::{
        contract_functions::ContractFunction, contracts::ContractData, vk_tree::VK_TREE_WIDTH,
    },
};
use types::{
    abis::{
        contract_class_function_leaf_preimage::ContractClassFunctionLeafPreimage,
        function_data::FunctionData, function_selector::FunctionSelector, gas::Gas,
        private_circuit_public_inputs::PrivateCircuitPublicInputs,
        private_kernel::private_call_data::PrivateCallDataWithoutPublicInputs,
        private_kernel_data::PrivateKernelDataWithoutPublicInputs,
        protocol_contracts::ProtocolContracts, transaction::tx_request::TxRequest,
    },
    address::{AztecAddress, PartialAddress, SaltedInitializationHash},
    constants::{
        FUNCTION_TREE_HEIGHT, MAX_KEY_VALIDATION_REQUESTS_PER_TX,
        MAX_NOTE_HASH_READ_REQUESTS_PER_TX, MAX_NOTE_HASHES_PER_TX,
        MAX_NULLIFIER_READ_REQUESTS_PER_TX, MAX_NULLIFIERS_PER_TX, MEGA_APP_VK_LENGTH_IN_FIELDS,
        MEGA_KERNEL_VK_LENGTH_IN_FIELDS, PRIVATE_KERNEL_INIT_VK_INDEX,
        PRIVATE_KERNEL_RESET_TAIL_VK_INDEX,
    },
    contract_class_id::ContractClassId,
    hash::poseidon2_hash,
    merkle_tree::{MembershipWitness, merkle_tree::MerkleTree},
    proof::{verification_key::VerificationKey, vk_data::VkData},
    public_keys::PublicKeys,
    traits::{Empty, Hash},
};

global FUNCTION_TREE_WIDTH: u32 = (1 as u8 << FUNCTION_TREE_HEIGHT as u8) as u32;

// Preimage data of the app's contract. The values are arbitrary; the kernels only need them to be
// consistent with the address they derive.
global FUNCTION_SELECTOR: u32 = 0x1c5c9e8f;
global ARTIFACT_HASH: Field = 0x1111;
global PUBLIC_BYTECODE_COMMITMENT: Field = 0x2222;
global CONTRACT_ADDRESS_SALT: Field = 0x3333;
global INITIALIZATION_HASH: Field = 0x4444;
global IMMUTABLES_HASH: Field = 0;

// The inputs of `private_kernel_init`, minus `app_public_inputs`, which the driver takes from the
// app's return data.
pub struct InitInputs {
    pub tx_request: TxRequest,
    pub vk_tree_root: Field,
    pub protocol_contracts: ProtocolContracts,
    pub private_call: PrivateCallDataWithoutPublicInputs,
    pub is_private_only: bool,
    pub revertible_counter_hint: u32,
}

// The reset hints of the full-size `private_kernel_reset_tail` variant compiled by
// noir-protocol-circuits: every hint array is as long as the array it indexes.
type ResetHints = PrivateKernelResetHints<MAX_NOTE_HASH_READ_REQUESTS_PER_TX, MAX_NOTE_HASH_READ_REQUESTS_PER_TX, MAX_NULLIFIER_READ_REQUESTS_PER_TX, MAX_NULLIFIER_READ_REQUESTS_PER_TX, MAX_KEY_VALIDATION_REQUESTS_PER_TX, MAX_NULLIFIERS_PER_TX>;

// The inputs of `private_kernel_reset_tail`, minus `previous_kernel_public_inputs`.
pub struct ResetTailInputs {
    pub previous_kernel: PrivateKernelDataWithoutPublicInputs,
    pub padded_side_effects: PaddedSideEffects,
    pub hints: ResetHints,
    pub expiration_timestamp_upper_bound: u64,
}

// The inputs of `hiding_kernel_to_rollup`, minus `previous_kernel_public_inputs`.
pub struct HidingInputs {
    pub previous_kernel_vk_data: VkData<MEGA_KERNEL_VK_LENGTH_IN_FIELDS>,
}

pub struct FlowInputs {
    pub app_public_inputs: PrivateCircuitPublicInputs,
    pub init: InitInputs,
    pub reset_tail: ResetTailInputs,
    pub hiding: HidingInputs,
}

fn main(
    app_vk: [Field; MEGA_APP_VK_LENGTH_IN_FIELDS],
    init_vk: [Field; MEGA_KERNEL_VK_LENGTH_IN_FIELDS],
    reset_tail_vk: [Field; MEGA_KERNEL_VK_LENGTH_IN_FIELDS],
) -> pub FlowInputs {
    // Safety: this program only derives witnesses for other circuits; nothing in it is constrained.
    unsafe {
        build(app_vk, init_vk, reset_tail_vk)
    }
}

unconstrained fn build(
    app_vk: [Field; MEGA_APP_VK_LENGTH_IN_FIELDS],
    init_vk: [Field; MEGA_KERNEL_VK_LENGTH_IN_FIELDS],
    reset_tail_vk: [Field; MEGA_KERNEL_VK_LENGTH_IN_FIELDS],
) -> FlowInputs {
    // bb hashes a Mega VK as poseidon2 over its field representation.
    let app_vk_hash = poseidon2_hash(app_vk);
    let init_vk_hash = poseidon2_hash(init_vk);
    let reset_tail_vk_hash = poseidon2_hash(reset_tail_vk);

    // A VK tree holding the real kernel VKs at their protocol indices. The root is a free input of
    // the init kernel; the later kernels only check membership against it.
    let mut vk_leaves = [0; VK_TREE_WIDTH];
    vk_leaves[PRIVATE_KERNEL_INIT_VK_INDEX] = init_vk_hash;
    vk_leaves[PRIVATE_KERNEL_RESET_TAIL_VK_INDEX] = reset_tail_vk_hash;
    let vk_tree = MerkleTree::new(vk_leaves);
    let vk_tree_root = vk_tree.get_root();

    // The app function is leaf 0 of an otherwise empty private function tree, from which the class
    // id and the contract address follow the way the kernel re-derives them.
    let selector = FunctionSelector::from_u32(FUNCTION_SELECTOR);
    let mut function_leaves = [0; FUNCTION_TREE_WIDTH];
    function_leaves[0] =
        ContractClassFunctionLeafPreimage { selector, vk_hash: app_vk_hash }.hash();
    let function_tree = MerkleTree::new(function_leaves);
    let private_functions_root = function_tree.get_root();
    let contract_class_id = ContractClassId::compute(
        ARTIFACT_HASH,
        private_functions_root,
        PUBLIC_BYTECODE_COMMITMENT,
    );
    let deployer = AztecAddress::zero();
    let salted_initialization_hash = SaltedInitializationHash::compute(
        CONTRACT_ADDRESS_SALT,
        INITIALIZATION_HASH,
        deployer,
        IMMUTABLES_HASH,
    );
    let partial_address = PartialAddress::compute_from_salted_initialization_hash(
        contract_class_id,
        salted_initialization_hash,
    );
    let public_keys = PublicKeys::default();
    let app_contract = ContractData {
        address: AztecAddress::compute(public_keys, partial_address),
        artifact_hash: ARTIFACT_HASH,
        contract_address_salt: CONTRACT_ADDRESS_SALT,
        contract_class_id,
        private_functions_root,
        public_bytecode_commitment: PUBLIC_BYTECODE_COMMITMENT,
        public_keys,
        salted_initialization_hash,
        partial_address,
        deployer,
    };
    let app_function = ContractFunction {
        data: FunctionData { selector, is_private: true },
        vk_hash: app_vk_hash,
        membership_witness: MembershipWitness {
            leaf_index: 0,
            sibling_path: function_tree.get_sibling_path(0),
        },
    };

    let mut app = FixtureBuilder::new().is_first_call();
    // The tail meters the tx's gas against these limits; the fixture's defaults are zero.
    app.tx_context.gas_settings.gas_limits = Gas::new(1_000_000_000, 1_000_000_000);
    let _ = app.use_contract(app_contract);
    let _ = app.use_function(app_function, app_vk);
    // The tail kernel requires a fee payer, and a private-only tx has nobody else to name.
    app.is_fee_payer = true;
    app.vk_tree_root = vk_tree_root;
    // Proves no class update is scheduled for this address in an (otherwise empty) public data tree.
    app.compute_update_tree_and_hints();

    let app_public_inputs = app.to_private_circuit_public_inputs();

    let init = InitInputs {
        tx_request: app.to_tx_request(),
        vk_tree_root,
        protocol_contracts: app.protocol_contracts,
        private_call: PrivateCallDataWithoutPublicInputs {
            vk: app.vk,
            verification_key_hints: app.to_private_verification_key_hints(),
        },
        is_private_only: true,
        revertible_counter_hint: app.min_revertible_side_effect_counter,
    };

    let reset_tail = ResetTailInputs {
        previous_kernel: PrivateKernelDataWithoutPublicInputs {
            vk_data: VkData {
                vk: VerificationKey { key: init_vk, hash: init_vk_hash },
                leaf_index: PRIVATE_KERNEL_INIT_VK_INDEX,
                sibling_path: vk_tree.get_sibling_path(PRIVATE_KERNEL_INIT_VK_INDEX),
            },
        },
        padded_side_effects: PaddedSideEffects::empty(),
        hints: reset_hints_for_nothing_to_reset(),
        expiration_timestamp_upper_bound: app.expiration_timestamp,
    };

    let hiding = HidingInputs {
        previous_kernel_vk_data: VkData {
            vk: VerificationKey { key: reset_tail_vk, hash: reset_tail_vk_hash },
            leaf_index: PRIVATE_KERNEL_RESET_TAIL_VK_INDEX,
            sibling_path: vk_tree.get_sibling_path(PRIVATE_KERNEL_RESET_TAIL_VK_INDEX),
        },
    };

    FlowInputs { app_public_inputs, init, reset_tail, hiding }
}

// Reset hints for a tx with nothing to reset. The hint types are private to private_kernel_lib and
// the struct has no constructor, so start from zeroes (every read request action is SKIP) and set
// the inactive sentinels the reset validators look for: a read hint whose `read_request_index` is
// the read request array length, and a squashing hint whose indices are the note hash and
// nullifier array lengths.
unconstrained fn reset_hints_for_nothing_to_reset() -> ResetHints {
    let mut hints: ResetHints = std::mem::zeroed();
    for i in 0..MAX_NOTE_HASH_READ_REQUESTS_PER_TX {
        hints.note_hash_read_request_hints.pending_read_hints[i].read_request_index =
            MAX_NOTE_HASH_READ_REQUESTS_PER_TX;
        hints.note_hash_read_request_hints.settled_read_hints[i].read_request_index =
            MAX_NOTE_HASH_READ_REQUESTS_PER_TX;
    }
    for i in 0..MAX_NULLIFIER_READ_REQUESTS_PER_TX {
        hints.nullifier_read_request_hints.pending_read_hints[i].read_request_index =
            MAX_NULLIFIER_READ_REQUESTS_PER_TX;
        hints.nullifier_read_request_hints.settled_read_hints[i].read_request_index =
            MAX_NULLIFIER_READ_REQUESTS_PER_TX;
    }
    for i in 0..MAX_NULLIFIERS_PER_TX {
        hints.transient_data_squashing_hints[i].note_hash_index = MAX_NOTE_HASHES_PER_TX;
        hints.transient_data_squashing_hints[i].nullifier_index = MAX_NULLIFIERS_PER_TX;
    }
    hints
}
