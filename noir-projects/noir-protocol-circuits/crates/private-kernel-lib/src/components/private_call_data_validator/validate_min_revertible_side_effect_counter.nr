use super::find_index_of_first_fully_revertible_private_call_request::find_index_of_first_fully_revertible_private_call_request;
use dep::types::{
    abis::side_effect::{Ordered, RangeOrdered},
    traits::Empty,
    utils::arrays::ClaimedLengthArray,
};

// Check that the min_revertible_side_effect_counter does not fall in the middle of any nested calls.
// E.g. If it were possible, one could create a custom account contract, set the min_revertible_side_effect_counter to a
// value that falls within a nested transfer function, then make the tx revert which then preserves the note hashes and discards
// the nullifiers.
//
//
//
// Suppose this kernel is currently processing function A (so B and C are the private_call_requests of A's)
// With the current check, we only make sure that the function setting the counter can't split the side effects of its children:
// ```
// A {
//     // A is allowed to set the min_revertible_side_effect_counter here
//     B {
//         // A is NOT allowed to set the min_revertible_side_effect_counter to be within here, because B owns the counter within here.
//     }
//     // A is allowed to set it here too.
//     C {
//         // A is NOT allowed to set the min_revertible_side_effect_counter to be within here, because C owns the counter within here.
//         D {
//             // A CANNOT set it to be within here
//         }
//         // A CANNOT set it to be within here
//         E {
//             // A CANNOT set it to be within here
//         }
//         // A CANNOT set it to be within here
//     }
//     // A is allowed to set it here too.
// }
// ```
//
// Considering if A is a child of Z:
// ```
// Z {
//     emit note_hash
//     A {
//         set_counter() // A is only allowed to set the min_revertible_side_effect_counter to fall within A's scope.
//     }
//     emit nullifier
// }
// ```
//
// We don't have to use the aggregated min_revertible_side_effect_counter in the output for the below check.
// If the current call's min_revertible_side_effect_counter is 0, it means the counter might be set by another
// function. This check for that function guarantees that the counter won't fall into one of its nested calls.
// In this case, we can simply use 0 and make the following check pass.
pub fn validate_that_this_call_doesnt_try_to_set_a_phase_change_within_a_child_calls_execution_frame<T, let N: u32>(
    min_revertible_side_effect_counter: u32, // Could be 0.
    private_call_requests: ClaimedLengthArray<T, N>,
)
where
    T: RangeOrdered + Ordered + Empty,
{
    // Safety: the index is constrained below
    let first_fully_revertible_private_call_index_hint = unsafe {
        find_index_of_first_fully_revertible_private_call_request(
            min_revertible_side_effect_counter,
            private_call_requests.array,
        )
    };

    let num_private_call_requests = private_call_requests.length;

    // Note: we assert that the counters of the private call requests are in ascending
    // order, within `PrivateCallDataValidator.validate_that_side_effect_counters_are_strictly_increasing_and_within_bounds`.

    // If the first_fully_revertible_private_call_index_hint is 0, then the min_revertible_side_effect_counter
    // should have been set before any of the nested function calls. We need to validate this in here.
    // If the first_fully_revertible_private_call_index_hint is some other valid index of a nested private call request,
    // then the min_revertible_size_effect_counter should have been set _in between_ that private call and the
    // previous private call. We need to validate this.
    // If the first_fully_revertible_private_call_index_hint is none, then:
    // - It means the min_revertible_size_effect_counter must get set after all of these nested private function call requests.
    if first_fully_revertible_private_call_index_hint.is_some() {
        // 0 <= index < num_private_call_requests:
        let index = first_fully_revertible_private_call_index_hint.unwrap_unchecked();
        let first_fully_revertible_private_call_request = private_call_requests.array[index];
        assert(
            min_revertible_side_effect_counter
                <= first_fully_revertible_private_call_request.counter_start(),
            "min_revertible_side_effect_counter must be less than or equal to the start counter of the first revertible item",
        );

        if index != 0 {
            // 0 < index < num_private_call_requests:
            // We ignore `index = 0`, because in that case the `min_revertible_side_effect_counter` was already checked above to be less than the start counter of the 0th private call request.
            let last_non_revertible_private_call_index = index - 1;
            let last_non_revertible_private_call =
                private_call_requests.array[last_non_revertible_private_call_index];
            assert(
                min_revertible_side_effect_counter > last_non_revertible_private_call.counter_end(),
                "min_revertible_side_effect_counter must be greater than the end counter of the last non revertible item",
            );
        }
    } else if num_private_call_requests != 0 {
        // they must all have counters less than the min_revertible_side_effect_counter,
        // so ensure the last one's counter satisfies this:
        let last_private_call = private_call_requests.array[num_private_call_requests - 1];
        assert(
            min_revertible_side_effect_counter > last_private_call.counter_end(),
            "expected min_revertible_side_effect_counter to be greater than the counters of all calls",
        );
    }
}

mod tests {
    use super::validate_that_this_call_doesnt_try_to_set_a_phase_change_within_a_child_calls_execution_frame;
    use dep::types::tests::fixture_builder::{claimed_length_array_from_bounded_vec, FixtureBuilder};

    struct TestBuilder {
        private_call: FixtureBuilder,
    }

    impl TestBuilder {
        pub fn new() -> Self {
            let private_call = FixtureBuilder::new();
            TestBuilder { private_call }
        }

        pub fn split_calls(&mut self, counter: u32) {
            self.private_call.min_revertible_side_effect_counter = counter;
        }

