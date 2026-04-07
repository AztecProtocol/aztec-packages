use aztec::macros::aztec;

/// A contract that completes partial notes using verified email proofs delivered via L1->L2 messaging.
///
/// Bob deposits tokens into this contract and registers his email address hash. When Bob wants to pay
/// Carol, she creates a partial note for herself, sends Bob the commitment, and Bob sends an email
/// with the commitment and amount in the subject line. The email's DKIM signature is verified by a
/// zkEmail proof on L1, and the result is delivered to this contract via cross-chain messaging.
///
/// This replaces the Schnorr signing step in the offchain transfer pattern with a plain email:
/// Bob's mail server is already a signing oracle, and zkEmail turns that signature into a ZK proof.
#[aztec]
pub contract EmailClaim {
    use aztec::{
        macros::{
            functions::{external, initializer, view},
            storage::storage,
        },
        protocol::{
            address::{AztecAddress, EthAddress},
            hash::sha256_to_field,
            traits::Serialize,
        },
        state_vars::{Map, Owned, PublicImmutable, PublicMutable, StateVariable},
    };

    use uint_note::{PartialUintNote, UintNote};
    use balance_set::BalanceSet;
    use token::Token;

    // docs:start:storage
    #[storage]
    struct Storage<Context> {
        /// The token contract that this contract interacts with.
        token: PublicImmutable<AztecAddress, Context>,
        /// The L1 portal contract address (the EmailClaimPortal).
        portal: PublicImmutable<EthAddress, Context>,
        /// Public balance per email address hash. Bob deposits tokens and maps them to his email
        /// hash.
        deposits: Map<Field, PublicMutable<u128, Context>, Context>,
        /// Private balance storage for recipients. Partial notes are completed into this.
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

    #[external("public")]
    fn set_portal(portal: EthAddress) {
        self.storage.portal.initialize(portal);
    }
    // docs:end:constructor

    // docs:start:deposit
    /// Bob deposits tokens and associates them with his email address hash.
    ///
    /// The email address hash is a Poseidon2 hash of the sender's email address bytes --
    /// the same hash that the email proof circuit produces from the From header. Bob must
    /// know this hash and use the same email address when sending payment emails.
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
    /// Consume an L1->L2 message from the email verification portal and complete a partial
    /// note.
    ///
    /// The L1 portal verified a zkEmail proof that Bob sent an email with a subject
    /// line encoding the partial note commitment and token amount.
    ///
    /// The portal then sent an L1->L2 message encoding (from_address_hash, commitment,
    /// amount). This function consumes that message, deducts from Bob's deposited balance,
    /// and completes Carol's partial note.
    ///
    /// Anyone can call this once the L1->L2 message is available (after ~2 L2 blocks).
    #[external("public")]
    fn claim_with_email(
        from_address_hash: Field,
        partial_note: PartialUintNote,
        amount: u128,
        secret: Field,
        message_leaf_index: Field,
    ) {
        // docs:start:content_hash
        // Reconstruct the content hash that the L1 portal sent.
        // Must match: Hash.sha256ToField(abi.encode(fromAddressHash, commitment, amount))
        // abi.encode for three bytes32 values produces 96 bytes (32 each, big-endian).
        let serialized: [Field; 1] = partial_note.serialize();
        let commitment = serialized[0];

        let mut hash_bytes: [u8; 96] = [0; 96];
        let from_bytes: [u8; 32] = from_address_hash.to_be_bytes();
        let commitment_bytes: [u8; 32] = commitment.to_be_bytes();
        let amount_bytes: [u8; 32] = (amount as Field).to_be_bytes();

        for i in 0..32 {
            hash_bytes[i] = from_bytes[i];
            hash_bytes[i + 32] = commitment_bytes[i];
            hash_bytes[i + 64] = amount_bytes[i];
        }

        let content_hash = sha256_to_field(hash_bytes);
        // docs:end:content_hash

        // Consume the L1->L2 message. This proves the portal verified the email proof.
        self.context.consume_l1_to_l2_message(
            content_hash,
            secret,
            self.storage.portal.read(),
            message_leaf_index,
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
