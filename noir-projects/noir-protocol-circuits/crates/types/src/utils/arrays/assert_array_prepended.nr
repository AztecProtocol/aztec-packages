use super::ClaimedLengthArray;

use crate::traits::Empty;
use crate::utils::for_loop::for_i_only_in_0_;

pub fn assert_array_prepended<T, let N: u32>(
    dest: ClaimedLengthArray<T, N>,
    source: ClaimedLengthArray<T, N>,
)
where
    T: Empty,
{
    source.for_each_i(|source_item, i| {
        assert_eq(dest.array[i], source_item, "source item does not prepend to dest");
    });
}

pub fn assert_array_prepended_up_to_some_length<T, let N: u32>(
    dest: ClaimedLengthArray<T, N>,
    source: ClaimedLengthArray<T, N>,
    source_length: u32,
)
where
    T: Eq,
{
    for_i_only_in_0_(
        source_length,
        source.array.len(),
        |i| { assert_eq(dest.array[i], source.array[i], "source item does not prepend to dest"); },
        true,
    );
}
