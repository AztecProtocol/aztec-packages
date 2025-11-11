mod options;
mod types;

use aztec::macros::aztec;

/// This is a contract with no real functionality. It is only used in documentation to showcase concepts of Aztec.nr.
#[aztec]
pub contract DocsExample {
    // how to import dependencies defined in your workspace
    use aztec::{
        context::PrivateContext,
        macros::{functions::external, storage::{storage, storage_no_init}},
        messages::message_delivery::MessageDelivery,
        note::{note_interface::NoteProperties, note_viewer_options::NoteViewerOptions},
        protocol_types::address::AztecAddress,
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

    #[external("public")]
    fn initialize_public_immutable(points: u8) {
        let mut new_leader = Leader { account: self.msg_sender().unwrap(), points };
        self.storage.public_immutable.initialize(new_leader);
    }

    #[external("utility")]
    unconstrained fn get_public_immutable() -> Leader {
        self.storage.public_immutable.read()
    }

    #[external("private")]
    fn initialize_private_immutable(points: u8) {
        let new_card = CardNote::new(points, self.msg_sender().unwrap());

        self.storage.private_immutable.initialize(new_card).emit(
            self.msg_sender().unwrap(),
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    #[external("utility")]
    unconstrained fn read_note(comparator: u8, amount: Field) -> BoundedVec<CardNote, 10> {
        let mut options = NoteViewerOptions::new();
        self.storage.set.view_notes(options.select(
            CardNote::properties().points,
            comparator,
            amount,
        ))
    }

    #[external("private")]
    fn read_legendary_points() {
        self.storage.legendary_card.get_note()
    }

    #[external("private")]
    fn increase_legendary_points() {
        self
            .storage
            .legendary_card
            .replace(|old_card| {
                let points = old_card.get_points() + 1;
                CardNote::new(points, self.msg_sender().unwrap())
            })
            .emit(self.msg_sender().unwrap(), MessageDelivery.CONSTRAINED_ONCHAIN);
    }

    #[external("utility")]
    unconstrained fn is_legendary_initialized() -> bool {
        self.storage.legendary_card.is_initialized()
    }

    #[external("private")]
    fn get_imm_card() -> CardNote {
        self.storage.private_immutable.get_note()
    }

    /// Macro equivalence section
    use dep::aztec::protocol_types::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs;
    use dep::aztec::context::inputs::PrivateContextInputs;
    // docs:start:simple_macro_example
    #[external("private")]
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
        // Oracle version compatibility check
        dep::aztec::oracle::version::assert_compatible_oracle_version();

        // Create ContractSelf instance with storage initialization
        // docs:start:contract_self_creation
        let mut self = {
            let serialized_args = [a, b];
            let args_hash = dep::aztec::hash::hash_args_array(serialized_args);
            let mut context = PrivateContext::new(inputs, args_hash);
            let storage = Storage::init(&mut context);
            // The call_self, enqueue_self, call_self_static and enqueue_self_static are structs generated by the
            // #[aztec] macro. It's impractical to show define them in this example, so we just use unit types here.
            let call_self = ();
            let enqueue_self = ();
            let call_self_static = ();
            let enqueue_self_static = ();
            let internal = ();
            aztec::contract_self::ContractSelf::new_private(
                &mut context,
                storage,
                call_self,
                enqueue_self,
                call_self_static,
                enqueue_self_static,
                internal,
            )
        };
        // docs:end:contract_self_creation

        // ************************************************************
        // Our actual program
        let result = a + b;
        // ************************************************************
        // Return values are serialized and passed to the context
        // docs:start:context-example-context-return
        let macro__returned__values: Field = result;
        let serialized_return = [macro__returned__values];
        self.context.set_return_hash(serialized_return);
        // docs:end:context-example-context-return
        // The context is returned to be consumed by the kernel circuit!
        // docs:start:context-example-finish
        self.context.finish()
        // docs:end:context-example-finish
        // ************************************************************
    }
    // docs:end:simple_macro_example_expanded
}
