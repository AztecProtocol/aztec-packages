use crate::types::type_serialisation::TypeSerialisationInterface;

global FIELD_serializeD_LEN: Field = 1;

fn deserializeField(fields: [Field; FIELD_serializeD_LEN]) -> Field {
    fields[0]
}

fn serializeField(value: Field) -> [Field; FIELD_serializeD_LEN] {
    [value]
}

global FieldSerialisationMethods = TypeSerialisationInterface {
    deserialize: deserializeField,
    serialize: serializeField,
};