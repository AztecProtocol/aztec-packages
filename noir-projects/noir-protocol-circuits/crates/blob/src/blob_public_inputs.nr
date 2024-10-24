use crate::config::F;
use types::{traits::{Empty, Serialize, Deserialize}, constants::BLOB_PUBLIC_INPUTS};
use bigint::BigNum;

pub struct BlobPublicInputs {
    z: Field,
    y: F,
    kzg_commitment: [Field; 2],
}

impl BlobPublicInputs {
    fn accumulate(self, other: Self) -> Self {
        // TODO: When we verify root, rather than block root, on L1 we need to accumulate many blob openings
        // @Mike this may be where we calculate z_acc, y_acc, C_acc, etc.
        // WARNING: unimplemented, below is nonsense to get noir to compile
        Self { z: self.z + other.z, y: self.y.add(other.y), kzg_commitment: self.kzg_commitment }
    }
}

impl Empty for BlobPublicInputs {
    fn empty() -> Self {
        Self { z: 0, y: BigNum::new(), kzg_commitment: [0; 2] }
    }
}

impl Serialize<BLOB_PUBLIC_INPUTS> for BlobPublicInputs {
    fn serialize(self) -> [Field; BLOB_PUBLIC_INPUTS] {
        [
            self.z,
            self.y.limbs[0],
            self.y.limbs[1],
            self.y.limbs[2],
            self.kzg_commitment[0],
            self.kzg_commitment[1],
        ]
    }
}

impl Deserialize<BLOB_PUBLIC_INPUTS> for BlobPublicInputs {
    fn deserialize(fields: [Field; BLOB_PUBLIC_INPUTS]) -> Self {
        Self {
            z: fields[0],
            y: BigNum { limbs: [fields[1], fields[2], fields[3]] },
            kzg_commitment: [fields[4], fields[5]],
        }
    }
}

impl Eq for BlobPublicInputs {
    fn eq(self, other: Self) -> bool {
        (self.z == other.z) & (self.y.eq(other.y)) & (self.kzg_commitment.eq(other.kzg_commitment))
    }
}
