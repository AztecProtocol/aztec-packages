use crate::reset::read_request::{ReadRequestState, ReadRequestStatus};
use dep::types::abis::side_effect::{Ordered, Overridable, Readable};

pub struct ReadIndexHint {
    read_request_index: u32,
    value_index: u32,
}

impl ReadIndexHint {
    pub fn nada(read_request_len: u32) -> Self {
        ReadIndexHint { read_request_index: read_request_len, value_index: 0 }
    }
}

fn validate_pending_read_requests<R, let READ_REQUEST_LEN: u32, V, let PENDING_VALUE_LEN: u32, let NUM_HINTS: u32>(
    read_requests: [R; READ_REQUEST_LEN],
    pending_values: [V; PENDING_VALUE_LEN],
    index_hints: [ReadIndexHint; NUM_HINTS],
)
where
    R: Ordered,
    V: Readable<R> + Ordered + Overridable,
{
    for i in 0..index_hints.len() {
        let index_hint = index_hints[i];
        let read_request_index = index_hint.read_request_index;
        if read_request_index != READ_REQUEST_LEN {
            let read_request = read_requests[read_request_index];
            let pending_value = pending_values[index_hint.value_index];
            pending_value.assert_match_read_request(read_request);
            assert(
                read_request.counter() > pending_value.counter(),
                "Read request counter must be greater than the counter of the data write",
            );
            assert(
                (read_request.counter() < pending_value.override_counter())
                    | (pending_value.override_counter() == 0),
                "Read request counter must be less than the counter of the next data write",
            );
        }
    }
}

fn validate_leaf_data_read_requests<R, let READ_REQUEST_LEN: u32, L, let LEAF_DATA_LEN: u32, let NUM_HINTS: u32>(
    read_requests: [R; READ_REQUEST_LEN],
    leaf_data: [L; LEAF_DATA_LEN],
    index_hints: [ReadIndexHint; NUM_HINTS],
)
where
    R: Ordered,
    L: Readable<R> + Overridable,
{
    for i in 0..index_hints.len() {
        let index_hint = index_hints[i];
        let read_request_index = index_hint.read_request_index;
        if read_request_index != READ_REQUEST_LEN {
            let read_request = read_requests[read_request_index];
            let data = leaf_data[index_hint.value_index];
            data.assert_match_read_request(read_request);
            assert(
                (read_request.counter() < data.override_counter()) | (data.override_counter() == 0),
                "Hinted leaf is overridden before the read request",
            );
        }
    }
}

fn ensure_all_read_requests_are_verified<R, let READ_REQUEST_LEN: u32, let NUM_PENDING_READS: u32, let NUM_LEAF_DATA_READS: u32>(
    read_requests: [R; READ_REQUEST_LEN],
    read_request_statuses: [ReadRequestStatus; READ_REQUEST_LEN],
    pending_read_hints: [ReadIndexHint; NUM_PENDING_READS],
    leaf_data_read_hints: [ReadIndexHint; NUM_LEAF_DATA_READS],
)
where
    R: Ordered,
{
    for i in 0..READ_REQUEST_LEN {
        let read_request = read_requests[i];
        if read_request.counter() != 0 {
            let status = read_request_statuses[i];
            if status.state == ReadRequestState.PENDING {
                assert(
                    pending_read_hints[status.hint_index].read_request_index == i,
                    "Hinted pending read request does not match status",
                );
            } else {
                assert(
                    leaf_data_read_hints[status.hint_index].read_request_index == i,
                    "Hinted settled read request does not match status",
                );
            }
        }
    }
}

pub fn reset_mutable_data_read_requests<R, let READ_REQUEST_LEN: u32, V, let PENDING_VALUE_LEN: u32, L, let NUM_LEAF_DATA_HINTS: u32, let NUM_PENDING_READS: u32, let NUM_LEAF_DATA_READS: u32>(
    read_requests: [R; READ_REQUEST_LEN],
    read_request_statuses: [ReadRequestStatus; READ_REQUEST_LEN],
    pending_values: [V; PENDING_VALUE_LEN],
    leaf_data: [L; NUM_LEAF_DATA_HINTS],
    pending_read_hints: [ReadIndexHint; NUM_PENDING_READS],
    leaf_data_read_hints: [ReadIndexHint; NUM_LEAF_DATA_READS],
)
where
    R: Ordered,
    V: Readable<R> + Ordered + Overridable,
    L: Readable<R> + Overridable,
{
    validate_pending_read_requests(read_requests, pending_values, pending_read_hints);

    validate_leaf_data_read_requests(read_requests, leaf_data, leaf_data_read_hints);

    ensure_all_read_requests_are_verified(
        read_requests,
        read_request_statuses,
        pending_read_hints,
        leaf_data_read_hints,
    );
}

