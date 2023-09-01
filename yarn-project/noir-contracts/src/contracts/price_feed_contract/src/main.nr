mod storage;

contract PriceFeed {
    use crate::storage::{Storage, Asset};
    use dep::std::option::Option;

    #[aztec(private)]
    fn constructor(){}

    #[aztec(public)]
    fn set_price(
        asset_id: Field,
        price: u120,
    ) {
        let storage = Storage::init(Option::none(), Option::some(&mut context));
        let asset = storage.assets.at(asset_id);
        asset.write(Asset {price: price});

        context.return_values.push(1);
    }

    #[aztec(public)]
    fn get_price(
        asset_id: Field,
    ) {
        let storage = Storage::init(Option::none(), Option::some(&mut context));
        context.return_values.push_array(storage.assets.at(asset_id).read().serialise());
    }

    unconstrained fn fetch_price(
        assetId: Field,
    ) -> Asset {
        let storage = Storage::init(Option::none(), Option::none());
        storage.assets.at(assetId).read()
    }
}
