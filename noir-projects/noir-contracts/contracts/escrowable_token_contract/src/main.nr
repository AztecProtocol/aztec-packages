mod types;

/*
* This is a fairly limited token. It is here to testing for escrowing, but not much more than that currently.
* Do not have a shield from public and then redeem. Just using a shield_from_private directly, but need to be called in private.
*/
contract EscrowableToken {
    // Libs

    use dep::compressed_string::FieldCompressedString;

    use dep::aztec::{
        hash::compute_secret_hash,
        prelude::{NoteGetterOptions, Map, PublicMutable, SharedImmutable, PrivateSet, AztecAddress}
    };

    use dep::authwit::{auth::{assert_current_call_valid_authwit, assert_current_call_valid_authwit_public}};

    use crate::types::{token_note::{TokenNote, TOKEN_NOTE_LEN}, balances_map::BalancesMap};
    use crate::types::option_address::AztecAddressOption;

    #[aztec(storage)]
    struct Storage {
        admin: SharedImmutable<AztecAddress>,
        symbol: SharedImmutable<FieldCompressedString>,
        name: SharedImmutable<FieldCompressedString>,
        decimals: SharedImmutable<u8>,
        balances: BalancesMap<TokenNote>,
        public_balances: Map<AztecAddress, PublicMutable<U128>>,
        total_supply: PublicMutable<U128>,
    }

    /**
     * Initializes the token with the admin address, name, symbol, and decimals.
     *
     * @param admin: The address of the admin
     * @param name: The name of the token (compressed into 1 Field, max 31 bytes)
     * @param symbol: The symbol of the token (compressed into 1 Field, max 31 bytes)
     * @param decimals: The number of decimals the token has
     */
    #[aztec(public)]
    #[aztec(initializer)]
    fn constructor(admin: AztecAddress, name: str<31>, symbol: str<31>, decimals: u8) {
        assert(!admin.is_zero(), "invalid admin");
        storage.admin.initialize(admin);
        storage.name.initialize(FieldCompressedString::from_string(name));
        storage.symbol.initialize(FieldCompressedString::from_string(symbol));
        storage.decimals.initialize(decimals);
    }

    /**
     * Increases the total supply and the public balance of `to` by `amount`
     * 
     * Only callable by the admin.
     * 
     * @param to: The recipient of the assets
     * @param amount: The amount to mint 
     */
    #[aztec(public)]
    fn mint_public(to: AztecAddress, amount: Field) {
        assert(storage.admin.read_public() == context.msg_sender(), "caller is not admin");
        let amount = U128::from_integer(amount);
        let new_balance = storage.public_balances.at(to).read().add(amount);
        let supply = storage.total_supply.read().add(amount);

        storage.public_balances.at(to).write(new_balance);
        storage.total_supply.write(supply);
    }

    /**
     * Transfers `amount` from `from` to `to` in public.
     * 
     * Callable by `from` or someone with an authwit created by `from`.
     * Using the nonce for authwit uniqueness.
     * 
     * @param from: The sender of the assets
     * @param to: The recipient of the assets
     * @param amount: The amount to transfer
     * @param nonce: The nonce of the transfer - 0 if not using authwit
     */
    #[aztec(public)]
    fn transfer_public(from: AztecAddress, to: AztecAddress, amount: Field, nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit_public(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        let amount = U128::from_integer(amount);
        let from_balance = storage.public_balances.at(from).read().sub(amount);
        storage.public_balances.at(from).write(from_balance);

        let to_balance = storage.public_balances.at(to).read().add(amount);
        storage.public_balances.at(to).write(to_balance);
    }

    /**
     * Burns `amount` from `from` in public.
     * 
     * Callable by `from` or someone with an authwit created by `from`.
     * Using the nonce for authwit uniqueness.
     * 
     * @param from: The address to burn from
     * @param amount: The amount to burn
     * @param nonce: The nonce of the burn - 0 if not using authwit
     */
    #[aztec(public)]
    fn burn_public(from: AztecAddress, amount: Field, nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit_public(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        let amount = U128::from_integer(amount);
        let from_balance = storage.public_balances.at(from).read().sub(amount);
        storage.public_balances.at(from).write(from_balance);

        let new_supply = storage.total_supply.read().sub(amount);
        storage.total_supply.write(new_supply);
    }

    /**
     * Increases the total supply and the private balance of `to` by `amount`
     * 
     * Only callable by the admin.
     * 
     * @param to: The recipient of the assets
     * @param amount: The amount to mint 
     */
    #[aztec(private)]
    fn mint_private(
        to: AztecAddress,
        amount: Field,
        sage: AztecAddressOption,
        klix: AztecAddressOption
    ) {
        assert(storage.admin.read_private() == context.msg_sender(), "caller is not admin");

        EscrowableToken::at(context.this_address())._increase_total_supply(amount).enqueue(&mut context);

        let amount = U128::from_integer(amount);
        storage.balances.add(
            to,
            sage.unwrap_or(to),
            klix.unwrap_or(context.msg_sender()),
            amount
        );
    }

    /**
     * Shield amount tokens from a public sender to a private receiver.
     * 
     * Only callable by the `from` address or someone with an authwit created by `from`.
     * Using the nonce for authwit uniqueness.
     * 
     * Will reduce the public balance of `from` and increase the private balance of `to`.
     * 
     * @param from: The address to shield from
     * @param to: The address to shield to
     * @param amount: The amount to shield
     * @param nonce: The nonce of the shield - 0 if not using authwit
     * @param sage: The address to use for `ivpk` and `npk` for the shielded notes - if not provided, the to address is used
     * @param klix: The address to use for `ovpk` when creating outgoing logs - if not provided, the sender's address is used
     */
    #[aztec(private)]
    fn shield_from_private(
        from: AztecAddress,
        to: AztecAddress,
        amount: Field,
        nonce: Field,
        sage: AztecAddressOption,
        klix: AztecAddressOption
    ) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }
        EscrowableToken::at(context.this_address())._reduce_public_balance(from, amount).enqueue(&mut context);
        let amount = U128::from_integer(amount);
        storage.balances.add(to, sage.unwrap_or(to), klix.unwrap_or(from), amount);
    }

    /**
     * Unshield amount tokens from a private sender to a public receiver.
     * 
     * Only callable by the `from` address or someone with an authwit created by `from`.
     * Using the nonce for authwit uniqueness.
     * 
     * @param from: The address to unshield from
     * @param to: The address to unshield to
     * @param amount: The amount to unshield
     * @param nonce: The nonce of the unshield - 0 if not using authwit
     * @param change_sage: The address to use for `ivpk` and `npk` for change notes - if not provided, the sender's address is used
     * @param klix: The address to use for `ovpk` when creating outgoing logs - if not provided, the sender's address is used
     */
    #[aztec(private)]
    fn unshield(
        from: AztecAddress,
        to: AztecAddress,
        amount: Field,
        nonce: Field,
        change_sage: AztecAddressOption,
        klix: AztecAddressOption
    ) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        storage.balances.sub(
            from,
            change_sage.unwrap_or(from),
            klix.unwrap_or(from),
            U128::from_integer(amount)
        );

        EscrowableToken::at(context.this_address())._increase_public_balance(to, amount).enqueue(&mut context);
    }

    /**
     * Transfers tokens from a sender to a receiver in private.
     *
     * Support for escrowing by explicitly specifying the `sage` and `klix` addresses.
     * 
     * @param from: The address to transfer from (the sender)
     * @param to: The address to transfer to (the recipient)
     * @param amount: The amount to transfer
     * @param nonce: The nonce of the transfer
     * @param change_sage: The address to use for `ivpk` and `npk` for change notes - if not provided, the sender's address is used
     * @param to_sage: The address to use for `ivpk` and `npk` for the to notes - if not provided, the receiver's address is used
     * @param klix: The address to use for `ovpk` when creating outgoing logs - if not provided, the sender's address is used
     */
    #[aztec(private)]
    fn transfer(
        from: AztecAddress,
        to: AztecAddress,
        amount: Field,
        nonce: Field,
        change_sage: AztecAddressOption,
        to_sage: AztecAddressOption,
        klix: AztecAddressOption
    ) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        let amount = U128::from_integer(amount);

        storage.balances.sub(from, change_sage.unwrap_or(from), klix.unwrap_or(from), amount);
        storage.balances.add(to, to_sage.unwrap_or(to), klix.unwrap_or(from), amount);
    }

    /**
     * Burns `amount` from `from` in private.
     * 
     * Callable by `from` or someone with an authwit created by `from`.
     * Using the nonce for authwit uniqueness.
     * 
     * @param from: The address to burn from
     * @param amount: The amount to burn
     * @param nonce: The nonce of the burn - 0 if not using authwit
     * @param change_sage: The address to use for `ivpk` and `npk` for change notes - if not provided, the sender's address is used
     * @param klix: The address to use for `ovpk` when creating outgoing logs - if not provided, the sender's address is used
     */
    #[aztec(private)]
    fn burn(
        from: AztecAddress,
        amount: Field,
        nonce: Field,
        change_sage: AztecAddressOption,
        klix: AztecAddressOption
    ) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        storage.balances.sub(
            from,
            change_sage.unwrap_or(from),
            klix.unwrap_or(from),
            U128::from_integer(amount)
        );

        EscrowableToken::at(context.this_address())._reduce_total_supply(amount).enqueue(&mut context);
    }

    /// Getters /// 

    #[aztec(public)]
    #[aztec(view)]
    fn public_get_admin() -> pub AztecAddress {
        storage.admin.read_public()
    }

    #[aztec(private)]
    #[aztec(view)]
    fn private_get_admin() -> pub AztecAddress {
        storage.admin.read_private()
    }

    #[aztec(public)]
    #[aztec(view)]
    fn public_get_name() -> pub FieldCompressedString {
        storage.name.read_public()
    }

    #[aztec(private)]
    #[aztec(view)]
    fn private_get_name() -> pub FieldCompressedString {
        storage.name.read_private()
    }

    #[aztec(public)]
    #[aztec(view)]
    fn public_get_symbol() -> pub FieldCompressedString {
        storage.symbol.read_public()
    }

    #[aztec(private)]
    #[aztec(view)]
    fn private_get_symbol() -> pub FieldCompressedString {
        storage.symbol.read_private()
    }

    #[aztec(public)]
    #[aztec(view)]
    fn public_get_decimals() -> pub u8 {
        storage.decimals.read_public()
    }

    #[aztec(private)]
    #[aztec(view)]
    fn private_get_decimals() -> pub u8 {
        storage.decimals.read_private()
    }

    #[aztec(public)]
    #[aztec(view)]
    fn total_supply() -> pub Field {
        storage.total_supply.read().to_field()
    }

    #[aztec(public)]
    #[aztec(view)]
    fn balance_of_public(owner: AztecAddress) -> pub Field {
        storage.public_balances.at(owner).read().to_field()
    }

    /// Internal ///

    #[aztec(public)]
    #[aztec(internal)]
    fn _increase_public_balance(to: AztecAddress, amount: Field) {
        let new_balance = storage.public_balances.at(to).read().add(U128::from_integer(amount));
        storage.public_balances.at(to).write(new_balance);
    }

    #[aztec(public)]
    #[aztec(internal)]
    fn _reduce_public_balance(from: AztecAddress, amount: Field) {
        let new_balance = storage.public_balances.at(from).read().sub(U128::from_integer(amount));
        storage.public_balances.at(from).write(new_balance);
    }

    #[aztec(public)]
    #[aztec(internal)]
    fn _increase_total_supply(amount: Field) {
        let new_supply = storage.total_supply.read().add(U128::from_integer(amount));
        storage.total_supply.write(new_supply);
    }

    #[aztec(public)]
    #[aztec(internal)]
    fn _reduce_total_supply(amount: Field) {
        let new_supply = storage.total_supply.read().sub(U128::from_integer(amount));
        storage.total_supply.write(new_supply);
    }

    /// Unconstrained ///

    unconstrained fn balance_of_private(owner: AztecAddress) -> pub Field {
        storage.balances.balance_of(owner).to_integer()
    }
}
