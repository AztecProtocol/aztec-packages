struct RevertCodeEnum {
    OK: u8,
    APP_LOGIC_REVERTED: u8,
    TEARDOWN_REVERTED: u8,
    BOTH_REVERTED: u8,
}

pub global RevertCode = RevertCodeEnum {
    OK: 0,
    APP_LOGIC_REVERTED: 1,
    TEARDOWN_REVERTED: 2,
    BOTH_REVERTED: 3,
};
