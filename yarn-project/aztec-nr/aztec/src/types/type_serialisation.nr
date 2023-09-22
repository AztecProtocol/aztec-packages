mod bool_serialisation;
mod field_serialisation;
mod u32_serialisation;

/**
 * Before Noir supports traits, a way of specifying the serialisation and deserialisation methods for a type.
 */
// docs:start:TypeSerialisationInterface
struct TypeSerialisationInterface<T, N> {
    deserialize: fn ([Field; N]) -> T,
    serialize: fn (T) -> [Field; N],
}
// docs:end:TypeSerialisationInterface