use crate::reset::read_request::{
    read_request_action::ReadRequestAction, read_request_hints::ReadRequestHints,
    validate_pending_read_requests::PendingReadHint,
    validate_settled_read_requests::SettledReadHint,
};
use dep::types::{merkle_tree::MembershipWitness, traits::Empty};

pub struct ReadRequestHintsBuilder<let ReadRequestLen: u32, let PendingHintsLen: u32, let SettledHintsLen: u32, let TreeHeight: u32, SettledReadLeafPreimage> {
    pub read_request_actions: [ReadRequestAction; ReadRequestLen],
    pub pending_read_hints: BoundedVec<PendingReadHint, PendingHintsLen>,
    pub settled_read_hints: BoundedVec<SettledReadHint<TreeHeight, SettledReadLeafPreimage>, SettledHintsLen>,
}

impl<let ReadRequestLen: u32, let PendingHintsLen: u32, let SettledHintsLen: u32, let TreeHeight: u32, SettledReadLeafPreimage> ReadRequestHintsBuilder<ReadRequestLen, PendingHintsLen, SettledHintsLen, TreeHeight, SettledReadLeafPreimage>
where
    SettledReadLeafPreimage: Empty,
{
    pub fn new() -> Self {
        ReadRequestHintsBuilder {
            read_request_actions: [ReadRequestAction::empty(); ReadRequestLen],
            pending_read_hints: BoundedVec::from_parts_unchecked(
                [PendingReadHint::skip(ReadRequestLen); PendingHintsLen],
                0,
            ),
            settled_read_hints: BoundedVec::from_parts_unchecked(
                [SettledReadHint::skip(ReadRequestLen); SettledHintsLen],
                0,
            ),
        }
    }

    pub fn add_pending_read_hint(&mut self, read_request_index: u32, pending_value_index: u32) {
        let hint_index = self.pending_read_hints.len();
        let hint = PendingReadHint { read_request_index, pending_value_index };
        self.pending_read_hints.push(hint);
        self.read_request_actions[read_request_index] = ReadRequestAction::read_pending(hint_index);
    }

    pub fn add_settled_read_hint(
        &mut self,
        read_request_index: u32,
        membership_witness: MembershipWitness<TreeHeight>,
        leaf_preimage: SettledReadLeafPreimage,
    ) {
        let hint_index = self.settled_read_hints.len();
        let hint = SettledReadHint { read_request_index, membership_witness, leaf_preimage };
        self.settled_read_hints.push(hint);
        self.read_request_actions[read_request_index] = ReadRequestAction::read_settled(hint_index);
    }

    pub fn to_hints(
        self,
    ) -> ReadRequestHints<ReadRequestLen, PendingHintsLen, SettledHintsLen, TreeHeight, SettledReadLeafPreimage> {
        ReadRequestHints {
            read_request_actions: self.read_request_actions,
            pending_read_hints: self.pending_read_hints.storage(),
            settled_read_hints: self.settled_read_hints.storage(),
        }
    }
}
