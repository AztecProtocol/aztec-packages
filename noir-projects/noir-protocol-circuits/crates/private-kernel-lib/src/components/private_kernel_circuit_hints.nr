use dep::types::{abis::private_circuit_public_inputs::PrivateCircuitPublicInputs, utils::arrays::array_length};

pub fn find_first_revertible_private_call_request_index(private_call: PrivateCircuitPublicInputs) -> u32 {
    let min_revertible_counter = private_call.min_revertible_side_effect_counter;
    let private_call_requests = private_call.private_call_requests;
    let max_len = private_call_requests.len();
    let mut index = max_len;
    for i in 0..max_len {
        let request = private_call_requests[i];
        if (index == max_len) & (request.start_side_effect_counter >= min_revertible_counter) {
            index = i;
        }
    }
    if index == max_len {
        index = array_length(private_call_requests);
    }
    index
}

mod tests {
    use crate::components::private_kernel_circuit_hints::find_first_revertible_private_call_request_index;
    use dep::types::tests::fixture_builder::FixtureBuilder;

    struct TestBuilder {
        private_call: FixtureBuilder
    }

    impl TestBuilder {
        pub fn new() -> Self {
            let private_call = FixtureBuilder::new();
            TestBuilder { private_call }
        }

        pub fn execute(self) -> u32 {
            let private_call = self.private_call.to_private_circuit_public_inputs();
            find_first_revertible_private_call_request_index(private_call)
        }
    }

    #[test]
    fn find_first_revertible_private_call_request_index_empty() {
        let builder = TestBuilder::new();
        let index = builder.execute();
        assert_eq(index, 0);
    }

    #[test]
    fn find_first_revertible_private_call_request_index_empty_with_min_counter() {
        let mut builder = TestBuilder::new();

        builder.private_call.min_revertible_side_effect_counter = 5;

        let index = builder.execute();
        assert_eq(index, 0);
    }

    #[test]
    fn find_first_revertible_private_call_request_index_only_revertible() {
        let mut builder = TestBuilder::new();

        // Revertible.
        builder.private_call.end_setup();
        builder.private_call.append_private_call_requests(3);

        let index = builder.execute();
        assert_eq(index, 0);
    }

    #[test]
    fn find_first_revertible_private_call_request_index_only_non_revertible() {
        let mut builder = TestBuilder::new();

        // Non-revertible.
        builder.private_call.append_private_call_requests(2);
        builder.private_call.end_setup();

        let index = builder.execute();
        assert_eq(index, 2);
    }

    #[test]
    fn find_first_revertible_private_call_request_index_both() {
        let mut builder = TestBuilder::new();

        // Non-revertible.
        builder.private_call.append_private_call_requests(2);
        // Revertible.
        builder.private_call.end_setup();
        builder.private_call.append_private_call_requests(3);

        let index = builder.execute();
        assert_eq(index, 2);
    }
}
