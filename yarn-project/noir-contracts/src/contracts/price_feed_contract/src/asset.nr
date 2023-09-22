use dep::aztec::types::type_serialisation::TypeSerialisationInterface;

struct Asset {
    price: u120,
}

global ASSET_serializeD_LEN: Field = 1;

fn deserializeAsset(fields: [Field; ASSET_serializeD_LEN]) -> Asset {
    Asset {
        price: fields[0] as u120,
    }
}

fn serializeAsset(asset: Asset) -> [Field; ASSET_serializeD_LEN] {
    [asset.price as Field]
}

impl Asset {
    fn serialize(self: Self) -> [Field; ASSET_serializeD_LEN] {
        serializeAsset(self)
    }
}

global AssetSerialisationMethods = TypeSerialisationInterface {
    deserialize: deserializeAsset,
    serialize: serializeAsset,
};
