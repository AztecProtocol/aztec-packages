use aztec::macros::aztec;

/// A contract that enables offchain-signed token transfers using a voucher model.
///
/// Bob deposits tokens as fixed-denomination vouchers (like digital banknotes). Recipients create partial
/// notes for themselves, then get Bob to sign the specific commitment offchain. A final transaction
/// consumes the voucher and funds the partial note, all without Bob ever touching the network again.
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

    /// Maximum number of vouchers that can be created in a single deposit call.
    global MAX_VOUCHERS_PER_DEPOSIT: u32 = 10;

    /// Domain separator for voucher ID computation to avoid collisions with other hashes.
    global VOUCHER_ID_SEPARATOR: u32 = 1;

    /// Domain separator for signature message hash computation.
    global MESSAGE_HASH_SEPARATOR: u32 = 2;

    // docs:start:storage
    #[storage]
    struct Storage<Context> {
        /// The token contract that this contract holds vouchers for.
        token: PublicImmutable<AztecAddress, Context>,
        /// Schnorr signing key x-coordinates, keyed by depositor address.
        signing_keys_x: Map<AztecAddress, PublicMutable<Field, Context>, Context>,
        /// Schnorr signing key y-coordinates, keyed by depositor address.
        signing_keys_y: Map<AztecAddress, PublicMutable<Field, Context>, Context>,
        /// Whether a voucher is valid (true) or has been consumed (false). Keyed by voucher ID.
        vouchers: Map<Field, PublicMutable<bool, Context>, Context>,
        /// The denomination (token amount) of each voucher. Keyed by voucher ID.
        voucher_denominations: Map<Field, PublicMutable<u128, Context>, Context>,
        /// The depositor who created each voucher. Keyed by voucher ID.
        voucher_owners: Map<Field, PublicMutable<AztecAddress, Context>, Context>,
        /// Tracks the next available voucher index per depositor to ensure unique IDs across deposits.
        next_voucher_index: Map<AztecAddress, PublicMutable<Field, Context>, Context>,
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
    /// Deposits tokens as fixed-denomination vouchers. The caller must have previously authorized this contract
    /// to transfer `denomination * count` tokens via a public authwit on the token contract.
    ///
    /// Each voucher gets a unique ID computed as `hash(depositor, denomination, index)`. The depositor can later
    /// sign these voucher IDs offchain to authorize payments.
    ///
    /// There are no withdrawals: funds only leave via signed vouchers. This prevents the depositor from draining
    /// their balance after signing vouchers, which would cause claims to fail.
    #[external("public")]
    fn deposit(denomination: u128, count: u32, authwit_nonce: Field) {
        assert(count > 0, "Count must be positive");
        assert(count <= MAX_VOUCHERS_PER_DEPOSIT, "Too many vouchers in one deposit");
        assert(denomination > 0, "Denomination must be positive");

        let depositor = self.msg_sender();
        let total_amount = denomination * (count as u128);

        // Transfer tokens from depositor to this contract. Requires a public authwit.
        self.call(Token::at(self.storage.token.read()).transfer_in_public(
            depositor,
            self.address,
            total_amount,
            authwit_nonce,
        ));

        // Create vouchers with sequential indices.
        let start_index = self.storage.next_voucher_index.at(depositor).read();
        for i in 0..MAX_VOUCHERS_PER_DEPOSIT {
            if i < count {
                let index = start_index + (i as Field);
                let voucher_id = poseidon2_hash_with_separator(
                    [depositor.to_field(), denomination.to_field(), index],
                    VOUCHER_ID_SEPARATOR,
                );
                self.storage.vouchers.at(voucher_id).write(true);
                self.storage.voucher_denominations.at(voucher_id).write(denomination);
                self.storage.voucher_owners.at(voucher_id).write(depositor);
            }
        }
        self.storage.next_voucher_index.at(depositor).write(start_index + (count as Field));
    }
    // docs:end:deposit

    // docs:start:register_signing_key
    /// Registers a Schnorr signing public key for the caller. This key will be used to verify offchain signatures
    /// when vouchers are claimed.
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
    /// inputs. This allows the caller to know the commitment offchain and send it to the voucher owner for
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
    /// Completes a previously-created partial note by verifying the voucher owner's Schnorr signature and
    /// consuming the voucher.
    ///
    /// The voucher owner must have signed `hash(contract_address, voucher_id, partial_note_commitment)` offchain
    /// and handed the signature back to the partial note's creator. Anyone can submit this transaction: the
    /// signer never touches the network.
    ///
    /// Split into two phases:
    /// - Private: verifies Bob's Schnorr signature using a caller-provided public key.
    /// - Public: checks the provided public key matches what's registered for the voucher owner, consumes
    ///   the voucher, and completes the partial note.
    ///
    /// Signature verification happens in private because Schnorr's internal Blake2s is not supported by the
    /// AVM transpiler. The public phase re-validates the public key against storage so that a malicious
    /// caller cannot pass an arbitrary key that happens to match a self-generated signature.
    #[external("private")]
    fn claim_with_signature(
        voucher_id: Field,
        partial_note: PartialUintNote,
        signature: [u8; 64],
        signer_pub_key_x: Field,
        signer_pub_key_y: Field,
    ) {
        // Reconstruct the message hash that the voucher owner should have signed.
        // The commitment is extracted via serialization since the field is crate-private.
        let serialized: [Field; 1] = partial_note.serialize();
        let commitment = serialized[0];
        let message_hash = poseidon2_hash_with_separator(
            [self.address.to_field(), voucher_id, commitment],
            MESSAGE_HASH_SEPARATOR,
        );

        // Verify the Schnorr signature in private (Schnorr's Blake2s is not AVM-compatible).
        let pub_key = std::embedded_curve_ops::EmbeddedCurvePoint {
            x: signer_pub_key_x,
            y: signer_pub_key_y,
            is_infinite: false,
        };
        assert(
            schnorr::verify_signature(pub_key, signature, message_hash.to_be_bytes::<32>()),
            "Invalid signature",
        );

        // Enqueue the public completion. The public phase re-verifies that the signing key we just trusted
        // in private is actually the one registered for the voucher owner.
        self.enqueue_self._verify_key_and_complete(
            voucher_id,
            partial_note,
            signer_pub_key_x,
            signer_pub_key_y,
        );
    }

    /// Public completion step enqueued from `claim_with_signature`.
    ///
    /// Verifies that the signing key used to produce the signature (trusted by the private phase) matches
    /// the key registered for the voucher owner, consumes the voucher, and completes the partial note.
    #[external("public")]
    #[only_self]
    fn _verify_key_and_complete(
        voucher_id: Field,
        partial_note: PartialUintNote,
        signer_pub_key_x: Field,
        signer_pub_key_y: Field,
    ) {
        // Look up the voucher.
        assert(self.storage.vouchers.at(voucher_id).read(), "Voucher is invalid or already used");
        let denomination = self.storage.voucher_denominations.at(voucher_id).read();
        let owner = self.storage.voucher_owners.at(voucher_id).read();

        // Check that the public key used for signature verification matches the registered key.
        let registered_x = self.storage.signing_keys_x.at(owner).read();
        let registered_y = self.storage.signing_keys_y.at(owner).read();
        assert(
            (registered_x != 0) | (registered_y != 0),
            "Voucher owner has not registered a signing key",
        );
        assert(
            (signer_pub_key_x == registered_x) & (signer_pub_key_y == registered_y),
            "Signing key does not match registered key",
        );

        // Consume the voucher. It can never be used again.
        self.storage.vouchers.at(voucher_id).write(false);

        // Complete the partial note with the voucher's denomination amount.
        partial_note.complete(
            self.context,
            self.address, // completer is this contract (must match what was set in create_claim)
            self.storage.balances.get_storage_slot(),
            denomination,
        );
    }
    // docs:end:claim_with_signature

    // docs:start:view_functions
    #[external("public")]
    #[view]
    fn is_voucher_valid(voucher_id: Field) -> pub bool {
        self.storage.vouchers.at(voucher_id).read()
    }

    #[external("public")]
    #[view]
    fn get_voucher_denomination(voucher_id: Field) -> pub u128 {
        self.storage.voucher_denominations.at(voucher_id).read()
    }

    #[external("public")]
    #[view]
    fn get_voucher_owner(voucher_id: Field) -> pub AztecAddress {
        self.storage.voucher_owners.at(voucher_id).read()
    }

    #[external("utility")]
    unconstrained fn get_private_balance(owner: AztecAddress) -> pub u128 {
        self.storage.balances.at(owner).balance_of()
    }
    // docs:end:view_functions
}
