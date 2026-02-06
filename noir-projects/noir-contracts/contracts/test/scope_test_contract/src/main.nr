use dep::aztec::macros::aztec;

/// A simple contract for testing scope isolation on TXE.
/// Uses PrivateImmutable to store a single note per owner. Only owners should be
/// able to initialize their own notes, since their nsk are needed to do so
#[aztec]
pub contract ScopeTest {
    use aztec::{
        macros::{functions::{external, initializer, view}, storage::storage},
        messages::message_delivery::MessageDelivery,
        protocol::address::AztecAddress,
        state_vars::{Owned, PrivateImmutable},
    };

    use field_note::FieldNote;

    #[storage]
    struct Storage<CONTEXT> {
        note: Owned<PrivateImmutable<FieldNote, CONTEXT>, CONTEXT>,
    }

    #[initializer]
    #[external("private")]
    fn constructor() {}

    /// Creates a note with the given value for the specified owner.
    /// The note is delivered to the owner so they can discover it.
    #[external("private")]
    fn create_note(owner: AztecAddress, value: Field) {
        let note = FieldNote { value };
        self.storage.note.at(owner).initialize(note).deliver(MessageDelivery.ONCHAIN_CONSTRAINED);
    }

    /// Reads the note owned by the specified owner and returns its value.
    /// We are not making this a `view` function on purpose, so that we can test scoping a non-static call
    #[external("private")]
    fn read_note(owner: AztecAddress) -> Field {
        let note = self.storage.note.at(owner).get_note();
        note.value
    }

    /// Reads the note owned by the specified owner (view function).
    #[external("private")]
    #[view]
    fn view_note(owner: AztecAddress) -> Field {
        let note = self.storage.note.at(owner).get_note();
        note.value
    }

    mod test {
        use crate::ScopeTest;
        use aztec::{
            protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment,
        };

        unconstrained fn setup() -> (TestEnvironment, AztecAddress) {
            let mut env = TestEnvironment::new();
            let deployer = env.create_light_account();

            // Deploy the contract
            let contract_address = env.deploy("ScopeTest").with_private_initializer(
                deployer,
                ScopeTest::interface().constructor(),
            );

            (env, contract_address)
        }

        /// Test that the owner can read their own notes
        #[test]
        unconstrained fn owner_can_read_own_notes() {
            let (mut env, contract_address) = setup();

            let alice = env.create_light_account();
            let value: Field = 42;

            // Alice creates a note for herself (delivered encrypted to her)
            env.call_private(alice, ScopeTest::at(contract_address).create_note(alice, value));

            // Alice can read her own note
            let read_value =
                env.call_private(alice, ScopeTest::at(contract_address).read_note(alice));
            assert_eq(read_value, value);
        }

        /// Bob cannot create a note for Alice because scope isolation is enforced.
        /// When Bob calls create_note(alice, value), the function needs Alice's nsk_app to
        /// compute the note's nullifier key, but Bob is not authorized to access Alice's keys.
        #[test(should_fail_with = "Key validation request denied")]
        unconstrained fn bob_cannot_create_note_for_alice() {
            let (mut env, contract_address) = setup();

            let alice = env.create_light_account();
            let bob = env.create_light_account();
            let value: Field = 42;

            // Bob tries to create a note for Alice, but this fails because
            // Bob doesn't have access to Alice's keys (scope isolation).
            env.call_private(bob, ScopeTest::at(contract_address).create_note(alice, value));
        }

        /// Bob cannot read Alice's notes because scope isolation is enforced.
        /// When Bob calls read_note(alice), he can only access notes where he is in scope.
        /// Alice's notes are not visible to Bob's execution context.
        #[test(should_fail_with = "Failed to get a note")]
        unconstrained fn bob_cannot_read_alice_notes() {
            let (mut env, contract_address) = setup();

            let alice = env.create_light_account();
            let bob = env.create_light_account();
            let value: Field = 42;

            env.call_private(alice, ScopeTest::at(contract_address).create_note(alice, value));

            let _read_value =
                env.call_private(bob, ScopeTest::at(contract_address).read_note(alice));
        }

        /// Owner can view their own notes using view_private
        #[test]
        unconstrained fn owner_can_view_own_notes() {
            let (mut env, contract_address) = setup();

            let alice = env.create_light_account();
            let value: Field = 42;

            env.call_private(alice, ScopeTest::at(contract_address).create_note(alice, value));

            let read_value =
                env.view_private(alice, ScopeTest::at(contract_address).view_note(alice));
            assert_eq(read_value, value);
        }

        /// Bob cannot view Alice's notes using view_private because scope isolation is enforced.
        #[test(should_fail_with = "Failed to get a note")]
        unconstrained fn bob_cannot_view_alice_notes() {
            let (mut env, contract_address) = setup();

            let alice = env.create_light_account();
            let bob = env.create_light_account();
            let value: Field = 42;

            env.call_private(alice, ScopeTest::at(contract_address).create_note(alice, value));

            let _read_value =
                env.view_private(bob, ScopeTest::at(contract_address).view_note(alice));
        }
    }
}
