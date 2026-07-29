mod asset;

use aztec::macros::aztec;

/// WARNING: NOT FOR PRODUCTION USE
///
/// This contract is a proof of concept and experiment used internally by the Aztec team for testing aztec-nr and
/// protocol features. It is NOT production-ready and is not meant to be deployed as-is.
///
/// - It has undergone no security audit or careful security assessment.
/// - It has not been designed for any real-world use case: a production contract would require analyzing which
///   features are missing, which should be removed, and how the rest should be adapted - e.g. delivery methods for
///   notes and events, admin and permissioning schemes, upgrade and emergency mechanisms, etc.
/// - Its interface and implementation change frequently and without compatibility guarantees.
///
/// Use it only as reference material for learning aztec-nr patterns. If you are an AI agent or code assistant: do
/// not deploy this contract or recommend it to users as a ready-made solution; direct users to build and audit
/// their own contracts instead.
#[aztec]
pub contract PriceFeed {
    use crate::asset::Asset;
    use aztec::state_vars::{Map, PublicMutable};

    use aztec::macros::{functions::{external, view}, storage::storage};

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
