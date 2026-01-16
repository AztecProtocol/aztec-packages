use dep::types::traits::Empty;

struct ReadRequestActionEnum {
    pub SKIP: u8,
    pub READ_AS_PENDING: u8,
    pub READ_AS_SETTLED: u8,
}

pub global ReadRequestActions: ReadRequestActionEnum =
    ReadRequestActionEnum { SKIP: 0, READ_AS_PENDING: 1, READ_AS_SETTLED: 2 };

#[derive(Eq)]
pub struct ReadRequestAction {
    pub action: u8,
    pub hint_index: u32,
}

impl Empty for ReadRequestAction {
    fn empty() -> Self {
        ReadRequestAction { action: ReadRequestActions.SKIP, hint_index: 0 }
    }
}

// Methods used in tests.
impl ReadRequestAction {
    pub fn skip() -> Self {
        ReadRequestAction { action: ReadRequestActions.SKIP, hint_index: 0 }
    }

    pub fn read_pending(hint_index: u32) -> Self {
        ReadRequestAction { action: ReadRequestActions.READ_AS_PENDING, hint_index }
    }

    pub fn read_settled(hint_index: u32) -> Self {
        ReadRequestAction { action: ReadRequestActions.READ_AS_SETTLED, hint_index }
    }

    pub fn is_skip(self) -> bool {
        self.action == ReadRequestActions.SKIP
    }

    pub fn is_pending(self) -> bool {
        self.action == ReadRequestActions.READ_AS_PENDING
    }

    pub fn is_settled(self) -> bool {
        self.action == ReadRequestActions.READ_AS_SETTLED
    }
}
