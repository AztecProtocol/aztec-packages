/// Specifies the configuration parameters for message delivery. There are two fundamental aspects to consider:
///
/// +----------------------------------------------------------------------------------------------------------+
/// | 1. Delivery Mechanism                                                                                    |
/// | - Messages can be delivered either onchain or offchain                                               |
/// | - Onchain delivery uses the Aztec protocol's private log stream, submitted to L1 blobs and consuming DA |
/// | - Offchain delivery is implemented by the application (e.g. storing ciphertexts in cloud storage)     |
/// | - Offchain delivery cannot have any cryptographic constraints since messages are never stored onchain|
/// +----------------------------------------------------------------------------------------------------------+
///
/// For onchain delivery, we must also consider:
///
/// +----------------------------------------------------------------------------------------------------------+
/// | 2. Message Encryption and Tagging                                                                        |
/// | - Messages can use either constrained or unconstrained encryption                                        |
/// | - Constrained encryption guarantees the ciphertext is formed correctly but costs more in constraints,    |
/// |   which results in slower proving times                                                                  |
/// | - Unconstrained encryption trusts the sender but is cheaper constraint-wise and hence faster to prove    |
/// | - Tagging is an indexing mechanism that helps recipients locate their messages                           |
/// | - If tagging is not performed correctly by the sender, the recipient will not be able to find the message|
/// +----------------------------------------------------------------------------------------------------------+
///
/// For offchain delivery, constrained encryption is not relevant since it doesn't provide any additional guarantees
/// over unconstrained encryption and is slower to prove (requiring more constraints).
///
/// There are three available delivery modes described below.
// TODO(#16771): This is now used by notes as well. Move it.
pub struct MessageDeliveryEnum {
    /// 1. Constrained Onchain
    /// - Uses constrained encryption and in the future constrained tagging (issue #14565) with onchain delivery
    /// - Provides cryptographic guarantees that recipients can discover and decrypt messages (once #14565 is tackled)
    /// - Slowest proving times since encryption is constrained
    /// - Expensive since it consumes L1 blob space
    /// - Use when smart contracts need to make decisions based on message contents
    /// - Example 1: An escrow contract facilitating a private NFT sale that needs to verify payment before releasing
    ///   the NFT to the buyer.
    /// - Example 2: An application with private configuration where changes must be broadcast to all participants.
    ///   This ensures every user can access the latest configuration. Without notification of config changes,
    ///   users would be unable to read updated variables and therefore blocked from using the application's
    ///   functions. This pattern applies to all critical events that require universal broadcast.
    ///
    /// Safety: Despite being called CONSTRAINED_ONCHAIN, this delivery mode is currently NOT fully constrained.
    /// The tag prefixing is unconstrained, meaning a malicious sender could manipulate the tag to prevent
    /// recipient decryption. TODO(#14565): Implement proper constrained tag prefixing.
    pub CONSTRAINED_ONCHAIN: u8,

    /// 2. Unconstrained Onchain
    /// - Uses unconstrained encryption and tagging with onchain delivery
    /// - Faster proving times since no constraints are used for encryption
    /// - Expensive since it consumes L1 blob space
    /// - Suitable when recipients can verify message validity through other means
    /// - Use this if you don't need the cryptographic guarantees of constrained encryption and tagging but
    ///   don't want to deal with setting up offchain delivery infrastructure as required by mode 3
    /// - Example: Depositing a privately-held NFT into an NFT-sale escrow contract. The buyers know the escrow
    ///   contract's decryption keys, they receive the message onchain and are willing to buy the NFT only if the NFT
    ///   contained in the message is legitimate.
    pub UNCONSTRAINED_ONCHAIN: u8,

    /// 3. Offchain
    /// - Uses unconstrained encryption with offchain delivery
    /// - Lowest cost since no onchain storage is needed and short proving times since no constraints are used
    ///   for encryption
    /// - Suitable when recipients can verify message validity through other means
    /// - Requires setting up custom infrastructure for handling offchain delivery (e.g. cloud storage)
    /// - Example: A payment app where a merchant receives the message offchain and is willing to release the goods
    ///   once he verifies that the payment is correct (i.e. can decrypt the message and verify that it contains
    ///   a legitimate token note - note with note commitment in the note hash tree).
    pub UNCONSTRAINED_OFFCHAIN: u8,
}

pub global MessageDelivery: MessageDeliveryEnum = MessageDeliveryEnum {
    CONSTRAINED_ONCHAIN: 1,
    UNCONSTRAINED_ONCHAIN: 2,
    UNCONSTRAINED_OFFCHAIN: 3,
};
