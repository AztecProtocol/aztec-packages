use crate::protocol::constants::{DOM_SEP__IVSK_M, DOM_SEP__NSK_M, DOM_SEP__OVSK_M, DOM_SEP__TSK_M};

pub global NULLIFIER_INDEX: Field = 0;
pub global INCOMING_INDEX: Field = 1;
pub global OUTGOING_INDEX: Field = 2;
pub global TAGGING_INDEX: Field = 3;

pub global NUM_KEY_TYPES: u32 = 4;

pub global sk_generators: [Field; 4] =
    [DOM_SEP__NSK_M as Field, DOM_SEP__IVSK_M as Field, DOM_SEP__OVSK_M as Field, DOM_SEP__TSK_M as Field];
