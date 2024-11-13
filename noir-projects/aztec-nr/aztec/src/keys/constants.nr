use dep::protocol_types::constants::{
    GENERATOR_INDEX__IVSK_M, GENERATOR_INDEX__NSK_M, GENERATOR_INDEX__OVSK_M,
    GENERATOR_INDEX__TSK_M,
};

pub global NULLIFIER_INDEX = 0;
pub global INCOMING_INDEX = 1;
pub global OUTGOING_INDEX = 2;
pub global TAGGING_INDEX = 3;

pub global NUM_KEY_TYPES = 4;

pub global sk_generators = [
    GENERATOR_INDEX__NSK_M as Field,
    GENERATOR_INDEX__IVSK_M as Field,
    GENERATOR_INDEX__OVSK_M as Field,
    GENERATOR_INDEX__TSK_M as Field,
];
