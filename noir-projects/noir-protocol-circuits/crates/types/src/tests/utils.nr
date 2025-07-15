use crate::{traits::{Deserialize, Empty}, utils::arrays::validate_array};

pub fn assert_array_eq<T, let N: u32, let M: u32>(array: [T; N], expected: [T; M])
where
    T: Empty,
{
    assert(expected.all(|elem: T| !elem.is_empty()), "cannot expect empty element in the result");
    assert_eq(validate_array(array), M, "mismatch array lengths");
    for i in 0..M {
        assert_eq(array[i], expected[i], "mismatch array elements");
    }
}

// Swap two items in a BoundedVec.
// Useful when we want to shuffle side effects, which by default are ordered by counters when we add mock data to FixtureBuilder.
pub fn swap_items<T, let N: u32>(vec: &mut BoundedVec<T, N>, from_index: u32, to_index: u32) {
    let tmp = vec.get(from_index);
    vec.set(from_index, vec.get(to_index));
    vec.set(to_index, tmp);
}

pub fn pad_end<T, let N: u32, let M: u32>(items: [T; N], emptyItem: T) -> [T; M] {
    let mut output = [emptyItem; M];
    for i in 0..N {
        output[i] = items[i];
    }
    output
}

pub fn pad_end_with_empty<T, let N: u32, let M: u32>(items: [T; N]) -> [T; M]
where
    T: Empty,
{
    pad_end(items, T::empty())
}

pub fn make_fixture<T>(seed: Field) -> T
where
    T: Deserialize,
{
    let mut fields = [0; <T as Deserialize>::N];
    for i in 0..<T as Deserialize>::N {
        fields[i] = seed + i as Field;
    }
    T::deserialize(fields)
}
