use crate::state_vars::type_serde_interface::TypeSerdeInterface;

global FIELD_SERIALISED_LEN: Field = 1;

fn deserialiseField(fields: [Field; FIELD_SERIALISED_LEN]) -> Field {
    fields[0]
}

fn serialiseField(value: Field) -> [Field; FIELD_SERIALISED_LEN] {
    [value]
}

global FieldSerdeInterface = TypeSerdeInterface {
    deserialise: deserialiseField,
    serialise: serialiseField,
};