mod tests {
    use crate::reset::{
        mutable_data_read_request::{
            ensure_all_read_requests_are_verified, ReadIndexHint, reset_mutable_data_read_requests,
            validate_leaf_data_read_requests, validate_pending_read_requests,
        },
        read_request::{ReadRequestState, ReadRequestStatus},
    };
    use dep::types::{
        abis::{
            public_data_read::PublicDataRead,
            public_data_update_request::PublicDataUpdateRequest,
            public_data_write::OverridablePublicDataWrite,
            side_effect::{Overridable, Readable},
        },
        tests::utils::pad_end,
        traits::Empty,
    };

    struct TestLeafData {
        leaf_index: Field,
        value: Field,
        override_counter: u32,
    }

    impl Empty for TestLeafData {
        fn empty() -> Self {
            TestLeafData { leaf_index: 0, value: 0, override_counter: 0 }
        }
    }

    impl Overridable for TestLeafData {
        fn override_counter(self) -> u32 {
            self.override_counter
        }
    }

    impl Readable<PublicDataRead> for TestLeafData {
        fn assert_match_read_request(self, read_request: PublicDataRead) {
            assert_eq(
                self.leaf_index,
                read_request.leaf_slot,
                "leaf_index in TestLeafData does not match",
            );
            assert_eq(self.value, read_request.value, "value in TestLeafData does not match");
        }
    }

    global READ_REQUEST_LEN = 10;

    struct TestBuilder {
        read_requests: [PublicDataRead; READ_REQUEST_LEN],
        read_request_statuses: [ReadRequestStatus; READ_REQUEST_LEN],
        data_writes: [OverridablePublicDataWrite; 6],
        leaf_data: [TestLeafData; 12],
        pending_read_hints: [ReadIndexHint; 5],
        leaf_data_read_hints: [ReadIndexHint; 4],
        num_pending_reads: u32,
        num_leaf_data_reads: u32,
        counter: u32,
    }

    impl TestBuilder {
        pub fn new() -> TestBuilder {
            let read_requests = [PublicDataRead::empty(); READ_REQUEST_LEN];
            let read_request_statuses = [ReadRequestStatus::empty(); READ_REQUEST_LEN];

            let leaf_data = pad_end(
                [
                    TestLeafData { leaf_index: 44, value: 0, override_counter: 40 },
                    TestLeafData { leaf_index: 77, value: 700, override_counter: 0 },
                    TestLeafData { leaf_index: 11, value: 0, override_counter: 20 },
                    TestLeafData { leaf_index: 33, value: 300, override_counter: 30 },
                    TestLeafData { leaf_index: 66, value: 600, override_counter: 0 },
                    TestLeafData { leaf_index: 22, value: 200, override_counter: 10 },
                    TestLeafData { leaf_index: 55, value: 500, override_counter: 0 },
                ],
                TestLeafData::empty(),
            );

            let data_writes = pad_end(
                [
                    OverridablePublicDataWrite {
                        write: PublicDataUpdateRequest {
                            leaf_slot: 22,
                            new_value: 201,
                            counter: 10,
                        },
                        override_counter: 40,
                    },
                    OverridablePublicDataWrite {
                        write: PublicDataUpdateRequest {
                            leaf_slot: 11,
                            new_value: 100,
                            counter: 20,
                        },
                        override_counter: 0,
                    },
                    OverridablePublicDataWrite {
                        write: PublicDataUpdateRequest {
                            leaf_slot: 33,
                            new_value: 301,
                            counter: 30,
                        },
                        override_counter: 0,
                    },
                    OverridablePublicDataWrite {
                        write: PublicDataUpdateRequest {
                            leaf_slot: 22,
                            new_value: 202,
                            counter: 40,
                        },
                        override_counter: 0,
                    },
                ],
                OverridablePublicDataWrite::empty(),
            );

            let pending_read_hints = pad_end([], ReadIndexHint::nada(READ_REQUEST_LEN));

            let leaf_data_read_hints = pad_end([], ReadIndexHint::nada(READ_REQUEST_LEN));

            TestBuilder {
                read_requests,
                read_request_statuses,
                leaf_data,
                data_writes,
                pending_read_hints,
                leaf_data_read_hints,
                num_pending_reads: 0,
                num_leaf_data_reads: 0,
                counter: 50,
            }
        }

