use dep::aztec::macros::aztec;

#[aztec]
pub contract SampleContract {

    use aztec::{
        macros::{functions::{external, initializer, only_self}, storage::storage},
        messages::message_delivery::MessageDelivery,
        protocol_types::address::AztecAddress,
        state_vars::{Map, Owned, PublicMutable, PublicImmutable, PrivateMutable, PrivateImmutable, SinglePrivateMutable, SinglePrivateImmutable, SingleUseClaim, DelayedPublicMutable, PrivateSet},
    };

    use balance_set::BalanceSet;

    #[storage]
    struct Storage<Context> {
        // Example public mutable variable
        pub_mut: PublicMutable<u64, Context>,
        // Example private mutable variable
        priv_mut: Owned<PrivateMutable<u64, Context>>,
        // Example public immutable variable
        pub_imm: PublicImmutable<u64, Context>,
        // Example private immutable variable
        priv_imm: Owned<PrivateImmutable<u64, Context>>,
        // Example single private mutable variable
        single_priv_mut: SinglePrivateMutable<u64, Context>,
        // Example single public mutable variable
        single_priv_imm: SinglePrivateImmutable<u64, Context>,
        // Example single use claim variable
        single_use_claim: SingleUseClaim<bool, Context>,
        // Example delayed public mutable variable
        delayed_pub: DelayedPublicMutable<u64, Context>,
        // Example private set
        priv_set: PrivateSet<u64, Context>,
        // Example map
        map: Map<AztecAddress, PublicMutable<u64, Context>, Context>,
    }

    #[initializer]
    #[external("public")]
    fn setup() {
        // Initialization logic here
    }

    fn pub_mutable_example(value: u64) {
        self.storage.pub_mut.read();
        self.storage.pub_mut.write(value);
    }

    fn priv_mutable_example(value: u64, new_value: u64, address: AztecAddress) {
        // only callable in utility context
        self.storage.priv_mut.is_initialized();
        self.storage.priv_mut.view_note();

        // only callable once per PrivateMutable instance
        self.storage.priv_mut.initialize(value);
        // only callable after initialization
        self.storage.priv_mut.replace(new_value);
        // initialize if it hasn't yet been initialized or replace if it has
        self.storage.priv_mut.initialize_or_replace(new_value);
        // read the value from storage (this also consumes the note and replaces it with another note of the same value)
        self.storage.priv_mut.at(address).get_note();
    }

    fn pub_immutable_example(value: u64) -> u64 {
        self.storage.pub_imm.initialize(value);
        self.storage.pub_imm.read()
        self.storage.pub_imm.read_unsafe();
    }

    fn priv_immutable_example(value: u64) -> u64 {
        // only callable in utility context
        self.storage.priv_imm.is_initialized();
        self.view_note();

        self.storage.priv_imm.initialize(value);
        self.storage.priv_imm.get_note();
    }

    fn single_priv_mutable_example(value: u64, new_value: u64) {
        // only in utility
        self.storage.single_priv_mut.is_initialized();
        self.storage.single_priv_mut.view_note();

        self.storage.single_priv_mut.initialize(value);
        self.storage.single_priv_mut.replace(new_value);
        self.storage.single_priv_mut.initialize_or_replace(new_value);
        self.storage.single_priv_mut.get_note();
    }

    fn single_priv_immutable_example(value: u64) -> u64 {
        // only in utility
        self.storage.single_priv_imm.is_initialized();
        self.storage.single_priv_imm.view_note();

        self.storage.single_priv_imm.initialize(value);
        let note_message = self.storage.single_priv_imm.get_note();
    }
}
