use super::{
    read_request_hints::ReadRequestHints,
    validate_pending_read_requests::validate_pending_read_requests,
    validate_propagated_read_requests::validate_propagated_read_requests,
    validate_settled_read_requests::validate_settled_read_requests,
};

use dep::types::{
    merkle_tree::LeafPreimage,
    side_effect::{Counted, Readable, Scoped},
    utils::arrays::ClaimedLengthArray,
};

pub struct ReadRequestValidator<let ReadRequestLen: u32, Value, let PendingValueLen: u32, let PendingReadHintsLen: u32, let SettledReadHintsLen: u32, let TreeHeight: u32, SettledReadLeafPreimage> {
    pub read_requests: ClaimedLengthArray<Scoped<Counted<Field>>, ReadRequestLen>,
    pub pending_values: ClaimedLengthArray<Scoped<Counted<Value>>, PendingValueLen>,
    pub tree_root: Field,
    pub propagated_read_requests: ClaimedLengthArray<Scoped<Counted<Field>>, ReadRequestLen>,
    pub hints: ReadRequestHints<ReadRequestLen, PendingReadHintsLen, SettledReadHintsLen, TreeHeight, SettledReadLeafPreimage>,
}

impl<let ReadRequestLen: u32, Value, let PendingValueLen: u32, let PendingReadHintsLen: u32, let SettledReadHintsLen: u32, let TreeHeight: u32, SettledReadLeafPreimage> ReadRequestValidator<ReadRequestLen, Value, PendingValueLen, PendingReadHintsLen, SettledReadHintsLen, TreeHeight, SettledReadLeafPreimage>
where
    Value: Readable,
    SettledReadLeafPreimage: LeafPreimage + Readable,
{
    // Generic parameters are used because generic arrays cannot have zero length.
    // When a reset circuit does not require read request validation, the hints array will still contain at least one
    // item, while `_ReadAmount` will be set to zero.
    pub fn validate<let PendingReadAmount: u32, let SettledReadAmount: u32>(self) {
        if PendingReadAmount != 0 {
            // `PendingReadAmount` is not used in validation and propagation when it's larger than 0. However, it should
            // still match `PendingReadHintsLen` to ensure consistency and avoid confusion.
            std::static_assert(
                PendingReadAmount == self.hints.pending_read_hints.len(),
                "PendingReadAmount should match the length of the hints array",
            );

            // Since all hints are consumed in `validate_pending_read_requests`, it is not possible to skip propagating
            // a read request by referencing a hint.
            // This allows us to skip validation of unused hints (because there are none), unlike the case where
            // `PendingReadAmount` is 0.
            validate_pending_read_requests(
                self.read_requests,
                self.pending_values,
                self.hints.pending_read_hints,
            );
        } else {
            // Validate unused hints: Ensure that all index hints are set to `ReadRequestLen`.
            // This guarantees that the hints cannot be used in `validate_propagated_read_requests` to skip propagating
            // a read request by pointing to a valid `read_request_index`.
            for hint in self.hints.pending_read_hints {
                assert_eq(
                    hint.read_request_index,
                    ReadRequestLen,
                    "Unused pending read hint must not point to a read request",
                );
            }
        }

        if SettledReadAmount != 0 {
            // `SettledReadAmount` is not used in validation and propagation when it's larger than 0. However, it should
            // still match `SettledReadHintsLen` to ensure consistency and avoid confusion.
            std::static_assert(
                SettledReadAmount == self.hints.settled_read_hints.len(),
                "SettledReadAmount should match the length of the hints array",
            );

            // Since all hints are consumed in `validate_settled_read_requests`, it is not possible to skip propagating
            // a read request by referencing a hint.
            // This allows us to skip validation of unused hints (because there are none), unlike the case where
            // `SettledReadAmount` is 0.
            validate_settled_read_requests(
                self.read_requests,
                self.hints.settled_read_hints,
                self.tree_root,
            );
        } else {
            // Validate unused hints: Ensure that all index hints are set to `ReadRequestLen`.
            // This guarantees that the hints cannot be used in `validate_propagated_read_requests` to skip propagating
            // a read request by pointing to a valid `read_request_index`.
            for hint in self.hints.settled_read_hints {
                assert_eq(
                    hint.read_request_index,
                    ReadRequestLen,
                    "Unused settled read hint must not point to a read request",
                );
            }
        }

        validate_propagated_read_requests(
            self.read_requests,
            self.propagated_read_requests,
            self.hints,
        );
    }
}
