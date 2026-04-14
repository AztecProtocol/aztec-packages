use aztec::macros::aztec;

/// A contract that enables offchain-signed token transfers using Schnorr signatures and partial notes.
///
/// Bob deposits tokens into the contract and registers a Schnorr signing key. Recipients create partial
/// notes for themselves, then get Bob to sign the specific commitment and amount offchain. A final
/// transaction verifies the signature, deducts from Bob's balance, and funds the partial note -- all
/// without Bob ever touching the network again.
///
/// This bypasses authwit limitations: private authwits require the signer's PXE at execution time, and public
/// authwits require a registry transaction. This pattern requires neither after the initial deposit.
#[aztec]
pub contract OffchainTransfer {
    use aztec::{
        macros::{
            functions::{external, initializer, only_self, view},
            storage::storage,
        },
        protocol::{
            address::AztecAddress,
            hash::poseidon2_hash_with_separator,
            traits::{Serialize, ToField},
        },
        state_vars::{Map, Owned, PublicImmutable, PublicMutable, StateVariable},
    };

    use uint_note::{PartialUintNote, UintNote};
    use balance_set::BalanceSet;
    use token::Token;

    /// Domain separator for signature message hash computation.
    global MESSAGE_HASH_SEPARATOR: u32 = 2;

    // docs:start:storage
    #[storage]
    struct Storage<Context> {
        /// The token contract that this contract interacts with.
        token: PublicImmutable<AztecAddress, Context>,
        /// Schnorr signing key x-coordinates, keyed by depositor address.
        signing_keys_x: Map<AztecAddress, PublicMutable<Field, Context>, Context>,
        /// Schnorr signing key y-coordinates, keyed by depositor address.
        signing_keys_y: Map<AztecAddress, PublicMutable<Field, Context>, Context>,
        /// Public balance per depositor. Bob deposits tokens and they are credited here.
        deposits: Map<AztecAddress, PublicMutable<u128, Context>, Context>,
        /// Private balance storage for recipients. Partial notes are completed into this state variable.
        balances: Owned<BalanceSet<Context>, Context>,
    }
    // docs:end:storage

    // docs:start:constructor
    #[external("public")]
    #[initializer]
    fn constructor(token: AztecAddress) {
        assert(!token.is_zero(), "Token address cannot be zero");
        self.storage.token.initialize(token);
    }
    // docs:end:constructor

    // docs:start:deposit
    /// Deposits tokens into the contract. The caller must have previously authorized this contract
    /// to transfer `amount` tokens via a public authwit on the token contract.
    ///
    /// The deposited amount is credited to the caller's balance. The depositor can later sign
    /// offchain authorizations that allow recipients to claim against this balance.
    ///
    /// There are no withdrawals: funds only leave via signed claims. This prevents the depositor
    /// from draining their balance after signing authorizations, which would cause claims to fail.
    #[external("public")]
    fn deposit(amount: u128, authwit_nonce: Field) {
        assert(amount > 0, "Amount must be positive");

        let depositor = self.msg_sender();

        // Transfer tokens from depositor to this contract. Requires a public authwit.
        self.call(Token::at(self.storage.token.read()).transfer_in_public(
            depositor,
            self.address,
            amount,
            authwit_nonce,
        ));

        // Credit the depositor's balance.
        let current = self.storage.deposits.at(depositor).read();
        self.storage.deposits.at(depositor).write(current + amount);
    }
    // docs:end:deposit

    // docs:start:register_signing_key
    /// Registers a Schnorr signing public key for the caller. This key will be used to verify offchain
    /// signatures when claims are made against the caller's deposited balance.
    #[external("public")]
    fn register_signing_key(pub_key_x: Field, pub_key_y: Field) {
        let sender = self.msg_sender();
        self.storage.signing_keys_x.at(sender).write(pub_key_x);
        self.storage.signing_keys_y.at(sender).write(pub_key_y);
    }
    // docs:end:register_signing_key

    // docs:start:create_claim
    /// Creates a partial note owned by the caller, to be funded later via `claim_with_signature`. The caller
    /// provides the randomness used to compute the commitment, making the commitment deterministic from its
    /// inputs. This allows the caller to know the commitment offchain and send it to the depositor for
    /// signing without needing to query the PXE for the transaction's private return values.
    ///
    /// The randomness should be generated freshly for each partial note. Reusing randomness would link
    /// multiple notes together and leak the owner.
    #[external("private")]
    fn create_claim(randomness: Field) -> pub PartialUintNote {
        let recipient = self.msg_sender();
        UintNote::partial_with_randomness(
            recipient, // note owner
            self.context,
            recipient, // message delivery recipient
            self.address, // completer is this contract
            randomness,
        )
    }
    // docs:end:create_claim

    // docs:start:claim_with_signature
    /// Completes a previously-created partial note by verifying the depositor's Schnorr signature and
    /// deducting from their balance.
    ///
    /// The depositor must have signed `hash(contract_address, depositor, commitment, amount)` offchain
    /// and handed the signature back to the partial note's creator. Anyone can submit this transaction:
    /// the signer never touches the network.
    ///
    /// Split into two phases:
    /// - Private: verifies the depositor's Schnorr signature using a caller-provided public key.
    /// - Public: checks the provided public key matches what's registered for the depositor, deducts
    ///   from their balance, and completes the partial note.
    ///
    /// Signature verification happens in private because Schnorr's internal Blake2s is not supported by the
    /// AVM transpiler. The public phase re-validates the public key against storage so that a malicious
    /// caller cannot pass an arbitrary key that happens to match a self-generated signature.
    #[external("private")]
    fn claim_with_signature(
        depositor: AztecAddress,
        partial_note: PartialUintNote,
        amount: u128,
        signature: [u8; 64],
        signer_pub_key_x: Field,
        signer_pub_key_y: Field,
    ) {
        // Reconstruct the message hash that the depositor should have signed.
        // The commitment is extracted via serialization since the field is crate-private.
        let serialized: [Field; 1] = partial_note.serialize();
        let commitment = serialized[0];
        let message_hash = poseidon2_hash_with_separator(
            [self.address.to_field(), depositor.to_field(), commitment, amount.to_field()],
            MESSAGE_HASH_SEPARATOR,
        );

        // Verify the Schnorr signature in private (Schnorr's Blake2s is not AVM-compatible).
        let pub_key = std::embedded_curve_ops::EmbeddedCurvePoint {
            x: signer_pub_key_x,
            y: signer_pub_key_y,
        };
        assert(
            schnorr::verify_signature(pub_key, signature, message_hash.to_be_bytes::<32>()),
            "Invalid signature",
        );

        // Enqueue the public completion. The public phase re-verifies that the signing key we just trusted
        // in private is actually the one registered for the depositor.
        self.enqueue_self._verify_key_and_complete(
            depositor,
            partial_note,
            amount,
            signer_pub_key_x,
            signer_pub_key_y,
        );
    }

    /// Public completion step enqueued from `claim_with_signature`.
    ///
    /// Verifies that the signing key used to produce the signature (trusted by the private phase) matches
    /// the key registered for the depositor, deducts from their balance, and completes the partial note.
    #[external("public")]
    #[only_self]
    fn _verify_key_and_complete(
        depositor: AztecAddress,
        partial_note: PartialUintNote,
        amount: u128,
        signer_pub_key_x: Field,
        signer_pub_key_y: Field,
    ) {
        // Check that the public key used for signature verification matches the registered key.
        let registered_x = self.storage.signing_keys_x.at(depositor).read();
        let registered_y = self.storage.signing_keys_y.at(depositor).read();
        assert(
            (registered_x != 0) | (registered_y != 0),
            "Depositor has not registered a signing key",
        );
        assert(
            (signer_pub_key_x == registered_x) & (signer_pub_key_y == registered_y),
            "Signing key does not match registered key",
        );

        // Deduct from the depositor's balance.
        let balance = self.storage.deposits.at(depositor).read();
        assert(balance >= amount, "Insufficient depositor balance");
        self.storage.deposits.at(depositor).write(balance - amount);

        // Complete the partial note with the claimed amount.
        partial_note.complete(
            self.context,
            self.address, // completer is this contract (must match what was set in create_claim)
            self.storage.balances.get_storage_slot(),
            amount,
        );
    }
    // docs:end:claim_with_signature

    // docs:start:view_functions
    #[external("public")]
    #[view]
    fn get_deposit_balance(depositor: AztecAddress) -> pub u128 {
        self.storage.deposits.at(depositor).read()
    }

    #[external("utility")]
    unconstrained fn get_private_balance(owner: AztecAddress) -> pub u128 {
        self.storage.balances.at(owner).balance_of()
    }
    // docs:end:view_functions
}