        pub fn add_pending_read(&mut self, data_write_index: u32) {
            let write = self.data_writes[data_write_index].write;
            let read_request_index = self.num_pending_reads + self.num_leaf_data_reads;
            self.read_requests[read_request_index] = PublicDataRead {
                leaf_slot: write.leaf_slot,
                value: write.new_value,
                counter: self.counter,
            };
            self.pending_read_hints[self.num_pending_reads] =
                ReadIndexHint { read_request_index, value_index: data_write_index };
            self.read_request_statuses[read_request_index] =
                ReadRequestStatus::pending(self.num_pending_reads);
            self.num_pending_reads += 1;
            self.counter += 1;
        }

        pub fn add_leaf_data_read(&mut self, data_hint_index: u32) {
            let data_hint = self.leaf_data[data_hint_index];
            let read_request_index = self.num_pending_reads + self.num_leaf_data_reads;
            self.read_requests[read_request_index] = PublicDataRead {
                leaf_slot: data_hint.leaf_index,
                value: data_hint.value,
                counter: self.counter,
            };
            self.leaf_data_read_hints[self.num_leaf_data_reads] =
                ReadIndexHint { read_request_index, value_index: data_hint_index };
            self.read_request_statuses[read_request_index] =
                ReadRequestStatus::settled(self.num_leaf_data_reads);
            self.num_leaf_data_reads += 1;
            self.counter += 1;
        }

        pub fn validate_pending_read_requests(self) {
            validate_pending_read_requests(
                self.read_requests,
                self.data_writes,
                self.pending_read_hints,
            );
        }

        pub fn validate_leaf_data_read_requests(self) {
            validate_leaf_data_read_requests(
                self.read_requests,
                self.leaf_data,
                self.leaf_data_read_hints,
            )
        }

        pub fn ensure_all_read_requests_are_verified(self) {
            ensure_all_read_requests_are_verified(
                self.read_requests,
                self.read_request_statuses,
                self.pending_read_hints,
                self.leaf_data_read_hints,
            )
        }

        pub fn reset(self) {
            reset_mutable_data_read_requests(
                self.read_requests,
                self.read_request_statuses,
                self.data_writes,
                self.leaf_data,
                self.pending_read_hints,
                self.leaf_data_read_hints,
            );
        }
    }

    #[test]
    fn reset_pending_reads_succeeds() {
        let mut builder = TestBuilder::new();

        builder.add_pending_read(1);
        builder.add_pending_read(2);
        builder.add_pending_read(3);

        builder.validate_pending_read_requests();
    }

    #[test]
    fn reset_pending_reads_repeated_values() {
        let mut builder = TestBuilder::new();

        builder.add_pending_read(2);
        builder.add_pending_read(2);
        builder.add_pending_read(2);

        builder.validate_pending_read_requests();
    }

    #[test(should_fail_with = "Read request counter must be less than the counter of the next data write")]
    fn reset_pending_reads_overriden_value_fails() {
        let mut builder = TestBuilder::new();

        // 0th write is overriden by the 3rd write.
        builder.add_pending_read(0);

        builder.validate_pending_read_requests();
    }

    #[test]
    fn reset_pending_reads_overriden_value_before_next_succeeds() {
        let mut builder = TestBuilder::new();

        // 0th write is overriden by the 3rd write.
        builder.add_pending_read(0);

        // Tweak the counter of the read request to be before the next value.
        builder.read_requests[0].counter = builder.data_writes[3].write.counter - 1;

        builder.validate_pending_read_requests();
    }

    #[test(should_fail_with = "leaf_slot in OverridablePublicDataWrite does not match read request")]
    fn reset_pending_reads_wrong_slot_fails() {
        let mut builder = TestBuilder::new();

        builder.add_pending_read(2);
        builder.read_requests[0].leaf_slot += 1;

        builder.validate_pending_read_requests();
    }

    #[test(should_fail_with = "value in OverridablePublicDataWrite does not match read request")]
    fn reset_pending_reads_wrong_value_fails() {
        let mut builder = TestBuilder::new();

        builder.add_pending_read(2);
        builder.read_requests[0].value += 1;

        builder.validate_pending_read_requests();
    }

