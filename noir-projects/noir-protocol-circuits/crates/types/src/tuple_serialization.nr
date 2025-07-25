use crate::traits::{Deserialize, Serialize};

// Create a slice of the given length with each element made from `f(i)` where `i` is the current index
comptime fn make_slice<Env, T>(length: u32, f: fn[Env](u32) -> T) -> [T] {
    let mut slice = &[];
    for i in 0..length {
        slice = slice.push_back(f(i));
    }
    slice
}

// Implements Serialize and Deserialize for an arbitrary tuple type
comptime fn impl_serialize_for_tuple(_m: Module, length: u32) -> Quoted {
    // `T0`, `T1`, `T2`
    let type_names = make_slice(length, |i| f"T{i}".quoted_contents());

    // `result0`, `result1`, `result2`
    let result_names = make_slice(length, |i| f"result{i}".quoted_contents());

    // `T0, T1, T2`
    let field_generics = type_names.join(quote [,]);

    // `<T0 as Serialize>::N + <T1 as Serialize>::N + <T2 as Serialize>::N`
    let full_size_serialize = type_names
        .map(|type_name| quote {
        <$type_name as Serialize>::N
    })
        .join(quote [+]);

    // `<T0 as Deserialize>::N + <T1 as Deserialize>::N + <T2 as Deserialize>::N`
    let full_size_deserialize = type_names
        .map(|type_name| quote {
        <$type_name as Deserialize>::N
    })
        .join(quote [+]);

    // `T0: Serialize, T1: Serialize, T2: Serialize,`
    let serialize_constraints = type_names
        .map(|field_name| quote {
        $field_name: Serialize,
    })
        .join(quote []);

    // `T0: Deserialize, T1: Deserialize, T2: Deserialize,`
    let deserialize_constraints = type_names
        .map(|field_name| quote {
        $field_name: Deserialize,
    })
        .join(quote []);

    // Statements to serialize each field
    let serialized_fields = type_names
        .mapi(|i, type_name| quote {
        let serialized = self.$i.serialize();
        for i in 0 .. <$type_name as Serialize>::N {
            result[offset + i] = serialized[i];
        }
        offset += <$type_name as Serialize>::N;
    })
        .join(quote []);

    // Statements to deserialize each field
    let deserialized_fields = type_names
        .mapi(|i, type_name| {
            let result_name = result_names[i];
            quote {
            let mut element_fields = [0; <$type_name as Deserialize>::N];
            for i in 0 .. <$type_name as Deserialize>::N {
                element_fields[i] = fields[i + offset];
            }
            offset += <$type_name as Deserialize>::N;
            let $result_name = $type_name::deserialize(element_fields);
        }
        })
        .join(quote []);
    let deserialize_results = result_names.join(quote [,]);

    quote {
        impl<$field_generics> Serialize for ($field_generics) where $serialize_constraints {
            let N: u32 = $full_size_serialize;

            fn serialize(self) -> [Field; Self::N] {
                let mut result: [Field; Self::N] = std::mem::zeroed();
                let mut offset = 0;
                $serialized_fields
                result
            }
        }

        impl<$field_generics> Deserialize for ($field_generics) where $deserialize_constraints {
            let N: u32 = $full_size_deserialize;

            fn deserialize(fields: [Field; Self::N]) -> Self {
                let mut offset = 0;
                $deserialized_fields
                ($deserialize_results)
            }
        }
    }
}

// Keeping these manual impls. They are more efficient since they do not
// require copying sub-arrays from any serialized arrays.
impl<T1> Serialize for (T1,)
where
    T1: Serialize,
{
    let N: u32 = <T1 as Serialize>::N;

    fn serialize(self) -> [Field; Self::N] {
        self.0.serialize()
    }
}

impl<T1> Deserialize for (T1,)
where
    T1: Deserialize,
{
    let N: u32 = <T1 as Deserialize>::N;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        (T1::deserialize(fields),)
    }
}

#[impl_serialize_for_tuple(2)]
#[impl_serialize_for_tuple(3)]
#[impl_serialize_for_tuple(4)]
#[impl_serialize_for_tuple(5)]
#[impl_serialize_for_tuple(6)]
mod impls {
    use crate::traits::{Deserialize, Serialize};
}
