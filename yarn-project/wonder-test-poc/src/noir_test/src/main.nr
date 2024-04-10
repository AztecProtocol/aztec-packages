contract OracleResolver {
use dep::aztec::oracle::debug_log::{ debug_log, debug_log_field };


    use dep::std::test::OracleMock;

    use dep::aztec::{
        oracle::context::get_portal_address,
        protocol_types::{
            abis::function_selector::FunctionSelector,
            address::AztecAddress,
            constants::RETURN_VALUES_LENGTH}
    };

    #[aztec(private)]
    fn constructor() {}

    #[test]
    fn test_deploy() {
        let deployment_address = deploy();

        assert(deployment_address != AztecAddress::zero());
    } 

    #[test]
    fn test_view_unconstrained() {
        let deployment_address = deploy();

        let function_selector = FunctionSelector::from_signature("get_meaning_of_life()");

        // add oracle call for the public/private call
        let result = view(deployment_address, function_selector, [0,0,0,0]);

        // assert result
        assert_eq(result, 42);
    }   
    
    #[test]
    fn test_internal_call() {
        let deployment_address = deploy();
        let tx_hash = call_private_function(deployment_address, FunctionSelector::from_signature("set_value(Field)"), 1337);

        let number_of_new_notes = get_number_of_new_notes(tx_hash);
        assert_eq(number_of_new_notes, 1);
    }

    #[test]
    fn test_public_call() {
        let deployment_address = deploy();
        let tx_hash = call_public_function(deployment_address, FunctionSelector::from_signature("public_function_to_call(Field)"), 1337);

        let value_stored = view(deployment_address, FunctionSelector::from_signature("get_public_value()"), [0,0,0,0]);
        assert_eq(value_stored, 1337);
    }

    #[oracle(deployContract)]
    unconstrained fn deploy_oracle() -> pub AztecAddress {}

    unconstrained fn deploy() -> pub AztecAddress {
        deploy_oracle()
    }

    // for now, 4 args -> same as callstack limit?
    #[oracle(view)]
    unconstrained fn view_oracle(contract_address: AztecAddress, method_name: FunctionSelector, args: [Field; 4]) -> pub Field {}

    unconstrained fn view(contract_address: AztecAddress, method_name: FunctionSelector, args: [Field; 4]) -> pub Field {
        view_oracle(contract_address, method_name, args)
    }

    #[oracle(callPrivateFunction)]
    unconstrained fn call_private_function_oracle(contract_address: AztecAddress, method_name: FunctionSelector, args: Field) -> pub Field{}

    unconstrained fn call_private_function(contract_address: AztecAddress, method_name: FunctionSelector, args: Field) -> pub Field {
        call_private_function_oracle(contract_address, method_name, args)
    }

    #[oracle(callPublicFunction)]
    unconstrained fn call_public_function_oracle(contract_address: AztecAddress, method_name: FunctionSelector, args: Field) -> pub Field{}

    unconstrained fn call_public_function(contract_address: AztecAddress, method_name: FunctionSelector, args: Field) -> pub Field {
        call_public_function_oracle(contract_address, method_name, args)
    }

    #[oracle(getNumberOfNewNotes)]
    unconstrained fn get_number_of_new_notes_oracle(tx_hash: Field) -> pub Field{}

    unconstrained fn get_number_of_new_notes(tx_hash: Field) -> pub Field {
        get_number_of_new_notes_oracle(tx_hash)
    }
}