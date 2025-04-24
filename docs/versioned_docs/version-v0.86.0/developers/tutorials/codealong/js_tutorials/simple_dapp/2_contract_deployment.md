# Contract Deployment

To add contracts to your application, we'll start by creating a new `aztec-nargo` project. We'll then compile the contracts, and write a simple script to deploy them to our Sandbox.

:::info
Follow the instructions [here](../../../../getting_started.md) to install `aztec-nargo` if you haven't done so already.
:::

## Initialize Aztec project

Create a new `contracts` folder, and from there, initialize a new project called `token`:

```sh
mkdir contracts && cd contracts
aztec-nargo new --contract token
```

Then, open the `contracts/token/Nargo.toml` configuration file, and add the `aztec.nr` and `value_note` libraries as dependencies:

```toml
[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v0.86.0", directory="noir-projects/aztec-nr/aztec" }
authwit = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v0.86.0", directory="noir-projects/aztec-nr/authwit"}
uint_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v0.86.0", directory="noir-projects/aztec-nr/uint-note" }
compressed_string = {git="https://github.com/AztecProtocol/aztec-packages/", tag="v0.86.0", directory="noir-projects/aztec-nr/compressed-string"}
```

Last, copy-paste the code from the `Token` contract into `contracts/token/main.nr`:

