// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";

// docs:start:verifier_interface
/// @notice Interface for zkEmail's proof verifier.
/// The verifier checks a ZK proof that a DKIM-signed email contained specific headers.
/// See https://prove.email for the reference implementation.
interface IEmailProofVerifier {
    function verifyProof(
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) external view returns (bool);
}
// docs:end:verifier_interface

// docs:start:portal_contract
contract EmailClaimPortal {
    IRegistry public registry;
    bytes32 public l2Bridge;

    IRollup public rollup;
    IInbox public inbox;
    uint256 public rollupVersion;

    /// zkEmail's onchain proof verifier.
    IEmailProofVerifier public emailVerifier;

    /// Tracks email nullifiers to prevent the same email from being claimed twice.
    mapping(bytes32 => bool) public usedNullifiers;

    /// Trusted DKIM public key hashes. Only emails signed by keys in this set are accepted.
    mapping(bytes32 => bool) public trustedDkimKeyHashes;

    address public owner;

    function initialize(
        address _registry,
        bytes32 _l2Bridge,
        address _emailVerifier
    ) external {
        require(owner == address(0), "Already initialized");
        owner = msg.sender;
        registry = IRegistry(_registry);
        l2Bridge = _l2Bridge;
        emailVerifier = IEmailProofVerifier(_emailVerifier);

        rollup = IRollup(address(registry.getCanonicalRollup()));
        inbox = rollup.getInbox();
        rollupVersion = rollup.getVersion();
    }

    /// Register a DKIM public key hash as trusted. In production this would be read from
    /// a DKIM registry; here we keep it simple with an owner-managed allowlist.
    function registerDkimKeyHash(bytes32 keyHash) external {
        require(msg.sender == owner, "Only owner");
        trustedDkimKeyHashes[keyHash] = true;
    }
    // docs:end:portal_contract

    // docs:start:verify_and_send
    /// Verify an email proof and send an L1->L2 message to the claim contract on Aztec.
    ///
    /// The proof's public inputs are 6 fields produced by the email claim circuit:
    ///   [0-1] DKIM public key hash (two fields, since RSA keys are large)
    ///   [2]   Sender email address hash (Poseidon hash of the From address bytes)
    ///   [3]   Partial note commitment (parsed from the email subject line)
    ///   [4]   Amount (parsed from the email subject line)
    ///   [5]   Email nullifier (hash of the DKIM signature, prevents reuse)
    ///
    /// @param proof The ZK proof bytes from the email circuit prover.
    /// @param publicInputs The 6 public outputs from the email circuit.
    /// @param secretHash The secret hash for L1->L2 message consumption on Aztec.
    function verifyAndSendToL2(
        bytes calldata proof,
        bytes32[6] calldata publicInputs,
        bytes32 secretHash
    ) external returns (bytes32, uint256) {
        // 1. Verify the ZK proof of the DKIM-signed email.
        bytes32[] memory inputs = new bytes32[](6);
        for (uint256 i = 0; i < 6; i++) {
            inputs[i] = publicInputs[i];
        }
        require(emailVerifier.verifyProof(proof, inputs), "Invalid email proof");

        // 2. Check the DKIM key is trusted.
        bytes32 dkimKeyHash = keccak256(abi.encode(publicInputs[0], publicInputs[1]));
        require(trustedDkimKeyHashes[dkimKeyHash], "Untrusted DKIM key");

        // 3. Check and consume the email nullifier.
        bytes32 nullifier = publicInputs[5];
        require(!usedNullifiers[nullifier], "Email already claimed");
        usedNullifiers[nullifier] = true;

        // 4. Send L1->L2 message encoding (from_address_hash, commitment, amount).
        //    The L2 contract reconstructs this exact hash to consume the message.
        DataStructures.L2Actor memory actor = DataStructures.L2Actor(l2Bridge, rollupVersion);
        bytes32 contentHash = Hash.sha256ToField(
            abi.encode(publicInputs[2], publicInputs[3], publicInputs[4])
        );

        (bytes32 key, uint256 index) = inbox.sendL2Message(actor, contentHash, secretHash);
        return (key, index);
    }
    // docs:end:verify_and_send
}
