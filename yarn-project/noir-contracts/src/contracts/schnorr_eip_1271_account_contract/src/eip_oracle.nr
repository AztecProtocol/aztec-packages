#[oracle(getEip1271Witness)]
fn get_eip_1271_witness_oracle(_message_hash: Field) -> [Field; 129] {}

// Need to figure something out for number of fields returned
unconstrained fn get_eip_1271_witness(message_hash: Field) -> [Field; 129] {
    get_eip_1271_witness_oracle(message_hash)
}