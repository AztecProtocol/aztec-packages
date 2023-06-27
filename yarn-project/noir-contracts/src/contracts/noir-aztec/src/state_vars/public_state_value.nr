struct PublicStateValueInterface<T, N> {
    deserialise: fn ([Field; N]) -> T,
    serialise: fn (T) -> [Field; N],
}

fn deserialiseField(fields: [Field; 1]) -> Field {
    fields[0]
}

fn serialiseField(value: Field) -> [Field; 1] {
    [value]
}

global FieldValueInterface = PublicStateValueInterface {
    deserialise: deserialiseField,
    serialise: serialiseField,
};