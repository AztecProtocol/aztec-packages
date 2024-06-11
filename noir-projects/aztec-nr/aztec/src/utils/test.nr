use crate::utils::{collapse, collapse_contrain};

#[test]
fn collapse_empty_array() {
    let original: [Option<Field>; 2] = [Option::none(), Option::none()];
    let collapsed = collapse(original);

    assert_eq(collapsed.len(), 0);
}

#[test]
fn collapse_non_sparse_array() {
    let original = [Option::some(7), Option::some(3), Option::none()];
    let collapsed = collapse(original);

    assert_eq(collapsed.len(), 2);
    assert_eq(collapsed.get(0), 7);
    assert_eq(collapsed.get(1), 3);
}

#[test]
fn collapse_sparse_array() {
    let original = [Option::some(7), Option::none(), Option::some(3)];
    let collapsed = collapse(original);

    assert_eq(collapsed.len(), 2);
    assert_eq(collapsed.get(0), 7);
    assert_eq(collapsed.get(1), 3);
}

#[test]
fn collapse_constrain_good_hints() {
    let original = [Option::some(7), Option::none(), Option::some(3)];
    let collapsed = BoundedVec::from_array([7, 3]);
    let collapsed_to_input_index_mapping = BoundedVec::from_array([0, 2]);

    collapse_contrain(original, collapsed, collapsed_to_input_index_mapping);
}

#[test(should_fail_with="Wrong collapsed vec length")]
fn collapse_constrain_wrong_length() {
    let original = [Option::some(7), Option::none(), Option::some(3)];
    let collapsed = BoundedVec::from_array([7]);
    let collapsed_to_input_index_mapping = BoundedVec::from_array([0]);

    collapse_contrain(original, collapsed, collapsed_to_input_index_mapping);
}

#[test(should_fail_with="Collapse hint vec length mismatch")]
fn collapse_constrain_hint_length_mismatch() {
    let original = [Option::some(7), Option::none(), Option::some(3)];
    let collapsed = BoundedVec::from_array([7, 3]);
    let collapsed_to_input_index_mapping = BoundedVec::from_array([0]);

    collapse_contrain(original, collapsed, collapsed_to_input_index_mapping);
}

#[test(should_fail_with="Out of bounds index hint")]
fn collapse_constrain_out_of_bounds_index_hint() {
    let original = [Option::some(7), Option::none(), Option::some(3)];
    let collapsed = BoundedVec::from_array([7, 3]);
    let collapsed_to_input_index_mapping = BoundedVec::from_array([0, 5]);

    collapse_contrain(original, collapsed, collapsed_to_input_index_mapping);
}

#[test(should_fail)]
fn collapse_constrain_hint_to_none() {
    let original = [Option::some(7), Option::none(), Option::some(3)];
    let collapsed = BoundedVec::from_array([7, 0]);
    let collapsed_to_input_index_mapping = BoundedVec::from_array([0, 1]);

    collapse_contrain(original, collapsed, collapsed_to_input_index_mapping);
}

#[test(should_fail_with="Wrong collapsed vec content")]
fn collapse_constrain_wrong_vec_content() {
    let original = [Option::some(7), Option::none(), Option::some(3)];
    let collapsed = BoundedVec::from_array([7, 42]);
    let collapsed_to_input_index_mapping = BoundedVec::from_array([0, 2]);

    collapse_contrain(original, collapsed, collapsed_to_input_index_mapping);
}

#[test(should_fail_with="Wrong collapsed vec order")]
fn collapse_constrain_wrong_vec_order() {
    let original = [Option::some(7), Option::none(), Option::some(3)];
    let collapsed = BoundedVec::from_array([3, 7]);
    let collapsed_to_input_index_mapping = BoundedVec::from_array([2, 0]);

    collapse_contrain(original, collapsed, collapsed_to_input_index_mapping);
}
