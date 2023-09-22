use crate::types::type_serialisation::TypeSerialisationInterface;

global BOOL_SERIALIZED_LEN: Field = 1;

fn deserializeBool(fields: [Field; BOOL_SERIALIZED_LEN]) -> bool {
    fields[0] as bool
}

fn serializeBool(value: bool) -> [Field; BOOL_SERIALIZED_LEN] {
    [value as Field]
}

global BoolSerialisationMethods = TypeSerialisationInterface {
    deserialize: deserializeBool,
    serialize: serializeBool,
};