```rust title="token_all" showLineNumbers 
mod types;
mod test;

use dep::aztec::macros::aztec;

// Minimal token implementation that supports `AuthWit` accounts.
// The auth message follows a similar pattern to the cross-chain message and includes a designated caller.
// The designated caller is ALWAYS used here, and not based on a flag as cross-chain.
// message hash = H([caller, contract, selector, ...args])
// To be read as `caller` calls function at `contract` defined by `selector` with `args`
// Including a nonce in the message hash ensures that the message can only be used once.
#[aztec]
pub contract Token {
    // Libs
    use std::{meta::derive, ops::{Add, Sub}};

    use dep::compressed_string::FieldCompressedString;

    use dep::aztec::{
        context::{PrivateCallInterface, PrivateContext},
        event::event_interface::EventInterface,
        macros::{
            events::event,
            functions::{initializer, internal, private, public, utility, view},
            storage::storage,
        },
        messages::logs::{
            event::encode_and_encrypt_event_unconstrained,
            note::{encode_and_encrypt_note, encode_and_encrypt_note_unconstrained},
        },
        prelude::{AztecAddress, Map, PublicContext, PublicImmutable, PublicMutable},
        protocol_types::traits::Serialize,
    };

    use dep::uint_note::uint_note::{PartialUintNote, UintNote};
    use aztec::protocol_types::traits::ToField;

    use dep::authwit::auth::{
        assert_current_call_valid_authwit, assert_current_call_valid_authwit_public,
        compute_authwit_nullifier,
    };

    use crate::types::balance_set::BalanceSet;


    // In the first transfer iteration we are computing a lot of additional information (validating inputs, retrieving
    // keys, etc.), so the gate count is already relatively high. We therefore only read a few notes to keep the happy
    // case with few constraints.
    global INITIAL_TRANSFER_CALL_MAX_NOTES: u32 = 2;
    // All the recursive call does is nullify notes, meaning the gate count is low, but it is all constant overhead. We
    // therefore read more notes than in the base case to increase the efficiency of the overhead, since this results in
    // an overall small circuit regardless.
    global RECURSIVE_TRANSFER_CALL_MAX_NOTES: u32 = 8;

    #[derive(Serialize)]
    #[event]
    struct Transfer {
        from: AztecAddress,
        to: AztecAddress,
        amount: u128,
    }

    #[storage]
    struct Storage<Context> {
        admin: PublicMutable<AztecAddress, Context>,
        minters: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
        balances: Map<AztecAddress, BalanceSet<Context>, Context>,
        total_supply: PublicMutable<u128, Context>,
        public_balances: Map<AztecAddress, PublicMutable<u128, Context>, Context>,
        symbol: PublicImmutable<FieldCompressedString, Context>,
        name: PublicImmutable<FieldCompressedString, Context>,
        decimals: PublicImmutable<u8, Context>,
    }

    #[public]
    #[initializer]
    fn constructor(admin: AztecAddress, name: str<31>, symbol: str<31>, decimals: u8) {
        assert(!admin.is_zero(), "invalid admin");
        storage.admin.write(admin);
        storage.minters.at(admin).write(true);
        storage.name.initialize(FieldCompressedString::from_string(name));
        storage.symbol.initialize(FieldCompressedString::from_string(symbol));
        storage.decimals.initialize(decimals);
    }

    #[public]
    fn set_admin(new_admin: AztecAddress) {
        assert(storage.admin.read().eq(context.msg_sender()), "caller is not admin");
        storage.admin.write(new_admin);
    }

    #[public]
    #[view]
    fn public_get_name() -> FieldCompressedString {
        storage.name.read()
    }

    #[private]
    #[view]
    fn private_get_name() -> FieldCompressedString {
        storage.name.read()
    }

    #[public]
    #[view]
    fn public_get_symbol() -> pub FieldCompressedString {
        storage.symbol.read()
    }

    #[private]
    #[view]
    fn private_get_symbol() -> pub FieldCompressedString {
        storage.symbol.read()
    }

    #[public]
    #[view]
    fn public_get_decimals() -> pub u8 {
        storage.decimals.read()
    }

    #[private]
    #[view]
    fn private_get_decimals() -> pub u8 {
        storage.decimals.read()
    }

    #[public]
    #[view]
    fn get_admin() -> Field {
        storage.admin.read().to_field()
    }

    #[public]
    #[view]
    fn is_minter(minter: AztecAddress) -> bool {
        storage.minters.at(minter).read()
    }

    #[public]
    #[view]
    fn total_supply() -> u128 {
        storage.total_supply.read()
    }

    #[public]
    #[view]
    fn balance_of_public(owner: AztecAddress) -> u128 {
        storage.public_balances.at(owner).read()
    }

    #[public]
    fn set_minter(minter: AztecAddress, approve: bool) {
        assert(storage.admin.read().eq(context.msg_sender()), "caller is not admin");
        storage.minters.at(minter).write(approve);
    }

    #[public]
    fn mint_to_public(to: AztecAddress, amount: u128) {
        assert(storage.minters.at(context.msg_sender()).read(), "caller is not minter");
        let new_balance = storage.public_balances.at(to).read().add(amount);
        let supply = storage.total_supply.read().add(amount);
        storage.public_balances.at(to).write(new_balance);
        storage.total_supply.write(supply);
    }

    #[public]
    fn transfer_in_public(from: AztecAddress, to: AztecAddress, amount: u128, nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit_public(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }
        let from_balance = storage.public_balances.at(from).read().sub(amount);
        storage.public_balances.at(from).write(from_balance);
        let to_balance = storage.public_balances.at(to).read().add(amount);
        storage.public_balances.at(to).write(to_balance);
    }

    #[public]
    fn burn_public(from: AztecAddress, amount: u128, nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit_public(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }
        let from_balance = storage.public_balances.at(from).read().sub(amount);
        storage.public_balances.at(from).write(from_balance);
        let new_supply = storage.total_supply.read().sub(amount);
        storage.total_supply.write(new_supply);
    }

    #[private]
    fn transfer_to_public(from: AztecAddress, to: AztecAddress, amount: u128, nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        storage.balances.at(from).sub(from, amount).emit(encode_and_encrypt_note(
            &mut context,
            from,
            from,
        ));
        Token::at(context.this_address())._increase_public_balance(to, amount).enqueue(&mut context);
    }

    #[private]
    fn transfer(to: AztecAddress, amount: u128) {
        let from = context.msg_sender();

        // We reduce `from`'s balance by amount by recursively removing notes over potentially multiple calls. This
        // method keeps the gate count for each individual call low - reading too many notes at once could result in
        // circuits in which proving is not feasible.
        // Since the sum of the amounts in the notes we nullified was potentially larger than amount, we create a new
        // note for `from` with the change amount, e.g. if `amount` is 10 and two notes are nullified with amounts 8 and
        // 5, then the change will be 3 (since 8 + 5 - 10 = 3).
        let change = subtract_balance(
            &mut context,
            storage,
            from,
            amount,
            INITIAL_TRANSFER_CALL_MAX_NOTES,
        );
        storage.balances.at(from).add(from, change).emit(encode_and_encrypt_note_unconstrained(
            &mut context,
            from,
            from,
        ));
        storage.balances.at(to).add(to, amount).emit(encode_and_encrypt_note_unconstrained(
            &mut context,
            to,
            from,
        ));

        // We don't constrain encryption of the note log in `transfer` (unlike in `transfer_in_private`) because the transfer
        // function is only designed to be used in situations where the event is not strictly necessary (e.g. payment to
        // another person where the payment is considered to be successful when the other party successfully decrypts a
        // note).
        Transfer { from, to, amount }.emit(encode_and_encrypt_event_unconstrained(
            &mut context,
            to,
            from,
        ));
    }

    #[contract_library_method]
    fn subtract_balance(
        context: &mut PrivateContext,
        storage: Storage<&mut PrivateContext>,
        account: AztecAddress,
        amount: u128,
        max_notes: u32,
    ) -> u128 {
        let subtracted = storage.balances.at(account).try_sub(amount, max_notes);
        // Failing to subtract any amount means that the owner was unable to produce more notes that could be nullified.
        // We could in some cases fail early inside try_sub if we detected that fewer notes than the maximum were
        // returned and we were still unable to reach the target amount, but that'd make the code more complicated, and
        // optimizing for the failure scenario is not as important.
        assert(subtracted > 0 as u128, "Balance too low");
        if subtracted >= amount {
            // We have achieved our goal of nullifying notes that add up to more than amount, so we return the change
            subtracted - amount
        } else {
            // try_sub failed to nullify enough notes to reach the target amount, so we compute the amount remaining
            // and try again.
            let remaining = amount - subtracted;
            compute_recurse_subtract_balance_call(*context, account, remaining).call(context)
        }
    }

    // TODO(#7729): apply no_predicates to the contract interface method directly instead of having to use a wrapper
    // like we do here.
    #[no_predicates]
    #[contract_library_method]
    fn compute_recurse_subtract_balance_call(
        context: PrivateContext,
        account: AztecAddress,
        remaining: u128,
    ) -> PrivateCallInterface<25, u128> {
        Token::at(context.this_address())._recurse_subtract_balance(account, remaining)
    }

    #[internal]
    #[private]
    fn _recurse_subtract_balance(account: AztecAddress, amount: u128) -> u128 {
        subtract_balance(
            &mut context,
            storage,
            account,
            amount,
            RECURSIVE_TRANSFER_CALL_MAX_NOTES,
        )
    }

    /**
     * Cancel a private authentication witness.
     * @param inner_hash The inner hash of the authwit to cancel.
     */
    #[private]
    fn cancel_authwit(inner_hash: Field) {
        let on_behalf_of = context.msg_sender();
        let nullifier = compute_authwit_nullifier(on_behalf_of, inner_hash);
        context.push_nullifier(nullifier);
    }

    #[private]
    fn transfer_in_private(from: AztecAddress, to: AztecAddress, amount: u128, nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        storage.balances.at(from).sub(from, amount).emit(encode_and_encrypt_note(
            &mut context,
            from,
            from,
        ));
        storage.balances.at(to).add(to, amount).emit(encode_and_encrypt_note(&mut context, to, from));
    }

    #[private]
    fn burn_private(from: AztecAddress, amount: u128, nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }
        storage.balances.at(from).sub(from, amount).emit(encode_and_encrypt_note(
            &mut context,
            from,
            from,
        ));
        Token::at(context.this_address())._reduce_total_supply(amount).enqueue(&mut context);
    }

    // Transfers token `amount` from public balance of message sender to a private balance of `to`.
    #[private]
    fn transfer_to_private(to: AztecAddress, amount: u128) {
        // `from` is the owner of the public balance from which we'll subtract the `amount`.
        let from = context.msg_sender();
        let token = Token::at(context.this_address());

        // We prepare the private balance increase (the partial note).
        let partial_note = _prepare_private_balance_increase(from, to, &mut context, storage);

        // At last we finalize the transfer. Usage of the `unsafe` method here is safe because we set the `from`
        // function argument to a message sender, guaranteeing that he can transfer only his own tokens.
        token._finalize_transfer_to_private_unsafe(from, amount, partial_note).enqueue(&mut context);
    }

    /// Prepares an increase of private balance of `to` (partial note). The increase needs to be finalized by calling
    /// some of the finalization functions (`finalize_transfer_to_private`, `finalize_mint_to_private`) with the
    /// returned partial note.
    #[private]
    fn prepare_private_balance_increase(to: AztecAddress, from: AztecAddress) -> PartialUintNote {
        // ideally we'd not have `from` here, but we do need a `from` address to produce a tagging secret with `to`.
        _prepare_private_balance_increase(from, to, &mut context, storage)
    }

    /// This function exists separately from `prepare_private_balance_increase` solely as an optimization as it allows
    /// us to have it inlined in the `transfer_to_private` function which results in one fewer kernel iteration.
    ///
    /// TODO(#9180): Consider adding macro support for functions callable both as an entrypoint and as an internal
    /// function.
    #[contract_library_method]
    fn _prepare_private_balance_increase(
        from: AztecAddress, // sender of the tag
        to: AztecAddress,
        context: &mut PrivateContext,
        storage: Storage<&mut PrivateContext>,
    ) -> PartialUintNote {
        let partial_note = UintNote::partial(
            to,
            storage.balances.at(to).set.storage_slot,
            context,
            to,
            from,
        );

        // We can't simply return the partial note because we won't be able to later on verify that it was created
        // correctly (e.g. that the storage slot corresponds to the owner, and that we're using the balance set and not
        // another state variable) once this information is hidden in the partial note commitment. We therefore store
        // the partial note in our own public storage, so that we can later check that we're only completing correctly
        // created partial notes.
        Token::at(context.this_address())._store_balances_set_partial_note(partial_note).enqueue(
            context,
        );

        partial_note
    }

    /// Finalizes a transfer of token `amount` from public balance of `from` to a private balance of `to`.
    /// The transfer must be prepared by calling `prepare_private_balance_increase` first and the resulting
    /// `partial_note` must be passed as an argument to this function.
    #[public]
    fn finalize_transfer_to_private(amount: u128, partial_note: PartialUintNote) {
        let from = context.msg_sender();
        _finalize_transfer_to_private(from, amount, partial_note, &mut context, storage);
    }

    /// This is a wrapper around `_finalize_transfer_to_private` placed here so that a call
    /// to `_finalize_transfer_to_private` can be enqueued. Called unsafe as it does not check `from` (this has to be
    /// done in the calling function).
    #[public]
    #[internal]
    fn _finalize_transfer_to_private_unsafe(
        from: AztecAddress,
        amount: u128,
        partial_note: PartialUintNote,
    ) {
        _finalize_transfer_to_private(from, amount, partial_note, &mut context, storage);
    }

    #[contract_library_method]
    fn _finalize_transfer_to_private(
        from: AztecAddress,
        amount: u128,
        partial_note: PartialUintNote,
        context: &mut PublicContext,
        storage: Storage<&mut PublicContext>,
    ) {
        // First we subtract the `amount` from the public balance of `from`
        let from_balance = storage.public_balances.at(from).read().sub(amount);
        storage.public_balances.at(from).write(from_balance);

        // We verify that the partial note we're completing is valid (i.e. it uses the correct state variable's storage
        // slot, and it is internally consistent). We *could* clear the storage since each partial note should only be
        // used once, but since the AVM offers no gas refunds for doing so this would just make the transaction be more
        // expensive.
        assert(context.storage_read(partial_note.commitment()), "Invalid partial note");
        partial_note.complete(amount, context);
    }

    /// Mints token `amount` to a private balance of `to`. Message sender has to have minter permissions (checked
    /// in the enqueued call).
    #[private]
    fn mint_to_private(
        from: AztecAddress, // sender of the tag
        to: AztecAddress,
        amount: u128,
    ) {
        let token = Token::at(context.this_address());

        // We prepare the partial note to which we'll "send" the minted amount.
        let partial_note = _prepare_private_balance_increase(from, to, &mut context, storage);

        // At last we finalize the mint. Usage of the `unsafe` method here is safe because we set the `from`
        // function argument to a message sender, guaranteeing that only a message sender with minter permissions
        // can successfully execute the function.
        token._finalize_mint_to_private_unsafe(context.msg_sender(), amount, partial_note).enqueue(
            &mut context,
        );
    }

    /// Finalizes a mint of token `amount` to a private balance of `to`. The mint must be prepared by calling
    /// `prepare_private_balance_increase` first and the resulting
    /// `partial_note` must be passed as an argument to this function.
    ///
    /// Note: This function is only an optimization as it could be replaced by a combination of `mint_to_public`
    /// and `finalize_transfer_to_private`. It is however used very commonly so it makes sense to optimize it
    /// (e.g. used during token bridging, in AMM liquidity token etc.).
    #[public]
    fn finalize_mint_to_private(amount: u128, partial_note: PartialUintNote) {
        assert(storage.minters.at(context.msg_sender()).read(), "caller is not minter");

        _finalize_mint_to_private(amount, partial_note, &mut context, storage);
    }

    #[public]
    #[internal]
    fn _finalize_mint_to_private_unsafe(
        from: AztecAddress,
        amount: u128,
        partial_note: PartialUintNote,
    ) {
        // We check the minter permissions as it was not done in `mint_to_private` function.
        assert(storage.minters.at(from).read(), "caller is not minter");
        _finalize_mint_to_private(amount, partial_note, &mut context, storage);
    }

    #[contract_library_method]
    fn _finalize_mint_to_private(
        amount: u128,
        partial_note: PartialUintNote,
        context: &mut PublicContext,
        storage: Storage<&mut PublicContext>,
    ) {
        // First we increase the total supply by the `amount`
        let supply = storage.total_supply.read().add(amount);
        storage.total_supply.write(supply);

        // We verify that the partial note we're completing is valid (i.e. it uses the correct state variable's storage
        // slot, and it is internally consistent). We *could* clear the storage since each partial note should only be
        // used once, but since the AVM offers no gas refunds for doing so this would just make the transaction be more
        // expensive.
        assert(context.storage_read(partial_note.commitment()), "Invalid partial note");
        partial_note.complete(amount, context);
    }

    #[public]
    #[internal]
    fn _store_balances_set_partial_note(partial_note: PartialUintNote) {
        // We store the partial note in a slot equal to its commitment. This is safe because the commitment is computed
        // using a generator different from the one used to compute storage slots, so there can be no collisions.
        // We could consider storing all pending partial notes in e.g. some array, but ultimately this is pointless: all
        // we need to verify is that the note is valid.
        context.storage_write(partial_note.commitment(), true);
    }

    /// Internal ///
    /// TODO(#9180): Consider adding macro support for functions callable both as an entrypoint and as an internal
    /// function.
    #[public]
    #[internal]
    fn _increase_public_balance(to: AztecAddress, amount: u128) {
        _increase_public_balance_inner(to, amount, storage);
    }

    #[contract_library_method]
    fn _increase_public_balance_inner(
        to: AztecAddress,
        amount: u128,
        storage: Storage<&mut PublicContext>,
    ) {
        let new_balance = storage.public_balances.at(to).read().add(amount);
        storage.public_balances.at(to).write(new_balance);
    }

    #[public]
    #[internal]
    fn _reduce_total_supply(amount: u128) {
        // Only to be called from burn.
        let new_supply = storage.total_supply.read().sub(amount);
        storage.total_supply.write(new_supply);
    }

    #[utility]
    pub(crate) unconstrained fn balance_of_private(owner: AztecAddress) -> u128 {
        storage.balances.at(owner).balance_of()
    }
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.86.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L1-L629" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L1-L629</a></sub></sup>


### Helper files

:::info
Remove the `mod test;` line from `contracts/token/src/main.nr` as we will not be using TXE tests in this tutorial.
:::

The `Token` contract also requires some helper files. You can view the files [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/v0.86.0/noir-projects/noir-contracts/contracts/app/token_contract/src). Copy the `types.nr` and the `types` folder into `contracts/token/src`.

## Compile your contract

We'll now use `aztec-nargo` to compile.

Now run the following from your contract folder (containing Nargo.toml):

```sh
aztec-nargo compile
```

## Deploy your contracts

Let's now write a script for deploying your contracts to the Sandbox. We'll create a Private eXecution Environment (PXE) client, and then use the `ContractDeployer` class to deploy our contracts, and store the deployment address to a local JSON file.

Create a new file `src/deploy.mjs`. We import the contract artifacts we have generated plus the dependencies we'll need, and then we can deploy the contracts by adding the following code to the `src/deploy.mjs` file.

```js
// src/deploy.mjs
import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { Contract, createPXEClient, loadContractArtifact, waitForPXE } from '@aztec/aztec.js';
import TokenContractJson from "../contracts/token/target/token-Token.json" assert { type: "json" };
import { writeFileSync } from 'fs';

