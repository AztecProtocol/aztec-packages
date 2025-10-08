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
        messages::message_delivery::MessageDelivery,
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
        leader: PublicMutable<Leader, Context>,
        legendary_card: PrivateMutable<CardNote, Context>,
        // just used for docs example to show how to create a private mutable map.
        profiles: Map<AztecAddress, PrivateMutable<CardNote, Context>, Context>,
        set: PrivateSet<CardNote, Context>,
        private_immutable: PrivateImmutable<CardNote, Context>,
        public_immutable: PublicImmutable<Leader, Context>,
        minters: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
    }

    // Note: The following is no longer necessary to implement manually as our macros do this for us. It is left here
    // for documentation purposes only.
    impl<Context> Storage<Context> {
        fn init(context: Context) -> Self {
            Storage {
                leader: PublicMutable::new(context, 1),
                legendary_card: PrivateMutable::new(context, 3),
                // just used for docs example (not for game play):
                profiles: Map::new(
                    context,
                    4,
                    |context, slot| PrivateMutable::new(context, slot),
                ),
                set: PrivateSet::new(context, 5),
                private_immutable: PrivateImmutable::new(context, 6),
                public_immutable: PublicImmutable::new(context, 7),
                minters: Map::new(
                    context,
                    8,
                    |context, slot| PublicMutable::new(context, slot),
                ),
            }
        }
    }

    #[public]
    fn initialize_public_immutable(points: u8) {
        let mut new_leader = Leader { account: context.msg_sender(), points };
        storage.public_immutable.initialize(new_leader);
    }

    #[utility]
    unconstrained fn get_public_immutable() -> Leader {
        storage.public_immutable.read()
    }

    #[private]
    fn initialize_private_immutable(points: u8) {
        let new_card = CardNote::new(points, context.msg_sender());

        storage.private_immutable.initialize(new_card).emit(
            &mut context,
            context.msg_sender(),
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    #[utility]
    unconstrained fn read_note(comparator: u8, amount: Field) -> BoundedVec<CardNote, 10> {
        let mut options = NoteViewerOptions::new();
        storage.set.view_notes(options.select(CardNote::properties().points, comparator, amount))
    }

    #[private]
    fn read_legendary_points() {
        storage.legendary_card.get_note()
    }

    #[private]
    fn increase_legendary_points() {
        storage
            .legendary_card
            .replace(|old_card| {
                let points = old_card.get_points() + 1;
                CardNote::new(points, context.msg_sender())
            })
            .emit(&mut context, context.msg_sender(), MessageDelivery.CONSTRAINED_ONCHAIN);
    }

    #[utility]
    unconstrained fn is_legendary_initialized() -> bool {
        storage.legendary_card.is_initialized()
    }

    #[private]
    fn get_imm_card() -> CardNote {
        storage.private_immutable.get_note()
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

    // We mark the following function as a contract library method because it is mandatory that a contract function has
    // a macro applied to it. Since this function is not used and is only for documentation purposes, we mark it as a
    // contract library method to avoid compilation error.
    #[contract_library_method]
    // docs:start:simple_macro_example_expanded
    pub fn simple_macro_example_expanded(
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
        #[allow(unused_variables)]
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
