use dep::aztec::protocol_types::traits::{Deserialize, Packable, Serialize};

pub struct Asset {
    price: U128,
}

global ASSET_SERIALIZED_LEN: u32 = 2;

impl Serialize<ASSET_SERIALIZED_LEN> for Asset {
    fn serialize(asset: Asset) -> [Field; ASSET_SERIALIZED_LEN] {
        [asset.price.lo, asset.price.hi]
    }
}

impl Deserialize<ASSET_SERIALIZED_LEN> for Asset {
    fn deserialize(fields: [Field; ASSET_SERIALIZED_LEN]) -> Asset {
        let price = U128 { lo: fields[0], hi: fields[1] };
        Asset { price }
    }
}

global ASSET_PACKED_LEN: u32 = 1;

impl Packable<ASSET_PACKED_LEN> for Asset {
    fn pack(self) -> [Field; ASSET_PACKED_LEN] {
        self.price.pack()
    }

    fn unpack(fields: [Field; ASSET_PACKED_LEN]) -> Self {
        Self { price: U128::unpack(fields) }
    }
}
