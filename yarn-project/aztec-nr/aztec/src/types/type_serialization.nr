mod bool_serialization;
mod field_serialization;
mod u32_serialization;

/**
 * Before Noir supports traits, a way of specifying the serialization and deserialization methods for a type.
 */
// docs:start:TypeSerialisationInterface
struct TypeSerialisationInterface<T, N> {
    deserialize: fn ([Field; N]) -> T,
    serialize: fn (T) -> [Field; N],
}
// docs:end:TypeSerialisationInterface