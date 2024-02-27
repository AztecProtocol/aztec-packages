contract AvmToken {
    // Libs
    use dep::aztec::protocol_types::address::{AztecAddress, EthAddress};
    use dep::std::option::Option;
    // use dep::compressed_string::FieldCompressedString;

    use dep::aztec::{
        note::{note_getter_options::NoteGetterOptions, note_header::NoteHeader, utils as note_utils},
        hash::{compute_secret_hash}, state_vars::{map::Map, PublicMutable},
        protocol_types::{abis::function_selector::FunctionSelector}
    };

    struct Storage {
        total_supply: PublicMutable<Field>,
        owner: PublicMutable<AztecAddress>,
        balances: Map<AztecAddress, PublicMutable<U128>>
    }

    #[aztec(private)]
    fn constructor(owner: AztecAddress) {
        // let selector = FunctionSelector::from_signature("_initialize((Field))");
        // context.call_public_function(context.this_address(), selector, [owner.to_field()]);
    }

    // #[aztec(public-vm)]
    // internal fn _initialize(new_owner: AztecAddress) {
    //     assert(!new_owner.is_zero(), "invalid admin");
    //     storage.owner.write(new_owner);
    // }

    // #[aztec(public-vm)]
    // fn setOwner() {
    //     assert(context.sender() == storage.owner.read(), "only owner can set admin");
    //     storage.owner.write(context.sender());
    // }

    #[aztec(public-vm)]
    fn transfer(to: AztecAddress, amount: Field) {
        // Co pilot version - lets see how this goes!
        let sender = context.sender();
        let amount = U128::from_integer(amount);
        let sender_balance = storage.balances.at(sender).read();
        let receiver_balance = storage.balances.at(to).read();

        // require(sender_balance >= amount, "Insufficient balance");

        storage.balances.at(sender).write(sender_balance - amount);
        storage.balances.at(to).write(receiver_balance + amount);
    }
}
