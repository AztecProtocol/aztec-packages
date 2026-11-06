use aztec::{
    protocol::{address::AztecAddress, storage::map::derive_storage_slot_in_map},
    test::helpers::test_environment::TestEnvironment,
};
use pod_racing_contract::{PodRacing, race::Race};

// docs:start:test-setup
/// Deploys a fresh PodRacing contract and returns the environment, its address and the admin.
pub unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let admin = env.create_light_account();

    let initializer = PodRacing::interface().constructor(admin);
    let contract_address =
        env.deploy("@pod_racing_contract/PodRacing").with_public_initializer(admin, initializer);

    (env, contract_address, admin)
}
// docs:end:test-setup

// docs:start:read-race
/// Reads a game's public `Race` struct by field name, so a new field does not break the tests.
pub unconstrained fn read_race(env: TestEnvironment, contract_address: AztecAddress, game_id: Field) -> Race {
    env.public_context_at(contract_address, |context| {
        context.storage_read(derive_storage_slot_in_map(PodRacing::storage_layout().races.slot, game_id))
    })
}
// docs:end:read-race

pub unconstrained fn wins(env: TestEnvironment, contract_address: AztecAddress, player: AztecAddress) -> u64 {
    env.public_context_at(contract_address, |context| {
        context.storage_read(derive_storage_slot_in_map(PodRacing::storage_layout().win_history.slot, player))
    })
}
