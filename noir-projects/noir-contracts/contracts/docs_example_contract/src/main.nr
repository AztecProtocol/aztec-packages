mod options;
mod types;

// Following is a very simple game to show case use of PrivateMutable in as minimalistic way as possible
// It also serves as an e2e test that you can read and then replace the PrivateMutable in the same call
// (tests ordering in the circuit)

// you have a card (PrivateMutable). Anyone can create a bigger card. Whoever is bigger will be the leader.
// it also has dummy methods and other examples used for documentation e.g.
// how to create custom notes, a custom struct for public state, a custom note that may be unencrypted
// also has `options.nr` which shows various ways of using `NoteGetterOptions` to query notes
// it also shows what our macros do behind the scenes!

use dep::aztec::macros::aztec;

#[aztec]
contract DocsExample {
    // how to import dependencies defined in your workspace
    use dep::aztec::{
        encrypted_logs::encrypted_note_emission::encode_and_encrypt_note,
        keys::getters::get_public_keys,
        macros::{functions::{internal, private, public, view}, storage::{storage, storage_no_init}},
    };
    use dep::aztec::prelude::{
        AztecAddress, Map, NoteViewerOptions, PrivateContext, PrivateImmutable, PrivateMutable,
        PrivateSet, PublicImmutable, PublicMutable,
    };

    // how to import methods from other files/folders within your workspace
    use crate::types::{card_note::CardNote, leader::Leader};

    #[storage_no_init]
    struct Storage<Context> {
        // Shows how to create a custom struct in PublicMutable
        // docs:start:storage-leader-declaration
        leader: PublicMutable<Leader, Context>,
        // docs:end:storage-leader-declaration
        // docs:start:storage-private-mutable-declaration
        legendary_card: PrivateMutable<CardNote, Context>,
        // docs:end:storage-private-mutable-declaration
        // just used for docs example to show how to create a private mutable map.
        profiles: Map<AztecAddress, PrivateMutable<CardNote, Context>, Context>,
        // docs:start:storage-set-declaration
        set: PrivateSet<CardNote, Context>,
        // docs:end:storage-set-declaration
        // docs:start:storage-private-immutable-declaration
        private_immutable: PrivateImmutable<CardNote, Context>,
        // docs:end:storage-private-immutable-declaration
        // docs:start:storage-public-immutable-declaration
        public_immutable: PublicImmutable<Leader, Context>,
        // docs:end:storage-public-immutable-declaration
        // docs:start:storage-minters-declaration
        minters: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
        // docs:end:storage-minters-declaration
    }

    // Note: The following is no longer necessary to implement manually as our macros do this for us. It is left here
    // for documentation purposes only.
    impl<Context> Storage<Context> {
        fn init(context: Context) -> Self {
            Storage {
                // docs:start:storage-leader-init
                leader: PublicMutable::new(context, 1),
                // docs:end:storage-leader-init
                // docs:start:start_vars_private_mutable
                legendary_card: PrivateMutable::new(context, 3),
                // docs:end:start_vars_private_mutable
                // just used for docs example (not for game play):
                // docs:start:state_vars-MapPrivateMutable
                profiles: Map::new(
                    context,
                    4,
                    |context, slot| PrivateMutable::new(context, slot),
                ),
                // docs:end:state_vars-MapPrivateMutable
                // docs:start:storage-set-init
                set: PrivateSet::new(context, 5),
                // docs:end:storage-set-init
                private_immutable: PrivateImmutable::new(context, 6),
                public_immutable: PublicImmutable::new(context, 7),
                // docs:start:storage-minters-init
                minters: Map::new(
                    context,
                    8,
                    |context, slot| PublicMutable::new(context, slot),
                ),
                // docs:end:storage-minters-init
            }
        }
    }

    // docs:start:initialize_public_immutable
    #[public]
    fn initialize_public_immutable(points: u8) {
        let mut new_leader = Leader { account: context.msg_sender(), points };
        storage.public_immutable.initialize(new_leader);
        // docs:end:initialize_public_immutable
    }

    #[private]
    fn match_public_immutable(account: AztecAddress, points: u8) {
        let expected = Leader { account, points };
        let read = storage.public_immutable.read();

        assert(read.account == expected.account, "Invalid account");
        assert(read.points == expected.points, "Invalid points");
    }

    #[private]
    fn get_public_immutable_constrained_private_indirect() -> Leader {
        // This is a private function that calls another private function
        // and returns the response.
        // Used to test that we can retrieve values through calls and
        // correctly return them in the simulation
        let mut leader = DocsExample::at(context.this_address())
            .get_public_immutable_constrained_private()
            .view(&mut context);
        leader.points += 1;
        leader
    }

    #[public]
    fn get_public_immutable_constrained_public_indirect() -> Leader {
        // This is a public function that calls another public function
        // and returns the response.
        // Used to test that we can retrieve values through calls and
        // correctly return them in the simulation
        let mut leader = DocsExample::at(context.this_address())
            .get_public_immutable_constrained_public()
            .view(&mut context);
        leader.points += 1;
        leader
    }

    #[public]
    #[view]
    fn get_public_immutable_constrained_public() -> Leader {
        storage.public_immutable.read()
    }

    #[public]
    fn get_public_immutable_constrained_public_multiple() -> [Leader; 5] {
        let a = storage.public_immutable.read();
        [a, a, a, a, a]
    }

    #[private]
    #[view]
    fn get_public_immutable_constrained_private() -> Leader {
        storage.public_immutable.read()
    }

    // docs:start:read_public_immutable
    unconstrained fn get_public_immutable() -> Leader {
        storage.public_immutable.read()
        // docs:end:read_public_immutable
    }

    // docs:start:initialize-private-mutable
    #[private]
    fn initialize_private_immutable(randomness: Field, points: u8) {
        let mut new_card = CardNote::new(points, randomness, context.msg_sender());

        let msg_sender_ovpk_m = get_public_keys(context.msg_sender()).ovpk_m;
        storage.private_immutable.initialize(&mut new_card).emit(encode_and_encrypt_note(
            &mut context,
            msg_sender_ovpk_m,
            context.msg_sender(),
            context.msg_sender(),
        ));
    }
    // docs:end:initialize-private-mutable

    #[private]
    // msg_sender() is 0 at deploy time. So created another function
    fn initialize_private(randomness: Field, points: u8) {
        let mut legendary_card = CardNote::new(points, randomness, context.msg_sender());

        let msg_sender_ovpk_m = get_public_keys(context.msg_sender()).ovpk_m;
        // create and broadcast note
        storage.legendary_card.initialize(&mut legendary_card).emit(encode_and_encrypt_note(
            &mut context,
            msg_sender_ovpk_m,
            context.msg_sender(),
            context.msg_sender(),
        ));
    }

    #[private]
    fn insert_notes(amounts: [u8; 3]) {
        let msg_sender_ovpk_m = get_public_keys(context.msg_sender()).ovpk_m;

        for i in 0..amounts.len() {
            let mut note = CardNote::new(amounts[i], 1, context.msg_sender());
            storage.set.insert(&mut note).emit(encode_and_encrypt_note(
                &mut context,
                msg_sender_ovpk_m,
                context.msg_sender(),
                context.msg_sender(),
            ));
        }
    }
    #[private]
    fn insert_note(amount: u8, randomness: Field) {
        let mut note = CardNote::new(amount, randomness, context.msg_sender());

        let msg_sender_ovpk_m = get_public_keys(context.msg_sender()).ovpk_m;
        storage.set.insert(&mut note).emit(encode_and_encrypt_note(
            &mut context,
            msg_sender_ovpk_m,
            context.msg_sender(),
            context.msg_sender(),
        ));
    }
    // docs:start:state_vars-NoteGetterOptionsComparatorExampleNoir
    unconstrained fn read_note(comparator: u8, amount: Field) -> BoundedVec<CardNote, 10> {
        let mut options = NoteViewerOptions::new();
        storage.set.view_notes(options.select(CardNote::properties().points, comparator, amount))
    }
    // docs:end:state_vars-NoteGetterOptionsComparatorExampleNoir
    #[private]
    fn update_legendary_card(randomness: Field, points: u8) {
        let mut new_card = CardNote::new(points, randomness, context.msg_sender());

        let msg_sender_ovpk_m = get_public_keys(context.msg_sender()).ovpk_m;
        storage.legendary_card.replace(&mut new_card).emit(encode_and_encrypt_note(
            &mut context,
            msg_sender_ovpk_m,
            context.msg_sender(),
            context.msg_sender(),
        ));
        DocsExample::at(context.this_address()).update_leader(context.msg_sender(), points).enqueue(
            &mut context,
        );
    }
    #[private]
    fn increase_legendary_points() {
        // Ensure `points` > current value
        // Also serves as a e2e test that you can `get_note()` and then `replace()`
        // docs:start:state_vars-PrivateMutableGet
        let card = storage.legendary_card.get_note().note;
        // docs:end:state_vars-PrivateMutableGet
        let points = card.points + 1;
        let mut new_card = CardNote::new(points, card.randomness, context.msg_sender());

        let msg_sender_ovpk_m = get_public_keys(context.msg_sender()).ovpk_m;
        // docs:start:state_vars-PrivateMutableReplace
        storage.legendary_card.replace(&mut new_card).emit(encode_and_encrypt_note(
            &mut context,
            msg_sender_ovpk_m,
            context.msg_sender(),
            context.msg_sender(),
        ));
        // docs:end:state_vars-PrivateMutableReplace
        DocsExample::at(context.this_address()).update_leader(context.msg_sender(), points).enqueue(
            &mut context,
        );
    }
    #[private]
    #[view]
    fn verify_private_authwit(inner_hash: Field) -> Field {
        1
    }
    #[public]
    fn spend_public_authwit(inner_hash: Field) -> Field {
        1
    }
    #[public]
    #[internal]
    fn update_leader(account: AztecAddress, points: u8) {
        let new_leader = Leader { account, points };
        storage.leader.write(new_leader);
    }
    unconstrained fn get_leader() -> Leader {
        storage.leader.read()
    }
    unconstrained fn get_legendary_card() -> CardNote {
        storage.legendary_card.view_note()
    }
    // docs:start:private_mutable_is_initialized
    unconstrained fn is_legendary_initialized() -> bool {
        storage.legendary_card.is_initialized()
    }
    // docs:end:private_mutable_is_initialized
    // docs:start:get_note-private-immutable
    #[private]
    fn get_imm_card() -> CardNote {
        storage.private_immutable.get_note()
    }
    // docs:end:get_note-private-immutable
    unconstrained fn view_imm_card() -> CardNote {
        storage.private_immutable.view_note()
    }
    unconstrained fn is_priv_imm_initialized() -> bool {
        storage.private_immutable.is_initialized()
    }
    /// Macro equivalence section
    use dep::aztec::protocol_types::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs;
    use dep::aztec::context::inputs::PrivateContextInputs;
    // docs:start:simple_macro_example
    #[private]
    fn simple_macro_example(a: Field, b: Field) -> Field {
        a + b
    }
    // docs:end:simple_macro_example
    // docs:start:simple_macro_example_expanded
    fn simple_macro_example_expanded(
        // ************************************************************
        // The private context inputs are made available to the circuit by the kernel
        // docs:start:context-example-inputs
        inputs: PrivateContextInputs,
        // docs:end:context-example-inputs
        // ************************************************************
        // Our original inputs!
        a: Field,
        b: Field, // The actual return type of our circuit is the PrivateCircuitPublicInputs struct, this will be the
        // input to our kernel!
        // docs:start:context-example-return
    ) -> pub PrivateCircuitPublicInputs {
        // docs:end:context-example-return
        // ************************************************************
        // The hasher is a structure used to generate a hash of the circuits inputs.
        // docs:start:context-example-hasher
        let mut args_hasher = dep::aztec::hash::ArgsHasher::new();
        args_hasher.add(a);
        args_hasher.add(b);
        // docs:end:context-example-hasher
        // The context object is created with the inputs and the hash of the inputs
        // docs:start:context-example-context
        let mut context = PrivateContext::new(inputs, args_hasher.hash());
        // docs:end:context-example-context
        // docs:start:storage-example-context
        let mut storage = Storage::init(&mut context);
        // docs:end:storage-example-context
        // ************************************************************
        // Our actual program
        let result = a + b;
        // ************************************************************
        // Return values are pushed into the context
        // docs:start:context-example-context-return
        let mut return_hasher = dep::aztec::hash::ArgsHasher::new();
        return_hasher.add(result);
        context.set_return_hash(return_hasher);
        // docs:end:context-example-context-return
        // The context is returned to be consumed by the kernel circuit!
        // docs:start:context-example-finish
        context.finish()
        // docs:end:context-example-finish
        // ************************************************************
    }
    // docs:end:simple_macro_example_expanded
}
