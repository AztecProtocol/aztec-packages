use dep::protocol_types::constants::{
    GENERATOR_INDEX__IVSK_M, GENERATOR_INDEX__NSK_M, GENERATOR_INDEX__OVSK_M,
    GENERATOR_INDEX__TSK_M,
};

pub global NULLIFIER_INDEX: Field = 0;
pub global INCOMING_INDEX: Field = 1;
pub global OUTGOING_INDEX: Field = 2;
pub global TAGGING_INDEX: Field = 3;

pub global NUM_KEY_TYPES: u32 = 4;

pub global sk_generators: [Field; 4] = [
    GENERATOR_INDEX__NSK_M as Field,
    GENERATOR_INDEX__IVSK_M as Field,
    GENERATOR_INDEX__OVSK_M as Field,
    GENERATOR_INDEX__TSK_M as Field,
];