        pub fn add_private_call_request(&mut self, counter_start: u32, counter_end: u32) {
            let index = self.private_call.private_call_requests.len();
            self.private_call.append_private_call_requests(1);
            let mut call_request = self.private_call.private_call_requests.get(index);
            call_request.start_side_effect_counter = counter_start;
            call_request.end_side_effect_counter = counter_end;
            self.private_call.private_call_requests.set(index, call_request);
            self.private_call.counter = counter_end + 1;
        }

        pub fn execute(self) {
            validate_that_this_call_doesnt_try_to_set_a_phase_change_within_a_child_calls_execution_frame(
                self.private_call.min_revertible_side_effect_counter,
                claimed_length_array_from_bounded_vec(self.private_call.private_call_requests),
            );
        }
    }

    #[test]
    fn validate_that_this_call_doesnt_try_to_set_a_phase_change_within_a_child_calls_execution_frame_succeeds() {
        let mut builder = TestBuilder::new();

        builder.add_private_call_request(20, 30);
        builder.add_private_call_request(40, 50);
        builder.split_calls(60);
        builder.add_private_call_request(60, 70);

        builder.execute();
    }

    #[test]
    fn validate_that_this_call_doesnt_try_to_set_a_phase_change_within_a_child_calls_execution_frame_empty_revertible_succeeds() {
        let mut builder = TestBuilder::new();

        builder.add_private_call_request(20, 30);
        builder.add_private_call_request(40, 50);
        builder.split_calls(51);

        builder.execute();
    }

    #[test]
    fn validate_that_this_call_doesnt_try_to_set_a_phase_change_within_a_child_calls_execution_frame_empty_non_revertible_succeeds() {
        let mut builder = TestBuilder::new();

        builder.split_calls(20);
        builder.add_private_call_request(20, 30);
        builder.add_private_call_request(40, 50);

        builder.execute();
    }

    #[test]
    fn validate_that_this_call_doesnt_try_to_set_a_phase_change_within_a_child_calls_execution_frame_less_than_first_revertible_success() {
        let mut builder = TestBuilder::new();

        builder.add_private_call_request(20, 30);
        builder.add_private_call_request(40, 50);
        // Tweak the counter to be less than the start counter of the first revertible call.
        builder.split_calls(59);
        builder.add_private_call_request(60, 70);

        builder.execute();
    }

    #[test(should_fail_with = "min_revertible_side_effect_counter must be greater than the end counter of the last non revertible item")]
    fn validate_that_this_call_doesnt_try_to_set_a_phase_change_within_a_child_calls_execution_frame_less_than_last_non_revertible_fails() {
        let mut builder = TestBuilder::new();

        builder.add_private_call_request(20, 30);
        builder.add_private_call_request(40, 50);
        // Tweak the counter to be less than the end counter of the last non-revertible call.
        builder.split_calls(49);
        builder.add_private_call_request(60, 70);

        builder.execute();
    }

    #[test(should_fail_with = "expected min_revertible_side_effect_counter to be greater than the counters of all calls")]
    fn validate_that_this_call_doesnt_try_to_set_a_phase_change_within_a_child_calls_execution_frame_equal_last_non_revertible_fails() {
        let mut builder = TestBuilder::new();

        builder.add_private_call_request(20, 30);
        builder.add_private_call_request(40, 50);
        // Tweak the counter to equal the end counter of the last non-revertible call.
        builder.split_calls(50);

        builder.execute();
    }

    #[test(should_fail_with = "expected min_revertible_side_effect_counter to be greater than the counters of all calls")]
    fn validate_that_this_call_doesnt_try_to_set_a_phase_change_within_a_child_calls_execution_frame_greater_than_first_revertible_fails() {
        let mut builder = TestBuilder::new();

        builder.add_private_call_request(20, 30);
        builder.add_private_call_request(40, 50);
        // Tweak the counter to be greater than the start counter of the first revertible call.
        builder.split_calls(61);
        builder.add_private_call_request(60, 70);

        builder.execute();
    }

    #[test]
    fn validate_that_this_call_doesnt_try_to_set_a_phase_change_within_a_child_calls_execution_frame_0_succeeds() {
        let mut builder = TestBuilder::new();

        // Set the counter to be 0.
        builder.split_calls(0);
        builder.add_private_call_request(20, 30);
        builder.add_private_call_request(40, 50);

        builder.execute();
    }

    // #[test(should_fail_with = "first_fully_revertible_private_call_index_hint is out of bounds")]
    // fn validate_that_this_call_doesnt_try_to_set_a_phase_change_within_a_child_calls_execution_frame_0_wrong_hint_fails() {
    //     let mut builder = TestBuilder::new();

    //     builder.split_calls(0);
    //     // Set the index hint to be 1.
    //     builder.first_revertible_private_call_request_index = 1;
    //     builder.add_private_call_request(20, 30);
    //     builder.add_private_call_request(40, 50);

    //     builder.execute();
    // }

    // #[test(should_fail_with = "min_revertible_side_effect_counter must be less than or equal to the start counter of the first revertible item")]
    // fn validate_that_this_call_doesnt_try_to_set_a_phase_change_within_a_child_calls_execution_frame_index_hint_greater_than_len_fails() {
    //     let mut builder = TestBuilder::new();

    //     builder.add_private_call_request(20, 30);
    //     builder.add_private_call_request(40, 50);
    //     builder.split_calls(51);
    //     // Increase the index by 1.
    //     builder.first_revertible_private_call_request_index += 1;

    //     builder.execute();
    // }
}
