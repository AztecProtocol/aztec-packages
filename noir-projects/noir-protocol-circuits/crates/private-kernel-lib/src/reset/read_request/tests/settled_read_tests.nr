use super::TestBuilder;
use dep::types::tests::utils::assert_array_eq;

impl TestBuilder {
    pub fn new_all_settled() -> Self {
        let mut builder = Self::new();

        builder.add_settled_read(0);
        builder.add_settled_read(1);
        builder.add_settled_read(2);

        builder
    }
}

#[test]
fn reset_all_settled_read_requests() {
    let builder = TestBuilder::new_all_settled();
    builder.validate();

    assert_eq(builder.propagated_read_requests.length, 0);
    assert_array_eq(builder.propagated_read_requests.array, []);
}

#[test]
fn reset_partial_settled_read_requests() {
    let mut builder = TestBuilder::new();

    builder.add_settled_read(0);

    // Add a read request without hint.
    let read_request_index = builder.add_read_request(9999);
    let skipped_read_request = builder.read_requests.array[read_request_index];

    builder.add_settled_read(2);

    builder.build_propagated_read_requests();
    builder.validate();

    assert_eq(builder.propagated_read_requests.length, 1);
    assert_array_eq(
        builder.propagated_read_requests.array,
        [skipped_read_request],
    );
}

#[test]
fn duplicate_settled_read_requests() {
    let mut builder = TestBuilder::new();

    // Add multiple requests reading the same leaf preimage.
    builder.add_settled_read(1);
    builder.add_settled_read(2);
    builder.add_settled_read(1);
    builder.add_settled_read(2);

    builder.validate();

    assert_eq(builder.propagated_read_requests.length, 0);
    assert_array_eq(builder.propagated_read_requests.array, []);
}

#[test(should_fail_with = "Hinted test leaf preimage does not match read request")]
fn hint_points_to_wrong_leaf_preimage() {
    let mut builder = TestBuilder::new();

    builder.add_settled_read(1);

    // Tweak the hint to point to a different leaf preimage.
    let mut hint = builder.hints.settled_read_hints.pop();
    hint.leaf_preimage = builder.leaf_preimages[2];
    builder.hints.settled_read_hints.push(hint);

    builder.validate();
}

#[test(should_fail_with = "Hinted test leaf preimage does not match read request")]
fn mismatch_leaf_preimage_being_read() {
    let mut builder = TestBuilder::new_all_settled();

    // Read a value that does not exist.
    builder.read_requests.array[0].read_request.value = 9999;

    builder.validate();
}

#[test(should_fail_with = "Membership check failed: leaf for read request not found in tree")]
fn incorrect_membership_witness_sibling_path() {
    let mut builder = TestBuilder::new();

    builder.add_settled_read(0);

    // Change the membership witness to be different.
    let mut hint = builder.hints.settled_read_hints.pop();
    hint.membership_witness.sibling_path = builder.tree.get_sibling_path(1);
    builder.hints.settled_read_hints.push(hint);

    builder.validate();
}

#[test(should_fail_with = "Membership check failed: leaf for read request not found in tree")]
fn incorrect_membership_witness_leaf_index() {
    let mut builder = TestBuilder::new_all_settled();

    // Change the leaf index.
    let mut hint = builder.hints.settled_read_hints.pop();
    hint.membership_witness.leaf_index += 1;
    builder.hints.settled_read_hints.push(hint);

    builder.validate();
}
