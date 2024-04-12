// A contract used along with `Parent` contract to test nested calls.
contract Delegator {
    use dep::aztec::prelude::{
        AztecAddress, FunctionSelector, NoteHeader, NoteViewerOptions, emit_unencrypted_log,
        PublicMutable, PrivateSet, Deserialize
    };
    use dep::value_note::value_note::ValueNote;
    use dep::delegated_on::DelegatedOn;

    #[aztec(storage)]
    struct Storage {
        current_value: PublicMutable<Field>,
        a_private_value: PrivateSet<ValueNote>,
    }

    #[aztec(private)]
    fn private_delegate_set_value(
        target_contract: AztecAddress,
        value: Field,
        owner: AztecAddress
    ) -> Field {
        // Call the target private function
        IDelegatedOn::at(target_contract).private_set_value(value, owner).delegate_call(&mut context)
    }

    #[aztec(private)]
    fn enqueued_delegate_set_value(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 1]
    ) {
        context.delegate_call_public_function(target_contract, target_selector, args);
    }

    #[aztec(public)]
    fn public_delegate_set_value(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 1]
    ) {
        let _result: Field = context.delegate_call_public_function(target_contract, target_selector, args).deserialize_into();
    }

    unconstrained fn view_private_value(amount: Field, owner: AztecAddress) -> pub Field {
        let mut options = NoteViewerOptions::new();
        options = options.select(ValueNote::properties().value, amount, Option::none()).select(
            ValueNote::properties().owner,
            owner.to_field(),
            Option::none()
        ).set_limit(1);
        let notes = storage.a_private_value.view_notes(options);
        notes[0].unwrap_unchecked().value
    }

    unconstrained fn view_public_value() -> pub Field {
        storage.current_value.read()
    }

    struct IDelegatedOn {
            target_contract: dep::aztec::protocol_types::address::AztecAddress
        }

    impl IDelegatedOn {
        pub fn private_set_value(
            self,
            new_value: Field,
            owner: AztecAddress
        ) -> dep::aztec::context::PrivateCallInterface<Field> {
            let mut args_acc: [Field] = [0; 0].as_slice();
            args_acc = args_acc.append(new_value.serialize().as_slice());
            args_acc = args_acc.append(owner.serialize().as_slice());

            let args_hash = dep::aztec::hash::hash_args(args_acc);
            assert(args_hash == dep::aztec::oracle::arguments::pack_arguments(args_acc));
            dep::aztec::context::PrivateCallInterface {
                target_contract: self.target_contract,
                selector: dep::aztec::protocol_types::abis::function_selector::FunctionSelector::from_signature("private_set_value(Field,(Field))"),
                args_hash
            }
        }
        pub fn public_set_value(
            self,
            new_value: Field
        ) -> dep::aztec::context::PublicCallInterface<Field> {
            let mut args_acc: [Field] = [0; 0].as_slice();
            args_acc = args_acc.append(new_value.serialize().as_slice());

            let args_hash = dep::aztec::hash::hash_args(args_acc);
            assert(args_hash == dep::aztec::oracle::arguments::pack_arguments(args_acc));
            dep::aztec::context::PublicCallInterface {
                target_contract: self.target_contract,
                selector: dep::aztec::protocol_types::abis::function_selector::FunctionSelector::from_signature("SELECTOR_PLACEHOLDER"),
                args_hash
            }
        }

        pub fn at(target_contract: dep::aztec::protocol_types::address::AztecAddress) -> Self {
            Self { target_contract }
        }
    }
}
