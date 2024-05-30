mod types;

/*
 * 
 * Escrowable Token (partial implementation)
 * 
 * The following is a partial implementation of an escrowable token.
 * Partial in the sense that it does not (yet) support all the features of a full token, but just
 * enough to showcase some of the oddities of escrowing.
 *
 * Escrowable here being that the "owner" of a "balance" might be different from the actor
 * who is actually able to use the funds.
 * 
 * In public state, most contracts will escrow funds, one example on this is uniswap. 
 * The contract escrow funds for some duration of time (potentially transient to just one tx), and within that period 
 * it defines the rules for how it is spend (still following the tokens own rules).
 * 
 * This is all good and dandy, but when moving to private state, this becomes significantly more tricky.
 * Recall in private you have both an "owner" as specified by the business logic, but also an actor
 * that is able to produce the nullifier.
 * 
 * To clarify, when I'm saying `owner` I'm referring to the address in the `balances`, e.g., 
 * `balances.at(alice)` is the set of notes that `alice` owns.
 *
 * Most often `alice` will also be the actor that is able to produce the nullifier for her notes.
 * However, if escrowing, this might no longer be the case. 
 *
 * An example would be a `vault` such as the `SimpleEscrow` contract. 
 * The contract "owns" the tokens, but it doesn't have any nullifier keys itself, and relies on `alice` to provide them.
 * Since the notes need to specify a nullifier public masterkey hash `npk_m_hash` to ensure that notes cannot
 * be double spent, we need to support the case where `vault` is the `owner` but `alice`s keys are used for `npk_m_hash`
 * 
 * Furthermore, to support the `incoming` and `outgoing` logs, we need to provie values for these. Note that 
 * we want to use the address that maps to `npk_m_hash` for the `ivpk` as well, since we want to ensure that the 
 * actor that can nullify the note, will also learn about the notes existence - otherwise it doesn't matter much.
 * 
 * The address mapping to `ovpk` is a bit more tricky, since it doesn't necessarily match any of the other addresses.
 * In most "direct" user to user transfers, it will belong to the `msg_sender`, but for escrowing, it might be someone
 * else. It needs to be provided.
 *
 * - `incoming_viewer_and_nullifier` to refer to the address that is used to fetch `ivpk` and `npk` related values
 * - `outgoing_viewer` to refer to the address that is used to fetch `ovpk` related values.
 *
 * Beware, to use `ovpk` one must know the matching secret key `ovsk`, and thus it cannot be used to let "someone"
 * else learn about the notes, unless you are willing to share the `address` that emits the note and the `ovsk_app`
 * with them. If the `address` is not shared, it will be quite difficult to validate the notes emitted, unless also
 * knowing the `ovsk`.
 * 
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
     * Increases the `total_supply` and the public balance of `to` by `amount`
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
     * Transfers `amount` from the public balance of `from` to the public balance of `to`.
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
     * Reduces the public balance of `from` and `total_supply` by `amount`.
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
     * Increases the `total_supply` and the private balance of `to` by `amount`
     * 
     * Only callable by the admin.
     * 
     * @param to: The recipient of the assets
     * @param amount: The amount to mint 
     * @param incoming_viewer_and_nullifier: The address to use for `ivpk` and `npk` for the shielded notes - if not provided, the `to` address is used
     * @param outgoing_viewer: The address to use for `ovpk` when creating outgoing logs - if not provided, the `from` address is used
     */
    #[aztec(private)]
    fn mint_private(
        to: AztecAddress,
        amount: Field,
        incoming_viewer_and_nullifier: AztecAddressOption,
        outgoing_viewer: AztecAddressOption
    ) {
        assert(storage.admin.read_private() == context.msg_sender(), "caller is not admin");

        EscrowableToken::at(context.this_address())._increase_total_supply(amount).enqueue(&mut context);

        let amount = U128::from_integer(amount);
        storage.balances.add(
            to,
            amount,
            incoming_viewer_and_nullifier.unwrap_or(to),
            outgoing_viewer.unwrap_or(context.msg_sender())
        );
    }

    /**
     * Reduce the public balance of `from` and increase the private balance of `to` by `amount`.
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
     * @param incoming_viewer_and_nullifier: The address to use for `ivpk` and `npk` for the shielded notes - if not provided, the `to` address is used
     * @param outgoing_viewer: The address to use for `ovpk` when creating outgoing logs - if not provided, the `from` address is used
     */
    #[aztec(private)]
    fn shield_from_private(
        from: AztecAddress,
        to: AztecAddress,
        amount: Field,
        nonce: Field,
        incoming_viewer_and_nullifier: AztecAddressOption,
        outgoing_viewer: AztecAddressOption
    ) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }
        EscrowableToken::at(context.this_address())._reduce_public_balance(from, amount).enqueue(&mut context);
        let amount = U128::from_integer(amount);
        storage.balances.add(to, amount, incoming_viewer_and_nullifier.unwrap_or(to), outgoing_viewer.unwrap_or(from));
    }

    /**
     * Reduce the private balance of `from` and increase the public balance of `to` by `amount`.
     * 
     * Only callable by the `from` address or someone with an authwit created by `from`.
     * Using the nonce for authwit uniqueness.
     * 
     * @param from: The address to unshield from
     * @param to: The address to unshield to
     * @param amount: The amount to unshield
     * @param nonce: The nonce of the unshield - 0 if not using authwit
     * @param change_incoming_viewer_and_nullifier: The address to use for `ivpk` and `npk` for change notes - if not provided, the `from` address is used
     * @param outgoing_viewer: The address to use for `ovpk` when creating outgoing logs - if not provided, the `from` address is used
     */
    #[aztec(private)]
    fn unshield(
        from: AztecAddress,
        to: AztecAddress,
        amount: Field,
        nonce: Field,
        change_incoming_viewer_and_nullifier: AztecAddressOption,
        outgoing_viewer: AztecAddressOption
    ) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        storage.balances.sub(
            from,
            U128::from_integer(amount),
            change_incoming_viewer_and_nullifier.unwrap_or(from),
            outgoing_viewer.unwrap_or(from)
        );

        EscrowableToken::at(context.this_address())._increase_public_balance(to, amount).enqueue(&mut context);
    }

    /**
     * Transfers `amount` from the private balance of `from` to the private balance of `to`.
     *
     * Support for escrowing by explicitly specifying the `incoming_viewer_and_nullifier` and `outgoing_viewer` addresses.
     * 
     * @param from: The address to transfer from
     * @param to: The address to transfer to
     * @param amount: The amount to transfer
     * @param nonce: The nonce of the transfer
     * @param change_incoming_viewer_and_nullifier: The address to use for `ivpk` and `npk` for change notes - if not provided, the `from` address is used
     * @param to_incoming_viewer_and_nullifier: The address to use for `ivpk` and `npk` for the to notes - if not provided, the `to` address is used
     * @param outgoing_viewer: The address to use for `ovpk` when creating outgoing logs - if not provided, the `from` address is used
     */
    #[aztec(private)]
    fn transfer(
        from: AztecAddress,
        to: AztecAddress,
        amount: Field,
        nonce: Field,
        change_incoming_viewer_and_nullifier: AztecAddressOption,
        to_incoming_viewer_and_nullifier: AztecAddressOption,
        outgoing_viewer: AztecAddressOption
    ) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        let amount = U128::from_integer(amount);

        storage.balances.sub(from, amount, change_incoming_viewer_and_nullifier.unwrap_or(from), outgoing_viewer.unwrap_or(from));
        storage.balances.add(to, amount, to_incoming_viewer_and_nullifier.unwrap_or(to), outgoing_viewer.unwrap_or(from));
    }

    /**
     * Reduces the private balance of `from` and `total_supply` by `amount`.
     * 
     * Callable by `from` or someone with an authwit created by `from`.
     * Using the nonce for authwit uniqueness.
     * 
     * @param from: The address to burn from
     * @param amount: The amount to burn
     * @param nonce: The nonce of the burn - 0 if not using authwit
     * @param change_incoming_viewer_and_nullifier: The address to use for `ivpk` and `npk` for change notes - if not provided, the `from` address is used
     * @param outgoing_viewer: The address to use for `ovpk` when creating outgoing logs - if not provided, the `from` address is used
     */
    #[aztec(private)]
    fn burn(
        from: AztecAddress,
        amount: Field,
        nonce: Field,
        change_incoming_viewer_and_nullifier: AztecAddressOption,
        outgoing_viewer: AztecAddressOption
    ) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        storage.balances.sub(
            from,
            U128::from_integer(amount),
            change_incoming_viewer_and_nullifier.unwrap_or(from),
            outgoing_viewer.unwrap_or(from)
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
