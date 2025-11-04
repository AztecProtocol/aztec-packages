use super::{
    read_request_action::ReadRequestAction, validate_pending_read_requests::PendingReadHint,
    validate_settled_read_requests::SettledReadHint,
};

pub struct ReadRequestHints<let ReadRequestLen: u32, let PendingReadHintsLen: u32, let SettledReadHintsLen: u32, let TreeHeight: u32, SettledReadLeafPreimage> {
    pub read_request_actions: [ReadRequestAction; ReadRequestLen],
    pub pending_read_hints: [PendingReadHint; PendingReadHintsLen],
    pub settled_read_hints: [SettledReadHint<TreeHeight, SettledReadLeafPreimage>; SettledReadHintsLen],
}
