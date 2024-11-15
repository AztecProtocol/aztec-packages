use crate::unconstrained_config::F;
// TODO(#9982): Replace unconstrained_config with config.
use bigint::BigNum;
use types::{
    constants::{BLOB_PUBLIC_INPUTS, BLOBS_PER_BLOCK},
    traits::{Deserialize, Empty, Serialize},
    utils::reader::Reader,
};

pub struct BlobPublicInputs {
    pub z: Field,
    pub y: F,
    pub kzg_commitment: [Field; 2],
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

// NB: it is much cleaner throughout the protocol circuits to define this struct rather than use a nested array.
// Once we accumulate blob inputs, it should be removed, and we just use BlobPublicInputs::accumulate everywhere.
pub struct BlockBlobPublicInputs {
    pub inner: [BlobPublicInputs; BLOBS_PER_BLOCK],
}

impl Empty for BlockBlobPublicInputs {
    fn empty() -> Self {
        Self { inner: [BlobPublicInputs::empty(); BLOBS_PER_BLOCK] }
    }
}

impl Serialize<BLOB_PUBLIC_INPUTS * BLOBS_PER_BLOCK> for BlockBlobPublicInputs {
    fn serialize(self) -> [Field; BLOB_PUBLIC_INPUTS * BLOBS_PER_BLOCK] {
        let mut fields: BoundedVec<Field, BLOB_PUBLIC_INPUTS * BLOBS_PER_BLOCK> = BoundedVec::new();
        for i in 0..BLOBS_PER_BLOCK {
            fields.extend_from_array(self.inner[i].serialize());
        }
        fields.storage()
    }
}

impl Deserialize<BLOB_PUBLIC_INPUTS * BLOBS_PER_BLOCK> for BlockBlobPublicInputs {
    fn deserialize(fields: [Field; BLOB_PUBLIC_INPUTS * BLOBS_PER_BLOCK]) -> Self {
        let mut reader = Reader::new(fields);
        let item = Self {
            inner: reader.read_struct_array(
                BlobPublicInputs::deserialize,
                [BlobPublicInputs::empty(); BLOBS_PER_BLOCK],
            ),
        };
        reader.finish();
        item
    }
}

impl Eq for BlockBlobPublicInputs {
    fn eq(self, other: Self) -> bool {
        self.inner.eq(other.inner)
    }
}

#[test]
fn serialization_of_empty() {
    let item = BlockBlobPublicInputs::empty();
    let serialized = item.serialize();
    let deserialized = BlockBlobPublicInputs::deserialize(serialized);
    assert(item.eq(deserialized));
}
