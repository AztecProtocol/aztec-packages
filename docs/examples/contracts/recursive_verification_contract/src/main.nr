// docs:start:full_contract
use aztec::macros::aztec;

#[aztec]
pub contract ValueNotEqual {
    use aztec::{
        macros::{functions::{external, initializer, only_self, view}, storage::storage},
        oracle::logging::debug_log_format,
        protocol::{address::AztecAddress, traits::ToField},
        state_vars::{Map, PublicImmutable, PublicMutable},
    };
    use bb_proof_verification::{UltraHonkVerificationKey, UltraHonkZKProof, verify_honk_proof};

    #[storage]
    struct Storage {
        counters: Map<AztecAddress, PublicMutable<Field>>,
        vk_hash: PublicImmutable<Field>,
    }

    #[initializer]
    #[external("public")]
    fn constructor(headstart: Field, owner: AztecAddress, vk_hash: Field) {
        self.storage.counters.at(owner).write(headstart);
        self.storage.vk_hash.initialize(vk_hash);
    }

    #[external("private")]
    fn increment(
        owner: AztecAddress,
        verification_key: UltraHonkVerificationKey,
        proof: UltraHonkZKProof,
        public_inputs: [Field; 1],
    ) {
        debug_log_format("Incrementing counter for owner {0}", [owner.to_field()]);

        // Read the stored VK hash - this is readable from private context
        // because PublicImmutable values are committed at deployment
        let vk_hash = self.storage.vk_hash.read();

        // Verify the proof - this is the core operation
        // The function checks:
        // 1. The VK hashes to the stored vk_hash
        // 2. The proof is valid for the given VK and public inputs
        verify_honk_proof(verification_key, proof, public_inputs, vk_hash);

        // If we reach here, the proof is valid
        // Enqueue a public function call to update state
        self.enqueue_self._increment_public(owner);
    }

    #[only_self]
    #[external("public")]
    fn _increment_public(owner: AztecAddress) {
        let current = self.storage.counters.at(owner).read();
        self.storage.counters.at(owner).write(current + 1);
    }

    #[view]
    #[external("public")]
    fn get_counter(owner: AztecAddress) -> Field {
        self.storage.counters.at(owner).read()
    }
}
// docs:end:full_contract
