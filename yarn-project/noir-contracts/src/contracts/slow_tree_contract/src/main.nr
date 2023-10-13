// Custom oracles for:
// - Getting CURRENT PUBLIC storage while in private
// - Getting merkle path for a given index

// TODO:
// - Should be able to prove correct update in private and then validate the update in public.
// - Should let external contracts use this tree almost as their own storage.
// - Must change the `update_at` in the underlying `slow_map` 
//    - Should have multiple splits:
//       - Compute the "expected current root" (private)
//       - Compute the "expected new root" (private)
//       - Validate the "expected current root" (public)
//       - Update the leaf value (public)
//       - Update the root (public)


// This is made as a separate contract for one thing mainly. Making it a bit easier to use.
// This allows us to wrap the private->public calls in one single call for the dev.

contract SlowTree {
    use dep::std::option::Option;
    use dep::std::merkle::compute_merkle_root;
    use dep::value_note::{
        balance_utils,
        utils::{increment, decrement},
        value_note::{VALUE_NOTE_LEN, ValueNote, ValueNoteMethods},
    };
    use dep::aztec::{
        context::{PrivateContext, PublicContext, Context},
        note::{
            note_header::NoteHeader,
            utils as note_utils,
        },
        selector::compute_selector,
        state_vars::{map::Map, public_state::PublicState, set::Set},
        types::type_serialization::field_serialization::{
            FieldSerializationMethods, FIELD_SERIALIZED_LEN,
        },
    };
    use dep::slow_updates_tree::slow_map::{
        SlowMap, Leaf, SlowUpdateProof
    };

    global TREE_HEIGHT: Field = 254;
    global MEMBERSHIP_SIZE: Field = 256; // TREE_HEIGTH + 2
    global UPDATE_SIZE: Field = 512; // TREE_HEIGHT * 2 + 4

    struct Storage {
        trees: Map<SlowMap<TREE_HEIGHT, UPDATE_SIZE>>,
    }

    // A single inclusion proof.
    // M = N + 2
    struct MembershipProof<N, M> {
        index: Field,
        value: Field,
        sibling_path: [Field; N],

    }

    impl<N, M> MembershipProof<N, M> {
        pub fn serialize(self: Self) -> pub [Field; M] {
        let mut serialized = [0; M];
        serialized[0] = self.index;
        serialized[1] = self.value;
        for i in 0..N {
            serialized[2 + i] = self.sibling_path[i];
        }
        serialized
        }

        pub fn deserialize(serialized: [Field; M]) -> pub Self {
        let mut sibling_path = [0; N];
        for i in 0..N {
            sibling_path[i] = serialized[2 + i];
        }
        MembershipProof {
            index: serialized[0],
            value: serialized[1],
            sibling_path,
        }
        }
    }

    impl Storage {
        fn init(context: Context) -> pub Self {
            Storage {
                trees: Map::new(
                    context,
                    1,
                    |context, slot| {
                        SlowMap::new(
                            context,
                            slot,
                        )
                    }
                ),
            }
        }
    }

    #[aztec(private)]
    fn constructor() {}

    #[aztec(public)]
    fn initialize(root: Field) {
        storage.trees.at(context.msg_sender()).initialize(root);
    }

    #[aztec(public)]
    fn read_at_pub(key: Field) -> Field {
        storage.trees.at(context.msg_sender()).read_at(key)
    }

    #[aztec(public)]
    fn read_leaf_at_pub(key: Field) -> Leaf {
        storage.trees.at(context.msg_sender()).read_leaf_at(key)
    }

    #[aztec(private)]
    fn read_at(p: MembershipProof<TREE_HEIGHT, MEMBERSHIP_SIZE>) -> Field {
        // Ergonomics are pretty bad. But we eat shit for now.
        let expected_root = compute_merkle_root(p.value, p.index, p.sibling_path);
        let selector = compute_selector("_assert_current_root(Field,Field)");
        context.call_public_function(
            context.this_address(), 
            selector, 
            [context.msg_sender(), expected_root]
        );

        p.value
    }

    #[aztec(public)]
    internal fn _assert_current_root(caller: Field, expected: Field) {
        let root = storage.trees.at(caller).current_root();
        assert(root == expected, "Root does not match expected");
    }

    #[aztec(public)]
    fn update_at(p: SlowUpdateProof<TREE_HEIGHT, UPDATE_SIZE>) {
        storage.trees.at(context.msg_sender()).update_at(p);
    }

    #[aztec(private)]
    fn update_at_private(p: SlowUpdateProof<TREE_HEIGHT, UPDATE_SIZE>) {
        // We compute the root before.
        let before_root = compute_merkle_root(p.before.value, p.index, p.before.sibling_path);
        let after_root = compute_merkle_root(p.after.value, p.index, p.after.sibling_path);
        let new_after_root = compute_merkle_root(p.new_value, p.index, p.after.sibling_path);

        let selector = compute_selector("_hmm(Field,Field,Field,Field,Field,Field)");
        context.call_public_function(
            context.this_address(), 
            selector, 
            [
                context.msg_sender(), 
                p.index, 
                p.new_value, 
                before_root, 
                after_root, 
                new_after_root
            ]
        );
    }

    #[aztec(public)]
    internal fn _hmm(
        caller: Field, 
        index: Field, 
        new_value: Field, 
        before: Field, 
        after: Field, 
        new_root: Field
    ) {
        let current_root = storage.trees.at(caller).current_root();
        let after_root = storage.trees.at(caller).read_root().after;

        assert(current_root == before, "Before root does not match expected");
        assert(after_root == after, "After root does not match expected");

        storage.trees.at(caller).update_unsafe_at(
            index,
            new_value,
            new_root,
        );
    }

    unconstrained fn un_read_leaf_at(address: Field, key: Field) -> Leaf {
        storage.trees.at(address).read_leaf_at(key)
    }

    unconstrained fn un_read_root(address: Field) -> Leaf {
        storage.trees.at(address).read_root()
    }
}
