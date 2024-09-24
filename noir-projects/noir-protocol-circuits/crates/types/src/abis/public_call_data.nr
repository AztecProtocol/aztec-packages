use crate::abis::public_call_stack_item::PublicCallStackItem;

// Mocked here as the only remaining non-recursive proof
struct Proof {}

// TODO(#7124): To be deprecated.
struct PublicCallData {
    call_stack_item: PublicCallStackItem,
    proof: Proof,
    bytecode_hash: Field,
}
