use aztec::macros::aztec;

/// A contract that completes partial notes using verified email proofs, entirely on L2.
///
/// Bob deposits tokens into this contract and registers his email address hash. When Bob wants
/// to pay Carol, she creates a partial note for herself, sends Bob the commitment, and Bob sends
/// an email authorizing the payment. Carol generates a zkEmail proof offchain using a Noir circuit
/// and submits it to this contract. The contract verifies the proof using recursive proof
/// verification (verify_honk_proof), deducts from Bob's balance, and completes Carol's note.
///
/// The contract enforces a 5-point security model:
///   1. DKIM key binding -- only proofs using a trusted mail server key are accepted
///   2. Recipient binding -- the email must be sent TO the authorized address
///   3. Intent binding -- the email subject must match the expected action
///   4. Single-use enforcement -- each email can only be claimed once (nullifier)
///   5. Freshness -- emails older than max_email_age are rejected
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
        /// Poseidon hash of the trusted DKIM RSA public key modulus.
        /// Proofs must use a key whose hash matches, preventing self-signed forgeries.
        trusted_dkim_key_hash_0: PublicImmutable<Field, Context>,
        /// Poseidon hash of the trusted DKIM RSA public key redc parameter.
        trusted_dkim_key_hash_1: PublicImmutable<Field, Context>,
        /// Maximum allowed age of an email in seconds.
        /// Emails older than this (based on DKIM signing timestamp) are rejected.
        max_email_age: PublicImmutable<Field, Context>,
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
    fn constructor(
        token: AztecAddress,
        vk_hash: Field,
        trusted_dkim_key_hash_0: Field,
        trusted_dkim_key_hash_1: Field,
        max_email_age: Field,
    ) {
        assert(!token.is_zero(), "Token address cannot be zero");
        self.storage.token.initialize(token);
        self.storage.vk_hash.initialize(vk_hash);
        self.storage.trusted_dkim_key_hash_0.initialize(trusted_dkim_key_hash_0);
        self.storage.trusted_dkim_key_hash_1.initialize(trusted_dkim_key_hash_1);
        self.storage.max_email_age.initialize(max_email_age);
    }
    // docs:end:constructor

    // docs:start:deposit
    /// Bob deposits tokens and associates them with his email address hash.
    ///
    /// The email address hash is a Poseidon2 hash of the sender's email address bytes --
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
    /// attests that a DKIM-signed email was sent from a specific sender on a verified
    /// domain, to the correct recipient, with a subject encoding the intended action.
    /// The contract enforces a 6-point security model:
    ///
    ///   1. DKIM key binding: the proof's public key hash must match the trusted key
    ///   2. Sender identification: the from-address hash identifies the depositor
    ///   3. Recipient binding: the email's to-address hash must match the expected recipient
    ///   4. Intent binding: the email's subject hash must match expected_intent_hash
    ///   5. Single-use: the email nullifier prevents the same email from being claimed twice
    ///   6. Freshness: the DKIM timestamp must be recent enough
    ///
    /// The circuit's public inputs are 7 fields:
    ///   [0]   DKIM public key hash (modulus)
    ///   [1]   DKIM public key hash (redc parameter)
    ///   [2]   Email nullifier (prevents replay)
    ///   [3]   Sender (from) address hash (depositor identification)
    ///   [4]   Recipient (to) address hash (recipient binding)
    ///   [5]   Subject hash (intent binding)
    ///   [6]   DKIM signing timestamp (freshness)
    #[external("private")]
    fn claim_with_email(
        expected_recipient_hash: Field,
        expected_intent_hash: Field,
        partial_note: PartialUintNote,
        amount: u128,
        verification_key: UltraHonkVerificationKey,
        proof: UltraHonkZKProof,
        public_inputs: [Field; 7],
    ) {
        // Verify the zkEmail proof in private. This proves the email is authentically
        // DKIM-signed without revealing the email contents onchain.
        let vk_hash = self.storage.vk_hash.read();
        verify_honk_proof(verification_key, proof, public_inputs, vk_hash);

        // 1. DKIM key binding: verify the proof used the trusted mail server key.
        // Without this, an attacker could generate their own RSA keypair,
        // forge a DKIM signature, and produce a valid proof.
        let trusted_key_0 = self.storage.trusted_dkim_key_hash_0.read();
        let trusted_key_1 = self.storage.trusted_dkim_key_hash_1.read();
        assert(
            public_inputs[0] == trusted_key_0,
            "DKIM public key does not match trusted key (modulus)",
        );
        assert(
            public_inputs[1] == trusted_key_1,
            "DKIM public key does not match trusted key (redc)",
        );

        // 2. Sender identification: public_inputs[3] is the Poseidon2 hash of the
        // sender's full email address (e.g. bob@icloud.com). The contract uses this
        // to look up the correct deposit balance in the public completion step.
        let from_address_hash = public_inputs[3];

        // 3. Recipient binding: verify the email was sent to the expected address.
        // This prevents an attacker from using an email sent to a different address.
        assert(
            public_inputs[4] == expected_recipient_hash,
            "Email recipient does not match expected address",
        );

        // 4. Intent binding: verify the email subject matches the expected action.
        // The subject should encode the claim details (amount, commitment, etc.)
        // in a canonical format agreed upon offchain.
        assert(
            public_inputs[5] == expected_intent_hash,
            "Email subject does not match expected intent",
        );

        // 5. Single-use: push the email nullifier to prevent reuse.
        // The nullifier is automatically siloed by the contract address.
        // If this nullifier has already been emitted, the transaction will fail.
        self.context.push_nullifier(public_inputs[2]);

        // 6. Freshness: enqueue a public call to verify the email timestamp is recent.
        // This must be checked in public context where the block timestamp is available.
        let max_email_age = self.storage.max_email_age.read();

        // Enqueue the public completion: check freshness, deduct balance, complete note.
        self.enqueue_self._complete(
            from_address_hash,
            partial_note,
            amount,
            public_inputs[6],
            max_email_age,
        );
    }

    /// Public completion step enqueued from `claim_with_email`.
    #[external("public")]
    #[only_self]
    fn _complete(
        from_address_hash: Field,
        partial_note: PartialUintNote,
        amount: u128,
        email_timestamp: Field,
        max_age: Field,
    ) {
        // 5. Freshness check: reject emails that are too old.
        let current_ts: u64 = self.context.timestamp();
        let email_ts: u64 = email_timestamp as u64;
        let max_age_secs: u64 = max_age as u64;
        assert(current_ts >= email_ts, "Email timestamp is in the future");
        assert(
            current_ts - email_ts <= max_age_secs,
            "Email has expired -- DKIM timestamp is too old",
        );

        // Deduct from the depositor's balance.
        let balance = self.storage.deposits.at(from_address_hash).read();
        assert(balance >= amount, "Insufficient depositor balance");
        self.storage.deposits.at(from_address_hash).write(balance - amount);

        // Complete the partial note with the claimed amount.
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
