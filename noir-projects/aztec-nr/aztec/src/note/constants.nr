pub global MAX_NOTE_FIELDS_LENGTH: u32 = 20;
// The plus 1 is 1 extra field for nonce.
// + 2 for EXTRA_DATA: [number_of_return_notes, contract_address]
pub global GET_NOTE_ORACLE_RETURN_LENGTH: u32 = MAX_NOTE_FIELDS_LENGTH + 1 + 2;
pub global MAX_NOTES_PER_PAGE: u32 = 10;
pub global VIEW_NOTE_ORACLE_RETURN_LENGTH: u32 =
    MAX_NOTES_PER_PAGE * (MAX_NOTE_FIELDS_LENGTH + 1) + 2;
