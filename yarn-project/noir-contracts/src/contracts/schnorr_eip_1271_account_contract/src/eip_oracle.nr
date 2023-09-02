use dep::aztec::types::point::Point;

#[oracle(getEip1271Witness)]
fn get_eip_1271_witness_oracle(_message_hash: Field) -> [Field; 67] {}

struct Eip1271Witness {
    owner: Point,
    signature: [u8; 64],
    partial_address: Field,
}

impl Eip1271Witness {
    fn deserialize(values: [Field; 67]) -> Self {
        let mut signature = [0; 64];
        for i in 0..64 {
            signature[i] = values[i + 2] as u8;
        }
        Self {
            owner: Point::new(values[0], values[1]),
            signature,
            partial_address: values[66],
        }
    }
}

// Need to figure something out for number of fields returned
unconstrained fn get_eip_1271_witness(message_hash: Field) -> Eip1271Witness {
    Eip1271Witness::deserialize(get_eip_1271_witness_oracle(message_hash))
}