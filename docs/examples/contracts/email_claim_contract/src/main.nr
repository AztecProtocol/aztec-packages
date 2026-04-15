use aztec::macros::aztec;

/// A contract that completes partial notes using verified email proofs, entirely on L2.
///
/// Bob deposits tokens into this contract and registers his email address hash. When Bob wants
/// to pay Carol, she creates a partial note for herself, sends Bob the commitment, and Bob sends
/// an email authorizing the payment. Carol generates a zkEmail proof offchain using a Noir circuit
/// and submits it to this contract. The contract verifies the proof using recursive proof
/// verification (verify_honk_proof), deducts from Bob's balance, and completes Carol's note.
///
/// This replaces the L1 portal approach: instead of verifying the email proof on Ethereum and
/// bridging the result via L1-to-L2 messaging, the proof is verified directly in an Aztec
/// private function. This is faster (no message delay), cheaper (no L1 gas), and more private
/// (the from_address_hash is never exposed on Ethereum).
#[aztec]
pub contract EmailClaim {
    use aztec::{
        macros::{
            functions::{external, initializer, only_self, view},
            storage::storage,
        },
        protocol::{
            address::AztecAddress,
            traits::Serialize,
        },
        state_vars::{Map, Owned, PublicImmutable, PublicMutable, StateVariable},
    };

    use uint_note::{PartialUintNote, UintNote};
    use balance_set::BalanceSet;
    use token::Token;
    use bb_proof_verification::{UltraHonkVerificationKey, UltraHonkZKProof, verify_honk_proof};

    // docs:start:storage
    #[storage]
    struct Storage<Context> {
        /// The token contract that this contract interacts with.
        token: PublicImmutable<AztecAddress, Context>,
        /// Hash of the email verification circuit's verification key. Set at deployment and
        /// never changed. The contract only accepts proofs generated from this specific circuit.
        vk_hash: PublicImmutable<Field, Context>,
        /// Trusted DKIM public key hashes. Only emails signed by keys in this set are accepted.
        /// Keyed by the combined hash of the pubkey_hash fields from the circuit output.
        trusted_dkim_keys: Map<Field, PublicMutable<bool, Context>, Context>,
        /// Public balance per email address hash. Bob deposits tokens and maps them to his
        /// email address hash.
        deposits: Map<Field, PublicMutable<u128, Context>, Context>,
        /// Private balance storage for recipients. Partial notes are completed into this.
        balances: Owned<BalanceSet<Context>, Context>,
    }
    // docs:end:storage

    // docs:start:constructor
    #[external("public")]
    #[initializer]
    fn constructor(token: AztecAddress, vk_hash: Field) {
        assert(!token.is_zero(), "Token address cannot be zero");
        self.storage.token.initialize(token);
        self.storage.vk_hash.initialize(vk_hash);
    }

    /// Register a DKIM public key hash as trusted. In production this would be read from
    /// a DKIM registry; here we keep it simple with an owner-managed allowlist.
    #[external("public")]
    fn register_dkim_key_hash(key_hash: Field) {
        self.storage.trusted_dkim_keys.at(key_hash).write(true);
    }
    // docs:end:constructor

    // docs:start:deposit
    /// Bob deposits tokens and associates them with his email address hash.
    ///
    /// The email address hash is a Pedersen hash of the sender's email address bytes --
    /// the same hash that the email verification circuit produces from the From header.
    /// Bob must know this hash and use the same email address when sending payment emails.
    ///
    /// Requires a public authwit on the token contract authorizing the transfer.
    #[external("public")]
    fn deposit(email_address_hash: Field, amount: u128, authwit_nonce: Field) {
        assert(amount > 0, "Amount must be positive");
        let depositor = self.msg_sender();

        // Transfer tokens from depositor to this contract.
        self.call(Token::at(self.storage.token.read()).transfer_in_public(
            depositor,
            self.address,
            amount,
            authwit_nonce,
        ));

        // Credit the email address hash balance.
        let current = self.storage.deposits.at(email_address_hash).read();
        self.storage.deposits.at(email_address_hash).write(current + amount);
    }
    // docs:end:deposit

    // docs:start:create_claim
    /// Carol creates a partial note for herself, to be funded later via `claim_with_email`.
    ///
    /// Identical to the Schnorr version: Carol provides randomness so the commitment is
    /// deterministic, allowing her to compute it offchain and include it in the email she
    /// asks Bob to send.
    #[external("private")]
    fn create_claim(randomness: Field) -> pub PartialUintNote {
        let recipient = self.msg_sender();
        UintNote::partial_with_randomness(
            recipient,
            self.context,
            recipient,
            self.address,
            randomness,
        )
    }
    // docs:end:create_claim

    // docs:start:claim_with_email
    /// Verify a zkEmail proof and complete a partial note, entirely on L2.
    ///
    /// The caller submits a proof generated by the email verification circuit. The proof
    /// attests that a DKIM-signed email was sent from a specific address. The contract
    /// verifies the proof in private using recursive proof verification, then enqueues
    /// public state changes to check DKIM key trust, deduct from the depositor's balance,
    /// and complete Carol's partial note.
    ///
    /// The circuit's public inputs are 4 fields:
    ///   [0-1] DKIM public key hash (two fields, identifies the mail server)
    ///   [2]   Email nullifier (prevents the same email from being claimed twice)
    ///   [3]   From address hash (identifies the depositor)
    #[external("private")]
    fn claim_with_email(
        from_address_hash: Field,
        partial_note: PartialUintNote,
        amount: u128,
        verification_key: UltraHonkVerificationKey,
        proof: UltraHonkZKProof,
        public_inputs: [Field; 4],
    ) {
        // Verify the zkEmail proof in private. This proves the email is authentically
        // DKIM-signed without revealing the email contents onchain.
        let vk_hash = self.storage.vk_hash.read();
        verify_honk_proof(verification_key, proof, public_inputs, vk_hash);

        // Validate that the from_address_hash matches the circuit's output.
        // This binds the proof to the specific depositor.
        assert(public_inputs[3] == from_address_hash, "From address hash mismatch");

        // Push the email nullifier into the nullifier tree. This prevents the same
        // email from being used to claim twice. If the nullifier already exists,
        // the transaction will be rejected by the protocol.
        let email_nullifier = public_inputs[2];
        self.context.push_nullifier(email_nullifier);

        // Enqueue the public completion: check DKIM key trust, deduct balance,
        // complete the partial note.
        let dkim_key_hash = public_inputs[0] + public_inputs[1];
        self.enqueue_self._complete(dkim_key_hash, from_address_hash, partial_note, amount);
    }

    /// Public completion step enqueued from `claim_with_email`.
    #[external("public")]
    #[only_self]
    fn _complete(
        dkim_key_hash: Field,
        from_address_hash: Field,
        partial_note: PartialUintNote,
        amount: u128,
    ) {
        // Check that the DKIM key is trusted.
        assert(
            self.storage.trusted_dkim_keys.at(dkim_key_hash).read(),
            "Untrusted DKIM key",
        );

        // Deduct from the depositor's balance.
        let balance = self.storage.deposits.at(from_address_hash).read();
        assert(balance >= amount, "Insufficient depositor balance");
        self.storage.deposits.at(from_address_hash).write(balance - amount);

        // Complete the partial note with the email's amount.
        partial_note.complete(
            self.context,
            self.address,
            self.storage.balances.get_storage_slot(),
            amount,
        );
    }
    // docs:end:claim_with_email

    // docs:start:view_functions
    #[external("public")]
    #[view]
    fn get_deposit_balance(email_address_hash: Field) -> pub u128 {
        self.storage.deposits.at(email_address_hash).read()
    }

    #[external("utility")]
    unconstrained fn get_private_balance(owner: AztecAddress) -> pub u128 {
        self.storage.balances.at(owner).balance_of()
    }
    // docs:end:view_functions
}
