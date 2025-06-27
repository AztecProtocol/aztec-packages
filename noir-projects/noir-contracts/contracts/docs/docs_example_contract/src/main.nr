mod options;
mod types;

use aztec::macros::aztec;

/// This is a contract with no real functionality. It is only used in documentation to showcase concepts of Aztec.nr.
#[aztec]
pub contract DocsExample {
    // how to import dependencies defined in your workspace
    use aztec::{
        context::PrivateContext,
        macros::{functions::{private, public, utility}, storage::{storage, storage_no_init}},
        messages::logs::note::encode_and_encrypt_note,
        note::{note_interface::NoteProperties, note_viewer_options::NoteViewerOptions},
        protocol_types::{address::AztecAddress, traits::Hash},
        state_vars::{
            Map, PrivateImmutable, PrivateMutable, PrivateSet, PublicImmutable, PublicMutable,
        },
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

    // docs:start:read_public_immutable
    #[utility]
    unconstrained fn get_public_immutable() -> Leader {
        storage.public_immutable.read()
        // docs:end:read_public_immutable
    }

    // docs:start:initialize-private-mutable
    #[private]
    fn initialize_private_immutable(randomness: Field, points: u8) {
        let new_card = CardNote::new(points, randomness, context.msg_sender());

        storage.private_immutable.initialize(new_card).emit(encode_and_encrypt_note(
            &mut context,
            context.msg_sender(),
            context.msg_sender(),
        ));
    }
    // docs:end:initialize-private-mutable

    // docs:start:state_vars-NoteGetterOptionsComparatorExampleNoir
    #[utility]
    unconstrained fn read_note(comparator: u8, amount: Field) -> BoundedVec<CardNote, 10> {
        let mut options = NoteViewerOptions::new();
        storage.set.view_notes(options.select(CardNote::properties().points, comparator, amount))
    }
    // docs:end:state_vars-NoteGetterOptionsComparatorExampleNoir

    #[private]
    fn increase_legendary_points() {
        // Ensure `points` > current value
        // Also serves as a e2e test that you can `get_note()` and then `replace()`
        // docs:start:state_vars-PrivateMutableGet
        let card = storage.legendary_card.get_note().note;
        // docs:end:state_vars-PrivateMutableGet
        let points = card.points + 1;
        let new_card = CardNote::new(points, card.randomness, context.msg_sender());

        // docs:start:state_vars-PrivateMutableReplace
        storage.legendary_card.replace(new_card).emit(encode_and_encrypt_note(
            &mut context,
            context.msg_sender(),
            context.msg_sender(),
        ));
        // docs:end:state_vars-PrivateMutableReplace
    }

    // docs:start:private_mutable_is_initialized
    #[utility]
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

    /// Macro equivalence section
    use dep::aztec::protocol_types::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs;
    use dep::aztec::context::inputs::PrivateContextInputs;
    // docs:start:simple_macro_example
    #[private]
    fn simple_macro_example(a: Field, b: Field) -> Field {
        a + b
    }
    // docs:end:simple_macro_example

    // We mark the following function as a contract library method because it is mandatory that a contract function has
    // a macro applied to it. Since this function is not used and is only for documentation purposes, we mark it as a
    // contract library method to avoid compilation error.
    #[contract_library_method]
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
    ) -> PrivateCircuitPublicInputs {
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
