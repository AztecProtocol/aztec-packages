mod asset;

use dep::aztec::macros::aztec;

#[aztec]
pub contract PriceFeed {
    use crate::asset::Asset;
    use dep::aztec::state_vars::{Map, PublicMutable};

    use dep::aztec::macros::{functions::{external, view}, storage::storage};

    // Storage structure, containing all storage, and specifying what slots they use.
    #[storage]
    struct Storage<Context> {
        assets: Map<Field, PublicMutable<Asset, Context>, Context>,
    }

    #[external("public")]
    fn set_price(asset_id: Field, price: u128) {
        let asset = self.storage.assets.at(asset_id);
        asset.write(Asset { price });
    }

    #[external("public")]
    #[view]
    fn get_price(asset_id: Field) -> Asset {
        self.storage.assets.at(asset_id).read()
    }
}