const TokenContractArtifact = loadContractArtifact(TokenContractJson);

const { PXE_URL = 'http://localhost:8080' } = process.env;

async function main() {
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe);

  const [ownerWallet] = await getInitialTestAccountsWallets(pxe);
  const ownerAddress = ownerWallet.getAddress();

  const token = await Contract.deploy(ownerWallet, TokenContractArtifact, [ownerAddress, 'TokenName', 'TKN', 18])
    .send()
    .deployed();

  console.log(`Token deployed at ${token.address.toString()}`);

  const addresses = { token: token.address.toString() };
  writeFileSync('addresses.json', JSON.stringify(addresses, null, 2));
}

main().catch((err) => {
  console.error(`Error in deployment script: ${err}`);
  process.exit(1);
});
```

Here, we are using the `Contract` class with the compiled artifact to send a new deployment transaction. The `deployed` method will block execution until the transaction is successfully mined, and return a receipt with the deployed contract address.

Note that the token's `constructor()` method expects an `owner` address to set as the contract `admin`. We are using the first account from the Sandbox for this.

:::info
If you are using the generated typescript classes, you can drop the generic `ContractDeployer` in favor of using the `deploy` method of the generated class, which will automatically load the artifact for you and type-check the constructor arguments. See the [How to deploy a contract](../../../../guides/js_apps/deploy_contract.md) page for more info.
:::

Run the snippet above as `node src/deploy.mjs`, and you should see the following output, along with a new `addresses.json` file in your project root:

```text
Token deployed to 0x2950b0f290422ff86b8ee8b91af4417e1464ddfd9dda26de8af52dac9ea4f869
```

## Next steps

Now that we have our contracts set up, it's time to actually [start writing our application that will be interacting with them](./3_contract_interaction.md).
