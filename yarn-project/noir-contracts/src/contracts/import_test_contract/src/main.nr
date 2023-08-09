mod test_contract_interface;

contract ImportTest {
    use dep::aztec::abi;
    use dep::aztec::abi::PrivateContextInputs;
    use dep::aztec::context::Context;
    
    use crate::test_contract_interface::{
        TestContractInterface,
        AStructTestCodeGenStruct,
        ADeepStructTestCodeGenStruct,
        ANoteADeepStructTestCodeGenStruct,
        ManyNotesADeepStructTestCodeGenStruct,
    };

    fn constructor(
        inputs: PrivateContextInputs,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        Context::new(inputs, 0).finish()
    }   
 
    fn main(
        inputs: PrivateContextInputs,
        target: Field
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let mut context = Context::new(inputs, abi::hash_args([target]));
        let test_contract_instance = TestContractInterface::at(target);
        let return_values = test_contract_instance.testCodeGen(
            &mut context,
            1,
            true,
            1 as u32,
            [1, 2],
            AStructTestCodeGenStruct { amount: 1, secretHash: 2 },
            ADeepStructTestCodeGenStruct {
                aField: 1, 
                aBool: true, 
                aNote: ANoteADeepStructTestCodeGenStruct { amount: 1, secretHash: 2 },
                manyNotes: [
                    ManyNotesADeepStructTestCodeGenStruct { amount: 1, secretHash: 2 },
                    ManyNotesADeepStructTestCodeGenStruct { amount: 1, secretHash: 2 },
                    ManyNotesADeepStructTestCodeGenStruct { amount: 1, secretHash: 2 },
                ]
            }
        );

        context.return_values.push(return_values[0]);
        context.finish()
    }
}

