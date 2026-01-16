use types::{traits::Empty, utils::arrays::ClaimedLengthArray};

/// Validates that an array of items is correctly transformed into another array.
///
/// ### Arguments
/// - `original_array`: The original array of items with a claimed length.
/// - `transformed_array`: The array of items that have been transformed.
/// - `assert_transformed`: A user-provided assertion function that verifies the transformation of each item.
///
/// ### Argument requirements:
/// - `assert_transformed` must guarantee that the transformed value of an empty original item is also empty.
///
/// This function checks that:
/// - Each item in the `original_array` is correctly transformed and placed in the `transformed_array`.
///
/// ### Notes
/// - This function also checks the transformation of the items beyond `original_array.length`. The caller should ensure
///   that the array is dense trimmed if this is desired.
/// - This function does not mutate the input arrays; it only validates correctness.
pub fn assert_transformed_array<T, S, let N: u32, Env>(
    original_array: ClaimedLengthArray<T, N>,
    transformed_array: [S; N],
    assert_transformed: fn[Env](T, S) -> (),
)
where
    S: Empty,
{
    for i in 0..N {
        let original = original_array.array[i];
        let transformed = transformed_array[i];
        assert_transformed(original, transformed);
    }
}
