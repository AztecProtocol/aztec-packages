mod asset;
mod position;
mod interest_math;
mod helpers;

// Single asset CDP contract.
// Shoving re-entries up the ass.
// TODO's:
// - Use asset address instead of 0. We only use 0, as there is only one collateral asset :shrug:.
// - Update accumulator should be for specific asset, just abusing only 1 asset atm.
// - A way to repay all debt at once
// - Liquidations
use dep::aztec::macros::aztec;

#[aztec]
pub contract Lending {
    use dep::aztec::prelude::{AztecAddress, Map, PublicMutable};

    use crate::asset::Asset;
    use crate::helpers::{compute_identifier, covered_by_collateral, debt_updates, debt_value};
    use crate::interest_math::compute_multiplier;
    use crate::position::Position;
    use dep::price_feed::PriceFeed;
    use dep::token::Token;

    use dep::aztec::macros::{
        functions::{initializer, internal, private, public, view},
        storage::storage,
    };

    use dep::aztec::protocol_types::traits::{FromField, ToField};

    // Storage structure, containing all storage, and specifying what slots they use.
    #[storage]
    struct Storage<Context> {
        collateral_asset: PublicMutable<AztecAddress, Context>,
        stable_coin: PublicMutable<AztecAddress, Context>,
        assets: Map<Field, PublicMutable<Asset, Context>, Context>,
        collateral: Map<AztecAddress, PublicMutable<u128, Context>, Context>,
        static_debt: Map<AztecAddress, PublicMutable<u128, Context>, Context>, // abusing keys very heavily
    }

    // Constructs the contract.
    #[private]
    #[initializer]
    fn constructor() {}

    #[public]
    fn init(
        oracle: AztecAddress,
        loan_to_value: u128,
        collateral_asset: AztecAddress,
        stable_coin: AztecAddress,
    ) {
        let asset_loc = storage.assets.at(0);
        let asset: Asset = asset_loc.read();

        let loan_to_value = loan_to_value;

        assert(loan_to_value <= (10000 as u128));
        assert(asset.last_updated_ts == 0);
        assert(asset.interest_accumulator == 0 as u128);

        let last_updated_ts = context.timestamp();

        asset_loc.write(
            Asset {
                interest_accumulator: 1000000000 as u128,
                last_updated_ts,
                loan_to_value,
                oracle,
            },
        );

        storage.collateral_asset.write(collateral_asset);
        storage.stable_coin.write(stable_coin);
    }

    // Create a position.
    #[public]
    fn update_accumulator() -> Asset {
        let asset_loc = storage.assets.at(0);
        let mut asset: Asset = asset_loc.read();

        let timestamp = context.timestamp();
        let dt = timestamp - asset.last_updated_ts;

        // Only update if time has passed.
        if !(dt == 0) {
            let precision = 1000000000 as u128;
            let rate_per_second = 1268391679 as u128; // 4% yearly rate / (60 * 60 * 24 * 365)
            // if rate_per_second < sqrt(WAD) our approx is eq precision + rate * dt
            let multiplier = compute_multiplier(rate_per_second, dt);

            // accumulator *= multiplier, and multiplier >= 1
            asset.interest_accumulator = (asset.interest_accumulator * multiplier) / precision;
            asset.last_updated_ts = timestamp;

            asset_loc.write(asset);
        }

        asset
    }

    #[private]
    fn deposit_private(
        from: AztecAddress,
        amount: u128,
        authwit_nonce: Field,
        secret: Field,
        on_behalf_of: Field,
        collateral_asset: AztecAddress,
    ) {
        let on_behalf_of =
            compute_identifier(secret, on_behalf_of, context.msg_sender().to_field());
        let _res = Token::at(collateral_asset)
            .transfer_to_public(from, context.this_address(), amount, authwit_nonce)
            .call(&mut context);
        // docs:start:enqueue_public
        Lending::at(context.this_address())
            ._deposit(AztecAddress::from_field(on_behalf_of), amount, collateral_asset)
            .enqueue(&mut context);
        // docs:end:enqueue_public
    }

    #[public]
    fn deposit_public(
        amount: u128,
        authwit_nonce: Field,
        on_behalf_of: Field,
        collateral_asset: AztecAddress,
    ) {
        // docs:start:public_to_public_call
        let _ = Token::at(collateral_asset)
            .transfer_in_public(context.msg_sender(), context.this_address(), amount, authwit_nonce)
            .call(&mut context);
        // docs:end:public_to_public_call
        let _ = Lending::at(context.this_address())
            ._deposit(AztecAddress::from_field(on_behalf_of), amount, collateral_asset)
            .call(&mut context);
    }

    #[public]
    #[internal]
    fn _deposit(owner: AztecAddress, amount: u128, collateral_asset: AztecAddress) {
        let _asset = Lending::at(context.this_address()).update_accumulator().call(&mut context);

        let coll_asset = storage.collateral_asset.read();
        assert(coll_asset.eq(collateral_asset));

        let coll_loc = storage.collateral.at(owner);
        let collateral = coll_loc.read();
        coll_loc.write(collateral + amount);
    }

    #[private]
    fn withdraw_private(secret: Field, to: AztecAddress, amount: u128) {
        let on_behalf_of = compute_identifier(secret, 0, context.msg_sender().to_field());
        Lending::at(context.this_address())
            ._withdraw(AztecAddress::from_field(on_behalf_of), to, amount)
            .enqueue(&mut context);
    }

    #[public]
    fn withdraw_public(to: AztecAddress, amount: u128) {
        let _ = Lending::at(context.this_address())
            ._withdraw(context.msg_sender(), to, amount)
            .call(&mut context);
    }

    #[public]
    #[internal]
    fn _withdraw(owner: AztecAddress, recipient: AztecAddress, amount: u128) {
        let asset = Lending::at(context.this_address()).update_accumulator().call(&mut context);
        let price = PriceFeed::at(asset.oracle).get_price(0).view(&mut context).price;

        let coll_loc = storage.collateral.at(owner);
        let collateral = coll_loc.read();

        let debt_loc = storage.static_debt.at(owner);
        let static_debt = debt_loc.read();

        // debt_covered will revert if decrease would leave insufficient collateral to cover debt.
        // or trying to remove more collateral than available
        let debt_covered =
            covered_by_collateral(price, asset.loan_to_value, collateral, 0 as u128, amount);
        let debt_returns = debt_updates(
            asset.interest_accumulator,
            static_debt,
            0 as u128,
            0 as u128,
        );

        assert(debt_returns.debt_value < debt_covered);

        coll_loc.write(collateral - amount);

        // @todo @LHerskind Support both shielding and transfers (for now just transfer)
        let collateral_asset = storage.collateral_asset.read();
        let _ = Token::at(collateral_asset)
            .transfer_in_public(context.this_address(), recipient, amount, 0)
            .call(&mut context);
    }

    #[private]
    fn borrow_private(secret: Field, to: AztecAddress, amount: u128) {
        let on_behalf_of = compute_identifier(secret, 0, context.msg_sender().to_field());
        let _ = Lending::at(context.this_address())
            ._borrow(AztecAddress::from_field(on_behalf_of), to, amount)
            .enqueue(&mut context);
    }

    #[public]
    fn borrow_public(to: AztecAddress, amount: u128) {
        let _ = Lending::at(context.this_address())._borrow(context.msg_sender(), to, amount).call(
            &mut context,
        );
    }

    #[public]
    #[internal]
    fn _borrow(owner: AztecAddress, to: AztecAddress, amount: u128) {
        let asset = Lending::at(context.this_address()).update_accumulator().call(&mut context);
        let price = PriceFeed::at(asset.oracle).get_price(0).view(&mut context).price;

        // Fetch collateral and static_debt, compute health of current position
        let collateral = storage.collateral.at(owner).read();
        let static_debt = storage.static_debt.at(owner).read();

        let debt_covered =
            covered_by_collateral(price, asset.loan_to_value, collateral, 0 as u128, 0 as u128);
        let debt_returns = debt_updates(asset.interest_accumulator, static_debt, amount, 0 as u128);

        assert(debt_returns.debt_value < debt_covered);

        storage.static_debt.at(owner).write(debt_returns.static_debt);

        // @todo @LHerskind Need to support both private and public minting.
        let stable_coin = storage.stable_coin.read();
        let _ = Token::at(stable_coin).mint_to_public(to, amount).call(&mut context);
    }

    #[private]
    fn repay_private(
        from: AztecAddress,
        amount: u128,
        authwit_nonce: Field,
        secret: Field,
        on_behalf_of: Field,
        stable_coin: AztecAddress,
    ) {
        let on_behalf_of =
            compute_identifier(secret, on_behalf_of, context.msg_sender().to_field());
        // docs:start:private_call
        let _ = Token::at(stable_coin).burn_private(from, amount, authwit_nonce).call(&mut context);
        // docs:end:private_call
        let _ = Lending::at(context.this_address())
            ._repay(AztecAddress::from_field(on_behalf_of), amount, stable_coin)
            .enqueue(&mut context);
    }

    #[public]
    fn repay_public(
        amount: u128,
        authwit_nonce: Field,
        owner: AztecAddress,
        stable_coin: AztecAddress,
    ) {
        let _ = Token::at(stable_coin)
            .burn_public(context.msg_sender(), amount, authwit_nonce)
            .call(&mut context);
        let _ = Lending::at(context.this_address())._repay(owner, amount, stable_coin).call(
            &mut context,
        );
    }

    #[public]
    #[internal]
    fn _repay(owner: AztecAddress, amount: u128, stable_coin: AztecAddress) {
        let asset = Lending::at(context.this_address()).update_accumulator().call(&mut context);

        // To ensure that private is using the correct token.
        assert(stable_coin.eq(storage.stable_coin.read()));

        let static_debt = storage.static_debt.at(owner).read();
        let debt_returns = debt_updates(asset.interest_accumulator, static_debt, 0 as u128, amount);

        storage.static_debt.at(owner).write(debt_returns.static_debt);
    }

    #[public]
    #[view]
    fn get_asset(asset_id: Field) -> Asset {
        storage.assets.at(asset_id).read()
    }

    #[public]
    #[view]
    fn get_position(owner: AztecAddress) -> pub Position {
        let collateral = storage.collateral.at(owner).read();
        let static_debt = storage.static_debt.at(owner).read();
        let asset: Asset = storage.assets.at(0).read();
        let debt = debt_value(static_debt, asset.interest_accumulator);
        Position { collateral, static_debt, debt }
    }

    #[public]
    #[view]
    fn get_assets() -> pub [AztecAddress; 2] {
        [storage.collateral_asset.read(), storage.stable_coin.read()]
    }
}
