use dep::std;
use dep::aztec::context::Context;
use dep::aztec::constants_gen::RETURN_VALUES_LENGTH;

//-------

// use dep::types::type_serialisation::TypeSerialisationInterface;

use dep::aztec::types::type_serialisation::{
    field_serialisation::{
        FieldSerialisationMethods,
        FIELD_SERIALISED_LEN,
    },
};

//-------

// Spread an array into an array:
fn spread<SRC_LEN, TARGET_LEN>(mut target_arr: [Field; TARGET_LEN], src_arr: [Field; SRC_LEN], at_index: Field) -> [Field; TARGET_LEN] {
    let mut j = at_index;
    for i in 0..SRC_LEN {
        target_arr[j] = src_arr[i]; 
    }
    target_arr
}

struct ZkToken_ContractInterface {
    address: Field,
}

impl ZkToken_ContractInterface {
    fn at(address: Field) -> Self {
        Self {
            address,
        }
    }

    fn mint(
        self,
        context: &mut Context,
        amount: Field,
        owner: Field
    ) -> [Field; RETURN_VALUES_LENGTH] {
        let mut serialised_args = [0; FIELD_SERIALISED_LEN + FIELD_SERIALISED_LEN];

        let mut spread_index: Field = 0;

        let serialiseField = FieldSerialisationMethods.serialise;
        serialised_args = spread(
            serialised_args,
            serialiseField(amount),
            spread_index
        );
        spread_index += FIELD_SERIALISED_LEN;

        // let serialiseField = FieldSerialisationMethods.serialise;
        serialised_args = spread(
            serialised_args,
            serialiseField(owner),
            spread_index
        );
        // spread_index += FIELD_SERIALISED_LEN;

        context.call_private_function(self.address, 12345, serialised_args).public_inputs.return_values
    }

    fn transfer(
        self,
        context: &mut Context,
        amount: Field,
        sender: Field,
        recipient: Field
    ) -> [Field; RETURN_VALUES_LENGTH] {
        let mut serialised_args = [0; FIELD_SERIALISED_LEN + FIELD_SERIALISED_LEN + FIELD_SERIALISED_LEN];

        let mut spread_index: Field = 0;

        let serialiseField = FieldSerialisationMethods.serialise;
        serialised_args = spread(
            serialised_args,
            serialiseField(amount),
            spread_index
        );
        spread_index += FIELD_SERIALISED_LEN;

        // let serialiseField = FieldSerialisationMethods.serialise;
        serialised_args = spread(
            serialised_args,
            serialiseField(sender),
            spread_index
        );
        spread_index += FIELD_SERIALISED_LEN;

        serialised_args = spread(
            serialised_args,
            serialiseField(recipient),
            spread_index
        );
        // spread_index += FIELD_SERIALISED_LEN;

        context.call_private_function(self.address, 12345, serialised_args).public_inputs.return_values
    }
}


#[test]
// We simply test whether this compiles. We can't actually test it, because oracle calls are not supported by Noir tests yet.
fn test_transfer() {
    let mut context: Context = std::unsafe::zeroed();

    let zk_token_contract_instance = ZkToken_ContractInterface::at(1234);

    let deserialiseField = FieldSerialisationMethods.deserialise;

    let amount = deserialiseField([0; FIELD_SERIALISED_LEN]);
    let sender = deserialiseField([0; FIELD_SERIALISED_LEN]);
    let recipient = deserialiseField([0; FIELD_SERIALISED_LEN]);

    let return_values = zk_token_contract_instance.transfer(
        &mut context,
        amount,
        sender,
        recipient
    );
}