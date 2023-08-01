mod field_serde_interface;

/**
 * Before Noir supports traits, a way of specifying the serialisation and deserialisation (serde) methods for a type.
 */
struct TypeSerdeInterface<T, N> {
    deserialise: fn ([Field; N]) -> T,
    serialise: fn (T) -> [Field; N],
}