    #[test(should_fail_with = "Read request counter must be greater than the counter of the data write")]
    fn reset_pending_reads_value_write_after_fails() {
        let mut builder = TestBuilder::new();

        builder.add_pending_read(2);
        builder.read_requests[0].counter = builder.data_writes[2].write.counter - 1;

        builder.validate_pending_read_requests();
    }

    #[test]
    fn reset_leaf_data_reads_succeeds() {
        let mut builder = TestBuilder::new();

        builder.add_leaf_data_read(1);
        builder.add_leaf_data_read(4);
        builder.add_leaf_data_read(6);

        builder.validate_leaf_data_read_requests();
    }

    #[test]
    fn reset_leaf_data_reads_repeated_values() {
        let mut builder = TestBuilder::new();

        builder.add_leaf_data_read(4);
        builder.add_leaf_data_read(4);
        builder.add_leaf_data_read(4);

        builder.validate_leaf_data_read_requests();
    }

    #[test(should_fail_with = "Hinted leaf is overridden before the read request")]
    fn reset_leaf_data_reads_overriden_value_fails() {
        let mut builder = TestBuilder::new();

        // 2nd leaf is overriden by a pending write.
        builder.add_leaf_data_read(2);

        builder.validate_leaf_data_read_requests();
    }

    #[test]
    fn reset_leaf_data_reads_overriden_value_before_next_succeeds() {
        let mut builder = TestBuilder::new();

        // 2nd leaf is overriden by a pending write.
        builder.add_leaf_data_read(2);

        // Tweak the counter of the read request to be before the pending write.
        builder.read_requests[0].counter = builder.leaf_data[2].override_counter - 1;

        builder.validate_leaf_data_read_requests();
    }

    #[test(should_fail_with = "leaf_index in TestLeafData does not match")]
    fn reset_leaf_reads_wrong_slot_fails() {
        let mut builder = TestBuilder::new();

        builder.add_leaf_data_read(4);
        builder.read_requests[0].leaf_slot += 1;

        builder.validate_leaf_data_read_requests();
    }

    #[test(should_fail_with = "value in TestLeafData does not match")]
    fn reset_leaf_reads_wrong_value_fails() {
        let mut builder = TestBuilder::new();

        builder.add_leaf_data_read(4);
        builder.read_requests[0].value += 1;

        builder.validate_leaf_data_read_requests();
    }

    #[test]
    fn ensure_all_read_requests_are_verified_succeeds() {
        let mut builder = TestBuilder::new();

        builder.add_leaf_data_read(4);
        builder.add_pending_read(2);
        builder.add_pending_read(1);
        builder.add_leaf_data_read(1);

        builder.ensure_all_read_requests_are_verified();
    }

    #[test(should_fail_with = "Hinted pending read request does not match status")]
    fn ensure_all_read_requests_are_verified_wrong_pending_hint_index_fails() {
        let mut builder = TestBuilder::new();

        builder.add_pending_read(2);
        builder.read_request_statuses[0].hint_index += 1;

        builder.ensure_all_read_requests_are_verified();
    }

    #[test(should_fail_with = "Hinted settled read request does not match status")]
    fn ensure_all_read_requests_are_verified_wrong_leaf_hint_index_fails() {
        let mut builder = TestBuilder::new();

        builder.add_leaf_data_read(4);
        builder.read_request_statuses[0].hint_index += 1;

        builder.ensure_all_read_requests_are_verified();
    }

    #[test(should_fail_with = "Hinted settled read request does not match status")]
    fn ensure_all_read_requests_are_verified_wrong_status_fails() {
        let mut builder = TestBuilder::new();

        builder.add_pending_read(2);
        builder.read_request_statuses[0].state = ReadRequestState.NADA;

        builder.ensure_all_read_requests_are_verified();
    }

    #[test]
    fn reset_mutable_data_read_requests_succeeds() {
        let mut builder = TestBuilder::new();

        builder.add_pending_read(1);
        builder.add_leaf_data_read(4);
        builder.add_pending_read(2);
        builder.add_leaf_data_read(6);
        builder.add_leaf_data_read(6);
        builder.add_pending_read(1);

        builder.reset();
    }

    #[test]
    fn reset_mutable_data_read_requests_no_requests_succeeds() {
        let builder = TestBuilder::new();
        builder.reset();
    }
}
