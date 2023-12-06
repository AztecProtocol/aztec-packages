use crate::types::type_serialization::TypeSerializationInterface;
use dep::protocol_types::{
    address::{
        Address,
        EthAddress
    },
};

global ADDRESS_SERIALIZED_LEN: Field = 1;

fn deserialize(fields: [Field; ADDRESS_SERIALIZED_LEN]) -> Address {
    Address::from_field(fields[0])
}

fn serialize(value: Address) -> [Field; ADDRESS_SERIALIZED_LEN] {
    [value.to_field()]
}

global AddressSerializationMethods = TypeSerializationInterface {
    deserialize,
    serialize,
};