use crate::{traits::Empty, utils::arrays::array_length};

// original_array(_lt/_gte) must be valid, i.e. validate_array(original_array) == true
pub fn assert_combined_transformed_array<T, S, let N: u32, Env>(
    original_array_lt: [T; N],
    original_array_gte: [T; N],
    combined_array: [S; N],
    is_transformed: fn[Env](T, S) -> bool
) where T: Empty + Eq {
    let num_lt = array_length(original_array_lt);
    let mut is_lt = true;
    for i in 0..N {
        is_lt &= i != num_lt;

        let from = if is_lt {
            original_array_lt[i]
        } else {
            original_array_gte[i - num_lt]
        };

        let to = combined_array[i];

        assert(is_transformed(from, to), "hinted item in the commbined array does not match");
    }
}
