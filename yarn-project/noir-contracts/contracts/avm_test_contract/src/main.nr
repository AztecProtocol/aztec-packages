//

contract AvmTest {
    // Libs
    use dep::aztec::protocol_types::{
        address::AztecAddress,
    };

    // avm lib
    use dep::aztec::avm::context::AvmContext;

    #[aztec(private)]
    fn constructor() {}

    // Public-vm macro will prefix avm to the function name for transpilation
    #[aztec(public-vm)]
    fn addArgsReturn(argA: Field, argB: Field) -> pub Field {
        argA + argB
    }

    #[aztec(public-vm)]
    fn accessEnv() -> pub Field {
        AvmContext::address()
    }

    // Function required for all contracts
    unconstrained fn compute_note_hash_and_nullifier(
        _contract_address: AztecAddress,
        _nonce: Field,
        _storage_slot: Field,
        _serialized_note: [Field; 1]
    ) -> pub [Field; 4] {
        [0, 0, 0, 0]
    }
}
