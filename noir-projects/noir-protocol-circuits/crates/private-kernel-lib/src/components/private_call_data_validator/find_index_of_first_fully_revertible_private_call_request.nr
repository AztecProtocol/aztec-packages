use dep::types::{abis::side_effect::Ordered, traits::Empty, utils::arrays::find_index_hint};
use std::option::Option;

// - If the min_revertible_side_effect_counter was set before any of the call requests (possibly even before "this" function (the function call that this kernel is currently processing)):
//     - Then the 0th private call request will be returned.
// - Recall that the min_revertible_side_effect_counter can only be set within the execution frames of "this" function; not within its children's execution frames.
//   So if the min_revertible_side_effect_counter is not less than the start counter of the 0th nested private function call, but _is_ less than the start counter of some subsequent private function call:
//     - then the index of that subsequent nested private function call will be returned, meaning the counter SHOULD have been set before the start counter of that function call, but after the end counter of the prev function call.
//
// Consider if `A` is "this" function call:
//
// ```
// Z {
//     // If set here, then the returned index will be 0, because B will be the first fully revertible private call request (out of A's requests; noting that A is also fully revertible).
//     A {
//         // If set here, then the returned index will be 0, because B will be the first fully revertible private call request.
//         B {
//             // A is NOT allowed to set the min_revertible_side_effect_counter to be within here, because B owns the counter within here.
//         }
//         // If set here, then the returned index will be 1, because C will be the first fully revertible private call request.
//         C {
//             // A is NOT allowed to set the min_revertible_side_effect_counter to be within here, because C owns the counter within here.
//             D {
//                 // A CANNOT set it to be within here
//             }
//             // A CANNOT set it to be within here
//             E {
//                 // A CANNOT set it to be within here
//             }
//             // A CANNOT set it to be within here
//         }
//         // If set here, then none of the start counters of any of A's nested calls came before the `min_revertible_side_effect_counter`, so the returned index will be `none`.
//     }
//     // If set here, then A has no idea. Since none of the start counters of any of A's nested calls came before the `min_revertible_side_effect_counter`, the returned index will be `none`.
// }
// ```
pub unconstrained fn find_index_of_first_fully_revertible_private_call_request<T, let N: u32>(
    min_revertible_side_effect_counter: u32,
    private_call_requests: [T; N],
) -> Option<u32>
where
    T: Ordered + Empty,
{
    find_index_hint(
        private_call_requests,
        |private_call_request| {
            private_call_request.counter() >= min_revertible_side_effect_counter
        },
    )
}

mod tests {
    use crate::components::private_call_data_validator::find_index_of_first_fully_revertible_private_call_request::find_index_of_first_fully_revertible_private_call_request;
    use dep::types::tests::fixture_builder::FixtureBuilder;

    struct TestBuilder {
        private_call: FixtureBuilder,
    }

    impl TestBuilder {
        pub fn new() -> Self {
            let private_call = FixtureBuilder::new();
            TestBuilder { private_call }
        }

        pub fn execute_to_equal(self, expected: Option<u32>) {
            let private_call = self.private_call.to_private_circuit_public_inputs();
            // Safety: this is a test
            let index = unsafe {
                find_index_of_first_fully_revertible_private_call_request(
                    private_call.min_revertible_side_effect_counter,
                    private_call.private_call_requests,
                )
            };
            assert_eq(index, expected);
        }
    }

    #[test]
    fn find_index_of_first_revertible_private_call_request_empty() {
        let builder = TestBuilder::new();
        let index: Option<u32> = Option::some(0);
        builder.execute_to_equal(index);
    }

    #[test]
    fn find_index_of_first_revertible_private_call_request_empty_with_min_counter() {
        let mut builder = TestBuilder::new();

        builder.private_call.min_revertible_side_effect_counter = 5;

        let index: Option<u32> = Option::none();
        builder.execute_to_equal(index);
    }

    #[test]
    fn find_index_of_first_revertible_private_call_request_only_revertible() {
        let mut builder = TestBuilder::new();

        // Revertible.
        builder.private_call.end_setup();
        builder.private_call.append_private_call_requests(3);

        let index: Option<u32> = Option::some(0);
        builder.execute_to_equal(index);
    }

    #[test]
    fn find_index_of_first_revertible_private_call_request_only_non_revertible() {
        let mut builder = TestBuilder::new();

        // Non-revertible.
        builder.private_call.append_private_call_requests(2);
        builder.private_call.end_setup();

        let none: Option<u32> = Option::none();
        builder.execute_to_equal(none);
    }

    #[test]
    fn find_index_of_first_revertible_private_call_request_both() {
        let mut builder = TestBuilder::new();

        // Non-revertible.
        builder.private_call.append_private_call_requests(2);
        // Revertible.
        builder.private_call.end_setup();
        builder.private_call.append_private_call_requests(3);

        let index: Option<u32> = Option::some(2);
        builder.execute_to_equal(index);
    }
}
