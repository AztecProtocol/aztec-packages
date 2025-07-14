use crate::Test;
use crate::test_note::TestNote;
use dep::aztec::{
    protocol_types::address::AztecAddress, test::helpers::test_environment::TestEnvironment,
};
use address_note::address_note::AddressNote;
use aztec::history::contract_inclusion::{
    ProveContractDeployment, ProveContractInitialization, ProveContractNonDeployment,
    ProveContractNonInitialization,
};
use aztec::note::note_interface::NoteType;
use value_note::value_note::ValueNote;

#[test]
unconstrained fn test_note_type_id() {
    // The order in which the note types are sorted seems arbitrary and an implementation detail of Noir,
    // but the important thing is that they are sequential and start from 0.
    assert_eq(AddressNote::get_id(), 0, "AddressNote type id should be 0");
    assert_eq(ValueNote::get_id(), 1, "ValueNote type id should be 1");
    assert_eq(TestNote::get_id(), 2, "TestNote type id should be 2");
}

#[test]
unconstrained fn test_storage_slot_allocation() {
    // This tests that sufficient storage slots are assigned to each state variable so that they do not interfere with
    // one another. State variable that use private state should always occupy just one slot (since it's just an
    // identifier), and variables that use public storage typically have it determined by some function of the
    // packed length of the value they hold. This is specified through the `Storage` trait.
    //
    // This is the storage declaration:
    //
    // #[storage]
    // struct Storage<Context> {
    //   note_in_private_immutable: PrivateImmutable<TestNote, Context>,
    //   struct_in_private_immutable: PrivateImmutable<ExampleStruct, Context>,
    //   note_in_private_mutable: PrivateMutable<TestNote, Context>,
    //   struct_in_private_mutable: PrivateMutable<ExampleStruct, Context>,
    //   note_in_private_set: PrivateSet<AddressNote, Context>,
    //   struct_in_private_set: PrivateSet<ExampleStruct, Context>,
    //   note_in_public_immutable: PublicImmutable<TestNote, Context>,
    //   struct_in_public_immutable: PublicImmutable<ExampleStruct, Context>,
    //   struct_in_map: Map<AztecAddress, PrivateImmutable<ExampleStruct, Context>, Context>,
    //   struct_in_shared_mutable: SharedMutable<ExampleStruct, SHARED_MUTABLE_INITIAL_DELAY, Context>,
    //   dummy_variable: PrivateImmutable<TestNote, Context>,
    // }

    // We can't directly see how many slots are allocated to each variable, but we can look at the slot increments for
    // each and deduct the allocation size based off of that. In other words, given a struct with two members a and b,
    // the number of slots allocated to a will be b.storage_slot - a.storage_slot.

    // The first slot is always 1.
    let mut expected_slot = 1;

    assert_eq(Test::storage_layout().note_in_private_immutable.slot, expected_slot);
    // PrivateImmutable uses private storage, and so always uses a single slot, regardless of the packed length of
    // whatever it stores, and regardless of whether it has the #[note] attribute.
    expected_slot += 1;

    assert_eq(Test::storage_layout().struct_in_private_immutable.slot, expected_slot);
    // PrivateImmutable uses private storage, and so always uses a single slot, regardless of the packed length of
    // whatever it stores, and regardless of whether it has the #[note] attribute.
    expected_slot += 1;

    assert_eq(Test::storage_layout().note_in_private_mutable.slot, expected_slot);
    // PrivateMutable uses private storage, and so always uses a single slot, regardless of the packed length of
    // whatever it stores, and regardless of whether it has the #[note] attribute.
    expected_slot += 1;

    assert_eq(Test::storage_layout().struct_in_private_mutable.slot, expected_slot);
    // PrivateMutable uses private storage, and so always uses a single slot, regardless of the packed length of
    // whatever it stores, and regardless of whether it has the #[note] attribute.
    expected_slot += 1;

    assert_eq(Test::storage_layout().note_in_private_set.slot, expected_slot);
    // PrivateSet uses private storage, and so always uses a single slot, regardless of the packed length of whatever it
    // stores, and regardless of whether it has the #[note] attribute.
    expected_slot += 1;

    assert_eq(Test::storage_layout().struct_in_private_set.slot, expected_slot);
    // PrivateSet uses private storage, and so always uses a single slot, regardless of the packed length of whatever it
    // stores, and regardless of whether it has the #[note] attribute.
    expected_slot += 1;

    assert_eq(Test::storage_layout().note_in_public_immutable.slot, expected_slot);
    // note_in_public_immutable should allocate two slots because TestNote packs to a single slot: it needs an extra
    // slot for the hash.
    expected_slot += 2;

    assert_eq(Test::storage_layout().struct_in_public_immutable.slot, expected_slot);
    // struct_in_public_immutable should allocate 6 slots because ExampleStruct packs into 5 slots: it needs an extra
    // slot for the hash.
    expected_slot += 6;

    assert_eq(Test::storage_layout().struct_in_map.slot, expected_slot);
    // Maps always allocate a single slot.
    expected_slot += 1;

    assert_eq(Test::storage_layout().struct_in_shared_mutable.slot, expected_slot);
    // struct_in_shared_mutable should allocate 12 slots because ExampleStruct occupies 5 slots. SharedMutable stores
    // the value two times (10 slots), and it also stores the time values (one slot) and the hash (another slot).
    expected_slot += 12;

    // dummy_variable exists so that we can test how many slots the last variable was allocated.
    assert_eq(Test::storage_layout().dummy_variable.slot, expected_slot);
}

