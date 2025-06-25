use crate::traits::{Deserialize, Serialize};

comptime fn make_slice<Env, T>(length: u32, f: fn[Env](u32) -> T) -> [T] {
    let mut slice = &[];
    for i in 0 .. length {
        slice = slice.push_back(f(i));
    }
    slice
}

comptime fn map2<Env, T, U, R>(slice1: [T], slice2: [U], f: fn[Env](T, U) -> R) -> [R] {
    assert_eq(slice1.len(), slice2.len());
    let mut result = &[];
    for i in 0 .. slice1.len() {
        result = result.push_back(f(slice1[i], slice2[i]));
    }
    result
}

// Implements Serialize and Deserialize for an arbitrary tuple type
comptime fn impl_serialize_for_tuple(_m: Module, length: u32) -> Quoted {
    // `T0`, `T1`, `T2`
    let type_names = make_slice(length, |i| f"T{i}".quoted_contents());

    // `N0`, `N1`, `N2`
    let size_names = make_slice(length, |i| f"N{i}".quoted_contents());

    // `result0`, `result1`, `result2`
    let result_names = make_slice(length, |i| f"result{i}".quoted_contents());

    // `T0, T1, T2`
    let field_generics = type_names.join(quote[,]);

    // `let N0: u32, let N1: u32, let N2: u32`
    let size_generics = size_names.map(|size| quote[let $size: u32]).join(quote[,]);

    // `N0 + N1 + N2`
    let full_size = size_names.join(quote[+]);

    // `T0: Serialize<N0>, T1: Serialize<N1>, T2: Serialize<N2>,`
    let serialize_constraints = map2(type_names, size_names, |field_name, size_name| quote {
        $field_name: Serialize<$size_name>,
    }).join(quote[]);

    // `T0: Deserialize<N0>, T1: Deserialize<N1>, T2: Deserialize<N2>,`
    let deserialize_constraints = map2(type_names, size_names, |field_name, size_name| quote {
        $field_name: Deserialize<$size_name>,
    }).join(quote[]);

    // Statements to serialize each field
    let serialized_fields = size_names.mapi(|i, size| quote {
        let serialized = self.$i.serialize();
        for i in 0 .. $size {
            result[offset + i] = serialized[i];
        }
        offset += $size;
    }).join(quote[]);

    // Statements to deserialize each field
    let deserialized_fields = size_names.mapi(|i, size| {
        let type_name = type_names[i];
        let result_name = result_names[i];
        quote {
            let mut element_fields: [Field; $size] = std::mem::zeroed();
            for i in 0 .. $size {
                element_fields[i] = fields[i + offset];
            }
            offset += $size;
            let $result_name = $type_name::deserialize(element_fields);
        }
    }).join(quote[]);
    let deserialize_results = result_names.join(quote[,]);

    quote {
        impl<$field_generics, $size_generics> Serialize<$full_size> for ($field_generics) where $serialize_constraints {
            fn serialize(self) -> [Field; $full_size] {
                let mut result: [Field; $full_size] = std::mem::zeroed();
                let mut offset = 0;
                $serialized_fields
                result
            }
        }

        impl<$field_generics, $size_generics> Deserialize<$full_size> for ($field_generics) where $deserialize_constraints {
            fn deserialize(fields: [Field; $full_size]) -> Self {
                let mut offset = 0;
                $deserialized_fields
                ($deserialize_results)
            }
        }
    }
}

// Keeping these manual impls. They are more efficient since they do not
// require copying sub-arrays from any serialized arrays.
impl<T1, let N1: u32> Serialize<N1> for (T1,)
where
    T1: Serialize<N1>,
{
    fn serialize(self) -> [Field; N1] {
        self.0.serialize()
    }
}

impl<T1, let N1: u32> Deserialize<N1> for (T1,)
where
    T1: Deserialize<N1>,
{
    fn deserialize(fields: [Field; N1]) -> Self {
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
