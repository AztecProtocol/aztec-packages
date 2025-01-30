use crate::{hash::compute_secret_hash, oracle::random::random};

pub struct SecretAndHash {
    secret: Field,
    hash: Field,
}

impl SecretAndHash {
    unconstrained fn random() -> Self {
        let secret = random();
        let hash = compute_secret_hash(secret);
        SecretAndHash { secret, hash }
    }
}
