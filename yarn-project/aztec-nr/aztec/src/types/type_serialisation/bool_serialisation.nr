use crate::types::type_serialisation::TypeSerialisationInterface;

global BOOL_serializeD_LEN: Field = 1;

fn deserializeBool(fields: [Field; BOOL_serializeD_LEN]) -> bool {
    fields[0] as bool
}

fn serializeBool(value: bool) -> [Field; BOOL_serializeD_LEN] {
    [value as Field]
}

global BoolSerialisationMethods = TypeSerialisationInterface {
    deserialize: deserializeBool,
    serialize: serializeBool,
};