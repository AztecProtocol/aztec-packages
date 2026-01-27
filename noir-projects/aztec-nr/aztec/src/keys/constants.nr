use dep::protocol_types::constants::{
    DOM_SEP__IVSK_M, DOM_SEP__NSK_M, DOM_SEP__OVSK_M, DOM_SEP__TSK_M,
};

// TODO: this should live in noir-protocol-circuits/
pub global NULLIFIER_INDEX: Field = 0;
pub global INCOMING_INDEX: Field = 1;
pub global OUTGOING_INDEX: Field = 2;
pub global TAGGING_INDEX: Field = 3;

// TODO: this should live in noir-protocol-circuits/
pub global NUM_KEY_TYPES: u32 = 4;

// TODO: this should live in noir-protocol-circuits/
pub global sk_generators: [Field; 4] = [
    DOM_SEP__NSK_M as Field,
    DOM_SEP__IVSK_M as Field,
    DOM_SEP__OVSK_M as Field,
    DOM_SEP__TSK_M as Field,
];
