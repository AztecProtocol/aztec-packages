mod zk_token_contract_interface;

contract ImportTest {
    use dep::aztec::abi;
    use dep::aztec::abi::PrivateContextInputs;
    use dep::aztec::context::Context;
    use crate::zk_token_contract_interface::ZkToken_ContractInterface;

    // fn constructor(
    //     inputs: PrivateContextInputs,
    // ) -> distinct pub abi::PrivateCircuitPublicInputs {
    // }

    fn main(
        inputs: PrivateContextInputs,
        amount: Field, 
        sender: Field, 
        recipient: Field,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let mut context = Context::new(inputs, abi::hash_args([amount, sender, recipient]));

        let zk_token_contract_address = 1234;
        let zk_token_contract_instance = ZkToken_ContractInterface::at(zk_token_contract_address);
        let _return_values = zk_token_contract_instance.transfer(&mut context, amount, sender, recipient);

        context.finish()
    }
}

