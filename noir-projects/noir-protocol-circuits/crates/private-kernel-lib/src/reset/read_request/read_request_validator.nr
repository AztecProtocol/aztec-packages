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
    // The `...Len` generic names passed through this circuit (see main.nr) are used to dictate array lengths.
    // But sometimes we want to compile variants of the reset circuit with some of these arrays having zero
    // length, so as to effectively "skip" constraints relating to the array's concept. E.g. we might
    // want a reset circuit variant which doesn't process any read requests, so we want the read_request arrays
    // to have zero length, so that our `for` loops over those arrays compile to nothingness.
    // Unfortunately, Noir's generic arrays _cannot_ have zero length (the min length is 1). Therefore, we
    // need to feed extra generics through the circuit to enable us to convey "zero length". That's what the
    // `...Amount` generic parameters are for.
    // When a reset circuit does not require read request validation, the hints array will still contain at least one
    // item, while `_ReadAmount` will be set to zero.
    //
    // Valid pairs of `...Len` and `...Amount` (they only differ in the case of wanting to convey zero length):
    // `...Len`:    1 1 2 3
    // `...Amount`: 0 1 2 3
    pub fn validate<let PendingReadAmount: u32, let SettledReadAmount: u32>(self) {
        if PendingReadAmount != 0 {
            // `PendingReadAmount` is not used in validation and propagation when it's larger than 0 (`PendingReadHintsLen`
            // is used instead). However, it should still match `PendingReadHintsLen` to ensure consistency and avoid
            // confusion.
            std::static_assert(
                PendingReadAmount == PendingReadHintsLen,
                "PendingReadAmount should match the length of the hints array",
            );

            // Explaining a difference between this `if` branch vs the `else` branch:
            // We can skip validation of unused hints here (because all hints are used), unlike the case where
            // `PendingReadAmount` is 0.
            // The reason all hints are used is because all `pending_read_hints` are iterated over in `validate_pending_read_requests`,
            // so it is not possible to skip propagating a read request by referencing a hint.
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
