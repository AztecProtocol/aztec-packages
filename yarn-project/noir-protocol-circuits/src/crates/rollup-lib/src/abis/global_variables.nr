use dep::aztec::{
    constants_gen::GENERATOR_INDEX__GLOBAL_VARIABLES,
    hash::pedersen_hash,
};

struct GlobalVariables {
    chain_id : Field,
    version : Field,
    block_number : Field,
    timestamp : Field,
}

impl GlobalVariables {

    pub fn serialize(self) -> [Field; 4] {
        [
            self.chain_id, 
            self.version, 
            self.block_number, 
            self.timestamp
        ]
    }

    pub fn hash(self) -> Field {
        pedersen_hash(self.serialize(), GENERATOR_INDEX__GLOBAL_VARIABLES)
    }

    pub fn eq(self, other : GlobalVariables) -> bool {
        (self.chain_id == other.chain_id) &
        (self.version == other.version) &
        (self.block_number == other.block_number) &
        (self.timestamp == other.timestamp)
    }
}