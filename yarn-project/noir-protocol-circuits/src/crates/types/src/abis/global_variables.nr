use dep::std::cmp::Eq;
use crate::{
    constants::GENERATOR_INDEX__GLOBAL_VARIABLES,
    traits::Hash,
};

struct GlobalVariables {
    chain_id : Field,
    version : Field,
    block_number : Field,
    timestamp : Field,
}

global GLOBAL_VARIABLES_LENGTH: Field = 4;

impl GlobalVariables {
    fn serialize(self) -> [Field; GLOBAL_VARIABLES_LENGTH] {
        [
            self.chain_id,
            self.version,
            self.block_number,
            self.timestamp
        ]
    }

    fn deserialize(serialized: [Field; GLOBAL_VARIABLES_LENGTH]) -> GlobalVariables {
        GlobalVariables {
            chain_id: serialized[0],
            version: serialized[1],
            block_number: serialized[2],
            timestamp: serialized[3],
        }
    }
}

impl Eq for GlobalVariables {
    fn eq(self, other : GlobalVariables) -> bool {
        (self.chain_id == other.chain_id) &
        (self.version == other.version) &
        (self.block_number == other.block_number) &
        (self.timestamp == other.timestamp)
    }
}

impl Hash for GlobalVariables {
    fn hash(self) -> Field {
        dep::std::hash::pedersen_hash_with_separator([
            self.chain_id, 
            self.version, 
            self.block_number, 
            self.timestamp
            ],
            GENERATOR_INDEX__GLOBAL_VARIABLES,
            )
    }
}