global CONTRACT_DEPLOYED_AT: u32 = 3;

global CONTRACT_INITIALIZED_AT: u32 = CONTRACT_DEPLOYED_AT;

pub unconstrained fn setup() -> (&mut TestEnvironment, AztecAddress, AztecAddress) {
    // Setup env, generate keys
    let mut env = TestEnvironment::new();
    let owner = env.create_account(1);
    env.impersonate(owner);

    // TODO(#12276): This is here because we are testing historical proofs, and we cannot get a valid block_header at 1 due to a bug in world state.
    env.mine_block();

    // We sanity check that we are building block 3, thus block 3 is where the contract will be deployed.
    assert_eq(env.next_block_number(), CONTRACT_DEPLOYED_AT);

    // Deploy contract and initialize
    let initializer = Test::interface().initialize();
    let test_contract = env.deploy_self("Test").with_private_initializer(owner, initializer);
    let contract_address = test_contract.to_address();

    (&mut env, contract_address, owner)
}

// These tests need to be here instead of a saner place like aztec-nr/aztec/src/history/contract_inclusion/test.nr
// because we are unable to define nor deploy a contract from that location and currently do not have plans to change that.

// In these tests we deploy a contract and can prove whether it has been deployed / initialized at specific blocks.
#[test]
unconstrained fn contract_historical_proofs_happy_path() {
    let (env, contract_address, _owner) = setup();

    let context_at_block_before_deployment = env.private_at(CONTRACT_DEPLOYED_AT - 1);
    let context_at_block_of_deployment = env.private_at(CONTRACT_DEPLOYED_AT);

    let context_at_block_before_initialization = env.private_at(CONTRACT_INITIALIZED_AT - 1);
    let context_at_block_of_initialization = env.private_at(CONTRACT_INITIALIZED_AT);

    // We prove that the contract had not been deployed nor initialized at the block before deployment
    context_at_block_before_deployment.historical_header.prove_contract_non_deployment(
        contract_address,
    );
    context_at_block_before_initialization.historical_header.prove_contract_non_initialization(
        contract_address,
    );

    // And we prove that the contract has been been deployed and initialized at the block after deployment
    context_at_block_of_deployment.historical_header.prove_contract_deployment(contract_address);
    context_at_block_of_initialization.historical_header.prove_contract_initialization(
        contract_address,
    );
}

// In this test, we fail to prove contract deployment at the block before it was deployed. This checks for inclusion
// of the deployment nullifier in state.
#[test(should_fail_with = "Nullifier membership witness not found at block 2.")]
unconstrained fn proving_contract_deployment_fails() {
    let (env, contract_address, _owner) = setup();

    let context = env.private_at(CONTRACT_DEPLOYED_AT - 1);

    context.historical_header.prove_contract_deployment(contract_address);
}

// In this test, we fail to prove contract initialization at the block before it was deployed. This checks for inclusion
// of the initialization nullifier in state.
#[test(should_fail_with = "Nullifier membership witness not found at block 2.")]
unconstrained fn proving_contract_initialization_fails() {
    let (env, contract_address, _owner) = setup();

    let context = env.private_at(CONTRACT_INITIALIZED_AT - 1);

    context.historical_header.prove_contract_initialization(contract_address);
}

// In this test, we fail to prove contract non-deployment at the block of its deployment.
#[test(should_fail_with = "Proving nullifier non-inclusion failed")]
unconstrained fn proving_contract_non_deployment_fails() {
    let (env, contract_address, _owner) = setup();

    let context = env.private_at(CONTRACT_DEPLOYED_AT);

    context.historical_header.prove_contract_non_deployment(contract_address);
}

// In this test, we fail to prove contract non-initialization at the block of its deployment.
#[test(should_fail_with = "Proving nullifier non-inclusion failed")]
unconstrained fn proving_contract_non_initialization_fails() {
    let (env, contract_address, _owner) = setup();

    let context = env.private_at(CONTRACT_INITIALIZED_AT);

    context.historical_header.prove_contract_non_initialization(contract_address);
}
