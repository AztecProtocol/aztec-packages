---
title: "Cross-Chain Token Swap (L1 <> L2)"
sidebar_position: 2
description: "Build a cross-chain token swap that exits L2, swaps on L1, and deposits the output back to L2 using Aztec's messaging protocol."
references: ["docs/examples/contracts/example_uniswap/*", "docs/examples/solidity/example_swap/*", "docs/examples/ts/example_swap/*"]
---

## Why Build a Cross-Chain Swap?

DeFi liquidity lives on Ethereum L1. Users with tokens on Aztec L2 need a way to access L1 DEXs like Uniswap without manually bridging tokens back and forth. A cross-chain swap automates this: the user initiates the swap on L2, and the protocol handles exiting to L1, performing the swap, and depositing the output back to L2.

This tutorial walks you through building a version of this flow. You will learn how [**L2-to-L1 messages**](../../aztec-nr/framework-description/ethereum_aztec_messaging.md) work and how multiple contracts across two chains coordinate to execute a single user action.

## Prerequisites

Before starting this tutorial, you need:

1. **Aztec local network** running at version v5.0.0-rc.1 -- see [the local network guide](../../../getting_started_on_local_network.md) for setup instructions
2. **Node.js** (v24+) and a package manager (yarn or npm)
3. **Familiarity with the token bridge tutorial** -- this tutorial builds on concepts from [Bridge Your NFT to Aztec](./token_bridge.md), especially portal contracts and cross-chain messaging

:::tip Background Knowledge
If you are new to Aztec's cross-chain architecture, review [Ethereum-Aztec Messaging](../../aztec-nr/framework-description/ethereum_aztec_messaging.md) first. Key concepts used throughout this tutorial:

- **Portals** -- L1 contracts that communicate with L2 contracts via the Aztec messaging protocol
- **L2-to-L1 messages** -- messages sent from Aztec to Ethereum, stored in a Merkle tree and consumed on L1
- **Authorization witnesses (authwit)** -- Aztec's alternative to ERC20 approve/transferFrom ([learn more](../../aztec-nr/framework-description/authentication_witnesses.md))
- **Content hashes** -- cryptographic digests that uniquely identify cross-chain messages, ensuring L1 and L2 agree on message parameters
:::

## Project Setup

This tutorial walks you through three types of contracts (Solidity, Noir, TypeScript) that work together. You will clone the example project and build it as you follow along.

### Clone the Example Code

The example code lives in the Aztec packages repository:

```bash
git clone --depth 1 --branch v5.0.0-rc.1 https://github.com/AztecProtocol/aztec-packages.git
cd aztec-packages/docs/examples
```

### Project Structure

The relevant files are spread across three directories:

```
examples/
├── contracts/
│   └── example_uniswap/
│       ├── Nargo.toml                  # Noir package config
│       └── src/
│           ├── main.nr                 # L2 uniswap contract
│           └── util.nr                 # Content hash helpers
├── solidity/
│   ├── foundry.toml                    # Solidity compiler config
│   └── example_swap/
│       ├── ExampleERC20.sol            # Minimal ERC20 tokens (WETH, DAI)
│       ├── ExampleTokenPortal.sol      # L1 token bridge portal
│       └── ExampleUniswapPortal.sol    # L1 swap orchestrator
└── ts/
    └── example_swap/
        ├── index.ts                    # TypeScript orchestration script
        └── config.yaml                 # Build configuration
```

### Dependencies

**Solidity** (via Foundry import mappings in `foundry.toml`):
- OpenZeppelin ERC20 (`@oz/token/ERC20/`)
- Aztec L1 contracts (`@aztec/core`, `@aztec/governance`)

**Noir** (in `Nargo.toml`):
- `aztec` -- the Aztec Noir framework
- `token` -- the standard Token contract
- `token_bridge` -- the standard TokenBridge contract
- `keccak256` -- for computing Solidity-compatible function selectors

**TypeScript**:
- `@aztec/aztec.js`, `@aztec/accounts`, `@aztec/wallets`, `@aztec/stdlib`
- `@aztec/ethereum`, `@aztec/noir-contracts.js`, `@aztec/foundation`

:::note
The TypeScript script imports compiled Solidity artifacts and a generated Noir artifact (`ExampleUniswapContract`). You will compile both before running the script.
:::

## What You'll Build

```mermaid
graph TB
    subgraph L2["Aztec (L2)"]
        User["User"]
        UniL2["ExampleUniswap<br/>(Noir)"]
        BridgeA["TokenBridge A"]
        BridgeB["TokenBridge B"]
        TokenA["Token A (WETH)"]
        TokenB["Token B (DAI)"]
    end

    subgraph L1["Ethereum (L1)"]
        UniL1["ExampleUniswapPortal<br/>(Solidity)"]
        PortalA["ExampleTokenPortal A"]
        PortalB["ExampleTokenPortal B"]
        ERC20A["WETH (ERC20)"]
        ERC20B["DAI (ERC20)"]
        Outbox["Outbox"]
    end

    User -->|"1. swap_public()"| UniL2
    UniL2 -->|"2. Transfer WETH"| TokenA
    TokenA -->|"3. Return WETH"| UniL2
    UniL2 -->|"4. Exit to L1"| BridgeA
    BridgeA -->|"5. Bridge exit msg"| PortalA
    UniL2 -->|"6. Swap intent msg"| UniL1

    UniL1 -->|"7. Consume bridge exit"| PortalA
    PortalA -->|"8. Release WETH"| ERC20A
    ERC20A -->|"9. WETH to swap"| UniL1
    UniL1 -->|"10. Consume swap intent"| Outbox
    UniL1 -->|"11. Mock swap DAI"| ERC20B
    UniL1 -->|"12. Deposit DAI"| PortalB

    PortalB -->|"13. L1→L2 msg"| BridgeB
    BridgeB -->|"14. Mint DAI"| TokenB
    TokenB -->|"15. DAI to user"| User
```

Each swap generates **two L2-to-L1 messages**, both of which must be consumed on L1 before the swap executes:

1. **Token bridge exit** - Authorizes releasing input tokens from the token portal to the uniswap portal
2. **Swap intent** - Proves the user authorized *this specific swap* with *these exact parameters*

Neither message alone is sufficient. If only the token exit existed, anyone observing it could potentially redirect the swap. If only the swap intent existed, there would be no proof that tokens were actually withdrawn. Together, they create a cryptographic chain of authorization. This two-message pattern is common in Aztec cross-chain applications where multiple independent systems must coordinate.

## Part 1: Token Portal (Solidity)

The token portal handles depositing tokens from L1 to L2 and withdrawing from L2 to L1. This is a simplified version for tutorial purposes -- for a deeper look at how portals work, see the [token bridge tutorial](./token_bridge.md).

```solidity title="example_token_portal" showLineNumbers 
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";

/// @title ExampleTokenPortal
/// @notice Example token portal for tutorial.
contract ExampleTokenPortal {
    using SafeERC20 for IERC20;

    IRegistry public registry;
    IERC20 public underlying;
    bytes32 public l2Bridge;

    IRollup public rollup;
    IOutbox public outbox;
    IInbox public inbox;
    uint256 public rollupVersion;

    /// @dev No access control for simplicity. A production contract should restrict this to the deployer/owner.
    function initialize(address _registry, address _underlying, bytes32 _l2Bridge) external {
        registry = IRegistry(_registry);
        underlying = IERC20(_underlying);
        l2Bridge = _l2Bridge;

        rollup = IRollup(address(registry.getCanonicalRollup()));
        outbox = rollup.getOutbox();
        inbox = rollup.getInbox();
        rollupVersion = rollup.getVersion();
    }
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/solidity/example_swap/ExampleTokenPortal.sol#L4-L41" target="_blank" rel="noopener noreferrer">Source code: docs/examples/solidity/example_swap/ExampleTokenPortal.sol#L4-L41</a></sub></sup>


Key functions:

- `depositToAztecPublic` - Locks ERC20 tokens and sends an L1→L2 message for public minting
- `depositToAztecPrivate` - Same but for private minting
- `withdraw` - Consumes an L2→L1 message and releases tokens

The [registry](../../aztec-nr/framework-description/ethereum_aztec_messaging.md) provides governance-updateable addresses for core Aztec contracts. Rather than hardcoding rollup addresses, portals query the registry, allowing the protocol to upgrade without redeploying all portals.

Each cross-chain message includes a **content hash** -- a `sha256` digest of the function selector and its parameters that uniquely identifies the message. The content hash is computed with `Hash.sha256ToField(abi.encodeWithSignature(...))`, where `abi.encodeWithSignature` prepends a 4-byte function selector (keccak256 of the function signature, per Solidity convention). This makes each message type unique, preventing a deposit message from being confused with a withdrawal message.

```solidity title="deposit_to_aztec_public" showLineNumbers 
/// @notice Deposit tokens and send L1->L2 message for public minting on Aztec
function depositToAztecPublic(bytes32 _to, uint256 _amount, bytes32 _secretHash)
    external
    returns (bytes32, uint256)
{
    DataStructures.L2Actor memory actor = DataStructures.L2Actor(l2Bridge, rollupVersion);

    bytes32 contentHash =
        Hash.sha256ToField(abi.encodeWithSignature("mint_to_public(bytes32,uint256)", _to, _amount));

    underlying.safeTransferFrom(msg.sender, address(this), _amount);

    return inbox.sendL2Message(actor, contentHash, _secretHash);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/solidity/example_swap/ExampleTokenPortal.sol#L43-L59" target="_blank" rel="noopener noreferrer">Source code: docs/examples/solidity/example_swap/ExampleTokenPortal.sol#L43-L59</a></sub></sup>


```solidity title="withdraw" showLineNumbers 
/// @notice Withdraw tokens after consuming an L2->L1 message.
/// @param _numCheckpointsInEpoch The partial-proof depth (1-indexed) the witness was built against.
function withdraw(
    address _recipient,
    uint256 _amount,
    Epoch _epoch,
    uint256 _numCheckpointsInEpoch,
    uint256 _leafIndex,
    bytes32[] calldata _path
) external {
    DataStructures.L2ToL1Msg memory message = DataStructures.L2ToL1Msg({
        sender: DataStructures.L2Actor(l2Bridge, rollupVersion),
        recipient: DataStructures.L1Actor(address(this), block.chainid),
        content: Hash.sha256ToField(
            abi.encodeWithSignature("withdraw(address,uint256,address)", _recipient, _amount, msg.sender)
        )
    });

    outbox.consume(message, _epoch, _numCheckpointsInEpoch, _leafIndex, _path);

    underlying.safeTransfer(_recipient, _amount);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/solidity/example_swap/ExampleTokenPortal.sol#L72-L95" target="_blank" rel="noopener noreferrer">Source code: docs/examples/solidity/example_swap/ExampleTokenPortal.sol#L72-L95</a></sub></sup>


## Part 2: Uniswap Portal (Solidity)

The uniswap portal orchestrates the swap on L1. It consumes two L2→L1 messages, performs the swap, and deposits the output back to L2.

:::note Mock Swap
This tutorial uses a mock 1:1 swap instead of a real Uniswap V3 router. The portal must be pre-funded with output tokens. The important part is the **message-passing pattern**, not the swap itself.
:::

```solidity title="example_uniswap_portal" showLineNumbers 
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {ExampleTokenPortal} from "./ExampleTokenPortal.sol";

/// @title ExampleUniswapPortal
/// @notice Example swap portal for tutorial. Instead of using a real Uniswap V3 router,
///         performs a mock 1:1 swap by transferring pre-funded output tokens.
///         Still demonstrates the core pattern: consuming 2 L2->L1 messages per swap.
contract ExampleUniswapPortal {
    using SafeERC20 for IERC20;

    IRegistry public registry;
    bytes32 public l2UniswapAddress;
    IRollup public rollup;
    IOutbox public outbox;
    uint256 public rollupVersion;

    function initialize(address _registry, bytes32 _l2UniswapAddress) external {
        registry = IRegistry(_registry);
        l2UniswapAddress = _l2UniswapAddress;

        rollup = IRollup(address(registry.getCanonicalRollup()));
        outbox = rollup.getOutbox();
        rollupVersion = rollup.getVersion();
    }
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/solidity/example_swap/ExampleUniswapPortal.sol#L4-L37" target="_blank" rel="noopener noreferrer">Source code: docs/examples/solidity/example_swap/ExampleUniswapPortal.sol#L4-L37</a></sub></sup>


The public swap function consumes two messages and deposits the output:

```solidity title="swap_public" showLineNumbers 
/// @notice Execute a public swap: consume 2 L2->L1 messages, mock-swap, deposit output to L2
/// @dev Message 1: TokenBridge exit (withdraw input tokens to this contract)
///      Message 2: Uniswap swap intent (proves the user authorized this exact swap)
function swapPublic(
    address _inputTokenPortal,
    uint256 _inAmount,
    uint24 _uniswapFeeTier,
    address _outputTokenPortal,
    uint256 _amountOutMinimum,
    bytes32 _aztecRecipient,
    bytes32 _secretHashForL1ToL2Message,
    // Outbox message metadata for the two L2->L1 messages
    Epoch[2] calldata _epochs,
    uint256[2] calldata _numCheckpointsInEpochs,
    uint256[2] calldata _leafIndices,
    bytes32[][2] calldata _paths
) external returns (bytes32, uint256) {
    IERC20 outputAsset = ExampleTokenPortal(_outputTokenPortal).underlying();

    // Message 1: Consume the token bridge exit message (withdraw input tokens)
    ExampleTokenPortal(_inputTokenPortal)
        .withdraw(address(this), _inAmount, _epochs[0], _numCheckpointsInEpochs[0], _leafIndices[0], _paths[0]);

    // Message 2: Consume the uniswap swap intent message
    bytes32 contentHash = Hash.sha256ToField(
        abi.encodeWithSignature(
            "swap_public(address,uint256,uint24,address,uint256,bytes32,bytes32)",
            _inputTokenPortal,
            _inAmount,
            _uniswapFeeTier,
            _outputTokenPortal,
            _amountOutMinimum,
            _aztecRecipient,
            _secretHashForL1ToL2Message
        )
    );

    outbox.consume(
        DataStructures.L2ToL1Msg({
            sender: DataStructures.L2Actor(l2UniswapAddress, rollupVersion),
            recipient: DataStructures.L1Actor(address(this), block.chainid),
            content: contentHash
        }),
        _epochs[1],
        _numCheckpointsInEpochs[1],
        _leafIndices[1],
        _paths[1]
    );

    // Mock swap: 1:1 transfer (this contract must be pre-funded with output tokens)
    uint256 amountOut = _inAmount;
    require(amountOut >= _amountOutMinimum, "Insufficient output amount");

    // Approve output token portal and deposit back to Aztec
    outputAsset.approve(_outputTokenPortal, amountOut);
    return ExampleTokenPortal(_outputTokenPortal)
        .depositToAztecPublic(_aztecRecipient, amountOut, _secretHashForL1ToL2Message);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/solidity/example_swap/ExampleUniswapPortal.sol#L39-L99" target="_blank" rel="noopener noreferrer">Source code: docs/examples/solidity/example_swap/ExampleUniswapPortal.sol#L39-L99</a></sub></sup>


The private swap follows the same pattern but deposits output tokens privately:

```solidity title="swap_private" showLineNumbers 
/// @notice Execute a private swap: same pattern but deposits output privately
function swapPrivate(
    address _inputTokenPortal,
    uint256 _inAmount,
    uint24 _uniswapFeeTier,
    address _outputTokenPortal,
    uint256 _amountOutMinimum,
    bytes32 _secretHashForL1ToL2Message,
    // Outbox message metadata for the two L2->L1 messages
    Epoch[2] calldata _epochs,
    uint256[2] calldata _numCheckpointsInEpochs,
    uint256[2] calldata _leafIndices,
    bytes32[][2] calldata _paths
) external returns (bytes32, uint256) {
    IERC20 outputAsset = ExampleTokenPortal(_outputTokenPortal).underlying();

    // Message 1: Consume the token bridge exit message (withdraw input tokens)
    ExampleTokenPortal(_inputTokenPortal)
        .withdraw(address(this), _inAmount, _epochs[0], _numCheckpointsInEpochs[0], _leafIndices[0], _paths[0]);

    // Message 2: Consume the uniswap swap intent message
    bytes32 contentHash = Hash.sha256ToField(
        abi.encodeWithSignature(
            "swap_private(address,uint256,uint24,address,uint256,bytes32)",
            _inputTokenPortal,
            _inAmount,
            _uniswapFeeTier,
            _outputTokenPortal,
            _amountOutMinimum,
            _secretHashForL1ToL2Message
        )
    );

    outbox.consume(
        DataStructures.L2ToL1Msg({
            sender: DataStructures.L2Actor(l2UniswapAddress, rollupVersion),
            recipient: DataStructures.L1Actor(address(this), block.chainid),
            content: contentHash
        }),
        _epochs[1],
        _numCheckpointsInEpochs[1],
        _leafIndices[1],
        _paths[1]
    );

    // Mock swap: 1:1 transfer
    uint256 amountOut = _inAmount;
    require(amountOut >= _amountOutMinimum, "Insufficient output amount");

    // Approve output token portal and deposit back to Aztec privately
    outputAsset.approve(_outputTokenPortal, amountOut);
    return ExampleTokenPortal(_outputTokenPortal).depositToAztecPrivate(amountOut, _secretHashForL1ToL2Message);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/solidity/example_swap/ExampleUniswapPortal.sol#L101-L155" target="_blank" rel="noopener noreferrer">Source code: docs/examples/solidity/example_swap/ExampleUniswapPortal.sol#L101-L155</a></sub></sup>


### Compile Solidity Contracts

With all Solidity contracts from Part 1 and Part 2 ready, compile them using Foundry. From the `examples/solidity` directory:

```bash
cd solidity
forge build
```

This produces JSON artifacts containing the ABI and bytecode. The TypeScript script imports these artifacts to deploy contracts on L1.

## Part 3: Uniswap Contract (Noir)

The L2 contract handles the user-facing logic: transferring input tokens, calling the bridge to exit to L1, and creating the swap intent message.

### Setup

The contract stores the portal address and imports the `Token` and `TokenBridge` contracts:

```rust title="example_uniswap_setup" showLineNumbers 
mod util;

// Example Uniswap L2 contract for tutorial purposes.
// Demonstrates how to use portal contracts to swap on L1 with funds on L2.
// Has two separate flows for public and private swaps.
use aztec::macros::aztec;

#[aztec]
pub contract ExampleUniswap {
    use aztec::{
        authwit::auth::{
            assert_current_call_valid_authwit_public, compute_authwit_message_hash_from_call,
            set_authorized,
        },
        macros::{functions::{external, initializer, only_self}, storage::storage},
        protocol::{
            abis::function_selector::FunctionSelector,
            address::{AztecAddress, EthAddress},
            traits::ToField,
        },
        state_vars::PublicImmutable,
    };

    use crate::util::{compute_swap_private_content_hash, compute_swap_public_content_hash};
    use token::Token;
    use token_bridge::TokenBridge;

    #[storage]
    struct Storage<Context> {
        portal_address: PublicImmutable<EthAddress, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(portal_address: EthAddress) {
        self.storage.portal_address.initialize(portal_address);
    }
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/contracts/example_uniswap/src/main.nr#L1-L39" target="_blank" rel="noopener noreferrer">Source code: docs/examples/contracts/example_uniswap/src/main.nr#L1-L39</a></sub></sup>


### Public Swap

The public swap transfers tokens from the sender to the contract, exits them to L1 via the bridge, and sends a swap intent message:

:::note Authorization Witnesses
Aztec uses [**authorization witnesses** (authwit)](../../aztec-nr/framework-description/authentication_witnesses.md) instead of the ERC20 approve/transferFrom pattern. The contract computes the hash of the exact action it wants to perform, sets that hash as authorized, then immediately performs the action. This gives fine-grained control - the authorization is for a specific action, not a blanket approval. Since we authorize and spend in the same transaction, replay attacks are impossible.
:::

```rust title="swap_public" showLineNumbers 
#[external("public")]
fn swap_public(
    sender: AztecAddress,
    input_asset_bridge: AztecAddress,
    input_amount: u128,
    output_asset_bridge: AztecAddress,
    // params for the swap
    uniswap_fee_tier: Field,
    minimum_output_amount: u128,
    // params for depositing output_asset back to Aztec
    recipient: AztecAddress,
    secret_hash_for_L1_to_l2_message: Field,
) {
    // If caller is not the sender, check they have approval
    if (!sender.eq(self.msg_sender())) {
        assert_current_call_valid_authwit_public(self.context, sender);
    }

    let input_asset_bridge_config =
        self.view(TokenBridge::at(input_asset_bridge).get_config_public());

    let input_asset = input_asset_bridge_config.token;
    let input_asset_bridge_portal_address = input_asset_bridge_config.portal;

    // Transfer funds from sender to this contract
    // We use a fixed nonce since we authorize and spend in the same public call
    let nonce_for_transfer = 0xdeadbeef;
    let transfer_selector =
        FunctionSelector::from_signature("transfer_in_public((Field),(Field),u128,Field)");
    let transfer_msg_hash = compute_authwit_message_hash_from_call(
        self.address,
        input_asset,
        self.context.chain_id(),
        self.context.version(),
        transfer_selector,
        [sender.to_field(), self.address.to_field(), input_amount as Field, nonce_for_transfer],
    );
    set_authorized(self.context, transfer_msg_hash, true);

    self.call(Token::at(input_asset).transfer_in_public(
        sender,
        self.address,
        input_amount,
        nonce_for_transfer,
    ));

    // Approve bridge to burn this contract's funds and exit to L1 Uniswap Portal.
    // `let _ =` explicitly discards the return value (Noir requires handling all return values).
    let _ = self.call_self._approve_bridge_and_exit_input_asset_to_L1(
        input_asset,
        input_asset_bridge,
        input_amount,
    );

    // Create swap message and send to Outbox for Uniswap Portal
    let output_asset_bridge_portal_address =
        self.view(TokenBridge::at(output_asset_bridge).get_config_public()).portal;

    // Ensure portals exist - else funds might be lost
    assert(
        !input_asset_bridge_portal_address.is_zero(),
        "L1 portal address of input_asset's bridge is 0",
    );
    assert(
        !output_asset_bridge_portal_address.is_zero(),
        "L1 portal address of output_asset's bridge is 0",
    );

    let content_hash = compute_swap_public_content_hash(
        input_asset_bridge_portal_address,
        input_amount,
        uniswap_fee_tier,
        output_asset_bridge_portal_address,
        minimum_output_amount,
        recipient,
        secret_hash_for_L1_to_l2_message,
    );
    self.context.message_portal(self.storage.portal_address.read(), content_hash);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/contracts/example_uniswap/src/main.nr#L41-L121" target="_blank" rel="noopener noreferrer">Source code: docs/examples/contracts/example_uniswap/src/main.nr#L41-L121</a></sub></sup>


### Private Swap

The private swap is similar but uses `transfer_to_public` (private to public transfer) and [`enqueue_self`](../../aztec-nr/framework-description/calling_contracts.md) instead of `call_self`. Because `swap_private` is a private function and `_approve_bridge_and_exit_input_asset_to_L1` is public, it cannot be called synchronously -- private functions execute before public functions in a transaction. `enqueue_self` schedules the public call to run in the public phase of the same transaction:

```rust title="swap_private" showLineNumbers 
#[external("private")]
fn swap_private(
    input_asset: AztecAddress,
    input_asset_bridge: AztecAddress,
    input_amount: u128,
    output_asset_bridge: AztecAddress,
    // params for the swap
    uniswap_fee_tier: Field,
    minimum_output_amount: u128,
    // params for depositing output_asset back to Aztec
    secret_hash_for_L1_to_l2_message: Field,
) {
    let input_asset_bridge_config =
        self.view(TokenBridge::at(input_asset_bridge).get_config());
    let output_asset_bridge_config =
        self.view(TokenBridge::at(output_asset_bridge).get_config());

    // Verify the token address matches the bridge's config
    assert(
        input_asset.eq(input_asset_bridge_config.token),
        "input_asset address is not the same as seen in the bridge contract",
    );

    // Transfer funds from sender to this contract (private -> public)
    // We use a fixed nonce since we authorize and spend in the same tx
    let nonce_for_transfer = 0xdeadbeef;
    self.call(Token::at(input_asset).transfer_to_public(
        self.msg_sender(),
        self.address,
        input_amount,
        nonce_for_transfer,
    ));

    // Approve bridge to burn this contract's funds and exit to L1 Uniswap Portal
    self.enqueue_self._approve_bridge_and_exit_input_asset_to_L1(
        input_asset,
        input_asset_bridge,
        input_amount,
    );

    // Ensure portals exist
    assert(
        !input_asset_bridge_config.portal.is_zero(),
        "L1 portal address of input_asset's bridge is 0",
    );
    assert(
        !output_asset_bridge_config.portal.is_zero(),
        "L1 portal address of output_asset's bridge is 0",
    );

    let content_hash = compute_swap_private_content_hash(
        input_asset_bridge_config.portal,
        input_amount,
        uniswap_fee_tier,
        output_asset_bridge_config.portal,
        minimum_output_amount,
        secret_hash_for_L1_to_l2_message,
    );
    self.context.message_portal(self.storage.portal_address.read(), content_hash);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/contracts/example_uniswap/src/main.nr#L123-L184" target="_blank" rel="noopener noreferrer">Source code: docs/examples/contracts/example_uniswap/src/main.nr#L123-L184</a></sub></sup>


:::note Why no recipient parameter?
In `swap_private`, the recipient is the person that provides the secret used to generate the hash for the L1 to L2 message. This preserves privacy: revealing a recipient address to L1 would compromise the caller's identity. The output tokens are deposited privately to L2, where only the secret holder can claim them.
:::

### Bridge Helper

Both flows share this internal function that approves the bridge to burn tokens and exits them to L1:

```rust title="approve_bridge_and_exit" showLineNumbers 
// Internal helper: approves the bridge to burn this contract's funds and exits to L1.
// Used by both public and private swap flows.
#[external("public")]
#[only_self]
fn _approve_bridge_and_exit_input_asset_to_L1(
    token: AztecAddress,
    token_bridge: AztecAddress,
    amount: u128,
) {
    // Since we authorize and instantly spend in the same public call, reuse a fixed nonce.
    let authwit_nonce = 0xdeadbeef;

    let selector = FunctionSelector::from_signature("burn_public((Field),u128,Field)");
    let message_hash = compute_authwit_message_hash_from_call(
        token_bridge,
        token,
        self.context.chain_id(),
        self.context.version(),
        selector,
        [self.address.to_field(), amount as Field, authwit_nonce],
    );

    set_authorized(self.context, message_hash, true);

    let this_portal_address = self.storage.portal_address.read();
    // Exit to L1 Uniswap Portal
    self.call(TokenBridge::at(token_bridge).exit_to_l1_public(
        this_portal_address,
        amount,
        this_portal_address,
        authwit_nonce,
    ));
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/contracts/example_uniswap/src/main.nr#L186-L220" target="_blank" rel="noopener noreferrer">Source code: docs/examples/contracts/example_uniswap/src/main.nr#L186-L220</a></sub></sup>


:::note Portal Address Validation
The portal address checks are a **safety mechanism**. If either portal is zero (not configured), the funds would be permanently lost. Always validate external addresses before sending irreversible messages.
:::

:::note Fixed nonce safety
The fixed nonce `0xdeadbeef` used throughout this contract is safe because authorization and token spending occur in the same transaction. There's no opportunity for replay attacks since the authorization is set and consumed atomically.
:::

### Content Hash Helpers

These content hashes form the **cross-chain contract interface**. The L2 contract computes a hash of all swap parameters, and the L1 portal reconstructs the same hash from the parameters it receives. If they don't match exactly, the message consumption fails.

This is how L1 verifies that L2 actually authorized the swap - not by trusting a signature, but by independently computing what the message should contain. The hashes must match exactly between L2 (Noir) and L1 (Solidity):

```rust title="swap_public_content_hash" showLineNumbers 
use aztec::protocol::{
    address::{AztecAddress, EthAddress},
    hash::sha256_to_field,
    traits::ToField,
};

// Hash byte sizes: number of fields x 32 bytes + 4 byte selector
// Public: 7 fields (input portal, amount, fee, output portal, min output, recipient, secret hash)
global PUBLIC_SWAP_HASH_SIZE: u32 = 228;
// Private: 6 fields (no recipient - implicit from sender for privacy)
global PRIVATE_SWAP_HASH_SIZE: u32 = 196;

// Computes the L2 to L1 message content hash for the public swap flow.
// Must match the hash computed in ExampleUniswapPortal.sol on L1.
pub fn compute_swap_public_content_hash(
    input_asset_bridge_portal_address: EthAddress,
    input_amount: u128,
    uniswap_fee_tier: Field,
    output_asset_bridge_portal_address: EthAddress,
    minimum_output_amount: u128,
    aztec_recipient: AztecAddress,
    secret_hash_for_L1_to_l2_message: Field,
) -> Field {
    let mut hash_bytes = [0; PUBLIC_SWAP_HASH_SIZE];
    let input_token_portal_bytes: [u8; 32] =
        input_asset_bridge_portal_address.to_field().to_be_bytes();
    let in_amount_bytes: [u8; 32] = input_amount.to_field().to_be_bytes();
    let uniswap_fee_tier_bytes: [u8; 32] = uniswap_fee_tier.to_be_bytes();
    let output_token_portal_bytes: [u8; 32] =
        output_asset_bridge_portal_address.to_field().to_be_bytes();
    let amount_out_min_bytes: [u8; 32] = minimum_output_amount.to_field().to_be_bytes();
    let aztec_recipient_bytes: [u8; 32] = aztec_recipient.to_field().to_be_bytes();
    let secret_hash_for_L1_to_l2_message_bytes: [u8; 32] =
        secret_hash_for_L1_to_l2_message.to_be_bytes();

    // The function selector makes the message unique to this specific call type.
    let selector = comptime {
        keccak256::keccak256(
            "swap_public(address,uint256,uint24,address,uint256,bytes32,bytes32)".as_bytes(),
            67,
        )
    };

    hash_bytes[0] = selector[0];
    hash_bytes[1] = selector[1];
    hash_bytes[2] = selector[2];
    hash_bytes[3] = selector[3];

    for i in 0..32 {
        hash_bytes[i + 4] = input_token_portal_bytes[i];
        hash_bytes[i + 36] = in_amount_bytes[i];
        hash_bytes[i + 68] = uniswap_fee_tier_bytes[i];
        hash_bytes[i + 100] = output_token_portal_bytes[i];
        hash_bytes[i + 132] = amount_out_min_bytes[i];
        hash_bytes[i + 164] = aztec_recipient_bytes[i];
        hash_bytes[i + 196] = secret_hash_for_L1_to_l2_message_bytes[i];
    }

    sha256_to_field(hash_bytes)
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/contracts/example_uniswap/src/util.nr#L1-L62" target="_blank" rel="noopener noreferrer">Source code: docs/examples/contracts/example_uniswap/src/util.nr#L1-L62</a></sub></sup>


```rust title="swap_private_content_hash" showLineNumbers 
// Computes the L2 to L1 message content hash for the private swap flow.
// Must match the hash computed in ExampleUniswapPortal.sol on L1.
pub fn compute_swap_private_content_hash(
    input_asset_bridge_portal_address: EthAddress,
    input_amount: u128,
    uniswap_fee_tier: Field,
    output_asset_bridge_portal_address: EthAddress,
    minimum_output_amount: u128,
    secret_hash_for_L1_to_l2_message: Field,
) -> Field {
    let mut hash_bytes = [0; PRIVATE_SWAP_HASH_SIZE];
    let input_token_portal_bytes: [u8; 32] =
        input_asset_bridge_portal_address.to_field().to_be_bytes();
    let in_amount_bytes: [u8; 32] = input_amount.to_field().to_be_bytes();
    let uniswap_fee_tier_bytes: [u8; 32] = uniswap_fee_tier.to_be_bytes();
    let output_token_portal_bytes: [u8; 32] =
        output_asset_bridge_portal_address.to_field().to_be_bytes();
    let amount_out_min_bytes: [u8; 32] = minimum_output_amount.to_field().to_be_bytes();
    let secret_hash_for_L1_to_l2_message_bytes: [u8; 32] =
        secret_hash_for_L1_to_l2_message.to_be_bytes();

    // The function selector makes the message unique to this specific call type.
    let selector = comptime {
        keccak256::keccak256(
            "swap_private(address,uint256,uint24,address,uint256,bytes32)".as_bytes(),
            60,
        )
    };

    hash_bytes[0] = selector[0];
    hash_bytes[1] = selector[1];
    hash_bytes[2] = selector[2];
    hash_bytes[3] = selector[3];

    for i in 0..32 {
        hash_bytes[i + 4] = input_token_portal_bytes[i];
        hash_bytes[i + 36] = in_amount_bytes[i];
        hash_bytes[i + 68] = uniswap_fee_tier_bytes[i];
        hash_bytes[i + 100] = output_token_portal_bytes[i];
        hash_bytes[i + 132] = amount_out_min_bytes[i];
        hash_bytes[i + 164] = secret_hash_for_L1_to_l2_message_bytes[i];
    }

    sha256_to_field(hash_bytes)
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/contracts/example_uniswap/src/util.nr#L64-L110" target="_blank" rel="noopener noreferrer">Source code: docs/examples/contracts/example_uniswap/src/util.nr#L64-L110</a></sub></sup>


### Compile and Generate Bindings

From the `examples/contracts/example_uniswap` directory, compile the Noir contract and generate TypeScript bindings:

```bash
cd ../contracts/example_uniswap
aztec compile
aztec codegen target -o ../../ts/example_swap/artifacts
```

The `aztec compile` command compiles the Noir contract. The `aztec codegen` command generates a TypeScript class (`ExampleUniswapContract`) from the compiled artifact, which you will use in the deployment script.

:::note
Before proceeding, make sure you have compiled both the Solidity contracts (Part 1-2) and the Noir contract (Part 3). The TypeScript script below imports compiled artifacts from both.
:::

## Install TypeScript Dependencies

From the `examples/ts/example_swap` directory, initialize a project and install the required packages:

```bash
cd ../../ts/example_swap
npm init -y
npm install \
  @aztec/aztec.js@v5.0.0-rc.1 \
  @aztec/accounts@v5.0.0-rc.1 \
  @aztec/wallets@v5.0.0-rc.1 \
  @aztec/stdlib@v5.0.0-rc.1 \
  @aztec/ethereum@v5.0.0-rc.1 \
  @aztec/noir-contracts.js@v5.0.0-rc.1 \
  @aztec/foundation@v5.0.0-rc.1 \
  npm:@aztec/viem@2.38.2 \
  tsx
```

## Part 4: Public Swap Flow (TypeScript)

Now you can tie everything together in a TypeScript script. Start by setting up clients and deploying all contracts:

```typescript title="setup" showLineNumbers 
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { AztecAddress, EthAddress } from "@aztec/aztec.js/addresses";
import { SetPublicAuthwitContractInteraction } from "@aztec/aztec.js/authorization";
import { Fr } from "@aztec/aztec.js/fields";
import { createAztecNodeClient, waitForNode } from "@aztec/aztec.js/node";
import { createExtendedL1Client } from "@aztec/ethereum/client";
import { deployL1Contract } from "@aztec/ethereum/deploy-l1-contract";
import { sha256ToField } from "@aztec/foundation/crypto/sha256";
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import { TokenBridgeContract } from "@aztec/noir-contracts.js/TokenBridge";
import {
  computeL2ToL1MessageHash,
  computeSecretHash,
} from "@aztec/stdlib/hash";
import { createAztecNodeDebugClient } from "@aztec/stdlib/interfaces/client";
import { decodeEventLog, encodeFunctionData, pad } from "@aztec/viem";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { foundry } from "@aztec/viem/chains";
import ExampleERC20 from "../../../target/solidity/example_swap/ExampleERC20.sol/ExampleERC20.json" with { type: "json" };
import ExampleTokenPortal from "../../../target/solidity/example_swap/ExampleTokenPortal.sol/ExampleTokenPortal.json" with { type: "json" };
import ExampleUniswapPortal from "../../../target/solidity/example_swap/ExampleUniswapPortal.sol/ExampleUniswapPortal.json" with { type: "json" };
import { ExampleUniswapContract } from "./artifacts/ExampleUniswap.js";

// Setup L1 client
const MNEMONIC = "test test test test test test test test test test test junk";
const l1RpcUrl = process.env.ETHEREUM_HOST ?? "http://localhost:8545";
const l1Client = createExtendedL1Client([l1RpcUrl], MNEMONIC);
const ownerEthAddress = l1Client.account.address;

// Setup L2 client
console.log("Setting up L2...\n");
const nodeUrl = process.env.AZTEC_NODE_URL ?? "http://localhost:8080";
const node = createAztecNodeClient(nodeUrl);
await waitForNode(node);
const wallet = await EmbeddedWallet.create(node, { ephemeral: true });
const [accData] = await getInitialTestAccountsData();
const account = await wallet.createSchnorrInitializerlessAccount(
  accData.secret,
  accData.salt,
  accData.signingKey,
);
console.log(`Account: ${account.address.toString()}\n`);

const nodeInfo = await node.getNodeInfo();
const registryAddress = nodeInfo.l1ContractAddresses.registryAddress.toString();
const inboxAddress = nodeInfo.l1ContractAddresses.inboxAddress.toString();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/ts/example_swap/index.ts#L1-L48" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/example_swap/index.ts#L1-L48</a></sub></sup>


### Deploy L1 Contracts

Deploy two ERC20 tokens, two token portals, and the uniswap portal:

```typescript title="deploy_l1" showLineNumbers 
console.log("Deploying L1 contracts...\n");

// Deploy two ERC20 tokens: WETH (input) and DAI (output)
const { address: wethAddress } = await deployL1Contract(
  l1Client,
  ExampleERC20.abi,
  ExampleERC20.bytecode.object as `0x${string}`,
  ["Wrapped Ether", "WETH"],
);

const { address: daiAddress } = await deployL1Contract(
  l1Client,
  ExampleERC20.abi,
  ExampleERC20.bytecode.object as `0x${string}`,
  ["Dai Stablecoin", "DAI"],
);

// Deploy two token portals (one per token)
const { address: wethPortalAddress } = await deployL1Contract(
  l1Client,
  ExampleTokenPortal.abi,
  ExampleTokenPortal.bytecode.object as `0x${string}`,
);

const { address: daiPortalAddress } = await deployL1Contract(
  l1Client,
  ExampleTokenPortal.abi,
  ExampleTokenPortal.bytecode.object as `0x${string}`,
);

// Deploy the uniswap portal
const { address: uniswapPortalAddress } = await deployL1Contract(
  l1Client,
  ExampleUniswapPortal.abi,
  ExampleUniswapPortal.bytecode.object as `0x${string}`,
);

console.log(`WETH: ${wethAddress}`);
console.log(`DAI: ${daiAddress}`);
console.log(`WETH Portal: ${wethPortalAddress}`);
console.log(`DAI Portal: ${daiPortalAddress}`);
console.log(`Uniswap Portal: ${uniswapPortalAddress}\n`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/ts/example_swap/index.ts#L50-L93" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/example_swap/index.ts#L50-L93</a></sub></sup>


### Deploy L2 Contracts

Deploy L2 tokens (using `TokenContract` from `@aztec/noir-contracts.js`), bridges, and the uniswap contract:

```typescript title="deploy_l2" showLineNumbers 
console.log("Deploying L2 contracts...\n");

// Deploy L2 tokens (using the standard TokenContract from @aztec/noir-contracts.js)
const { contract: l2Weth } = await TokenContract.deploy(
  wallet,
  account.address,
  "Wrapped Ether",
  "WETH",
  18,
).send({ from: account.address });

const { contract: l2Dai } = await TokenContract.deploy(
  wallet,
  account.address,
  "Dai Stablecoin",
  "DAI",
  18,
).send({ from: account.address });

// Deploy L2 token bridges
const { contract: l2WethBridge } = await TokenBridgeContract.deploy(
  wallet,
  l2Weth.address,
  wethPortalAddress,
).send({ from: account.address });

const { contract: l2DaiBridge } = await TokenBridgeContract.deploy(
  wallet,
  l2Dai.address,
  daiPortalAddress,
).send({ from: account.address });

// Deploy L2 uniswap contract
const { contract: l2Uniswap } = await ExampleUniswapContract.deploy(
  wallet,
  EthAddress.fromString(uniswapPortalAddress.toString()),
).send({ from: account.address });

console.log(`L2 WETH: ${l2Weth.address}`);
console.log(`L2 DAI: ${l2Dai.address}`);
console.log(`L2 WETH Bridge: ${l2WethBridge.address}`);
console.log(`L2 DAI Bridge: ${l2DaiBridge.address}`);
console.log(`L2 Uniswap: ${l2Uniswap.address}\n`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/ts/example_swap/index.ts#L95-L139" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/example_swap/index.ts#L95-L139</a></sub></sup>


### Initialize and Fund

Initialize all portals and mint tokens:

```typescript title="initialize" showLineNumbers 
console.log("Initializing contracts...\n");

// Make bridges minters on their respective tokens
await l2Weth.methods
  .set_minter(l2WethBridge.address, true)
  .send({ from: account.address });
await l2Dai.methods
  .set_minter(l2DaiBridge.address, true)
  .send({ from: account.address });

// Initialize L1 portals with registry, underlying token, and L2 bridge addresses
// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const initWethPortal = await l1Client.writeContract({
  address: wethPortalAddress.toString() as `0x${string}`,
  abi: ExampleTokenPortal.abi,
  functionName: "initialize",
  args: [
    registryAddress,
    wethAddress.toString(),
    l2WethBridge.address.toString(),
  ],
});
await l1Client.waitForTransactionReceipt({ hash: initWethPortal });

// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const initDaiPortal = await l1Client.writeContract({
  address: daiPortalAddress.toString() as `0x${string}`,
  abi: ExampleTokenPortal.abi,
  functionName: "initialize",
  args: [
    registryAddress,
    daiAddress.toString(),
    l2DaiBridge.address.toString(),
  ],
});
await l1Client.waitForTransactionReceipt({ hash: initDaiPortal });

// Initialize uniswap portal
// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const initUniswapPortal = await l1Client.writeContract({
  address: uniswapPortalAddress.toString() as `0x${string}`,
  abi: ExampleUniswapPortal.abi,
  functionName: "initialize",
  args: [registryAddress, l2Uniswap.address.toString()],
});
await l1Client.waitForTransactionReceipt({ hash: initUniswapPortal });

console.log("All contracts initialized\n");
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/ts/example_swap/index.ts#L141-L190" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/example_swap/index.ts#L141-L190</a></sub></sup>


Fund the user with input tokens and pre-fund the uniswap portal with output tokens:

```typescript title="fund" showLineNumbers 
console.log("Funding accounts...\n");

const SWAP_AMOUNT = 100n * 10n ** 18n; // 100 tokens

// Mint WETH on L1 for the user
// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const mintWethHash = await l1Client.writeContract({
  address: wethAddress.toString() as `0x${string}`,
  abi: ExampleERC20.abi,
  functionName: "mint",
  args: [ownerEthAddress, SWAP_AMOUNT],
});
await l1Client.waitForTransactionReceipt({ hash: mintWethHash });

// Pre-fund the uniswap portal with DAI (for the mock 1:1 swap)
// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const mintDaiHash = await l1Client.writeContract({
  address: daiAddress.toString() as `0x${string}`,
  abi: ExampleERC20.abi,
  functionName: "mint",
  args: [uniswapPortalAddress.toString(), SWAP_AMOUNT * 2n],
});
await l1Client.waitForTransactionReceipt({ hash: mintDaiHash });

console.log(`Minted ${SWAP_AMOUNT} WETH to user`);
console.log(`Pre-funded uniswap portal with ${SWAP_AMOUNT * 2n} DAI\n`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/ts/example_swap/index.ts#L192-L219" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/example_swap/index.ts#L192-L219</a></sub></sup>


### Deposit to L2

Bridge WETH from L1 to L2:

```typescript title="deposit_to_l2" showLineNumbers 
console.log("Depositing WETH to Aztec (L1 -> L2)...\n");

const depositSecret = Fr.random();
const depositSecretHash = await computeSecretHash(depositSecret);

// Approve WETH portal to take tokens
// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const approveHash = await l1Client.writeContract({
  address: wethAddress.toString() as `0x${string}`,
  abi: ExampleERC20.abi,
  functionName: "approve",
  args: [wethPortalAddress.toString(), SWAP_AMOUNT],
});
await l1Client.waitForTransactionReceipt({ hash: approveHash });

// Deposit to Aztec publicly
// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const depositHash = await l1Client.writeContract({
  address: wethPortalAddress.toString() as `0x${string}`,
  abi: ExampleTokenPortal.abi,
  functionName: "depositToAztecPublic",
  args: [
    account.address.toString(),
    SWAP_AMOUNT,
    pad(depositSecretHash.toString() as `0x${string}`, {
      dir: "left",
      size: 32,
    }),
  ],
});
const depositReceipt = await l1Client.waitForTransactionReceipt({
  hash: depositHash,
});

// Extract message leaf index from Inbox event
const INBOX_ABI = [
  {
    type: "event",
    name: "MessageSent",
    inputs: [
      { name: "checkpointNumber", type: "uint256", indexed: true },
      { name: "index", type: "uint256", indexed: false },
      { name: "hash", type: "bytes32", indexed: true },
      { name: "rollingHash", type: "bytes16", indexed: false },
    ],
  },
] as const;

const messageSentLogs = depositReceipt.logs
  .filter((log) => log.address.toLowerCase() === inboxAddress.toLowerCase())
  .map((log: any) => {
    try {
      const decoded = decodeEventLog({
        abi: INBOX_ABI,
        data: log.data,
        topics: log.topics,
      });
      return { log, decoded };
    } catch {
      return null;
    }
  })
  .filter(
    (item): item is { log: any; decoded: any } =>
      item !== null && (item.decoded as any).eventName === "MessageSent",
  );

if (messageSentLogs.length === 0) {
  throw new Error("No MessageSent events found in deposit transaction");
}
const depositLeafIndex = new Fr(messageSentLogs[0].decoded.args.index);
console.log(`Deposit message leaf index: ${depositLeafIndex}\n`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/ts/example_swap/index.ts#L221-L294" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/example_swap/index.ts#L221-L294</a></sub></sup>


:::tip Why use a secret hash?
When depositing from L1 to L2, we use a secret/secret-hash pattern: generate a random secret on the client, send only the hash to L1 (in the deposit transaction), then later reveal the secret on L2 to claim the tokens. This prevents **front-running attacks**: a malicious sequencer (the node that orders and processes L2 transactions) cannot observe the L1 deposit and claim the tokens themselves because they don't know the secret. Only someone who knows the preimage can claim.
:::

Before claiming, we need to mine 2 L2 blocks. L1-to-L2 messages are not available in the same block they are sent -- the rollup must first include them in an L2 block, and then one more block must pass before the message can be consumed. We use a helper that deploys throwaway contracts to force these blocks:

```typescript title="mine_blocks" showLineNumbers 
// Utility: mine 2 blocks (required before L1->L2 messages can be consumed)
async function mine2Blocks(
  wallet: EmbeddedWallet,
  accountAddress: AztecAddress,
) {
  await TokenContract.deploy(wallet, accountAddress, "T", "T", 18).send({
    from: accountAddress,
  });
  await TokenContract.deploy(wallet, accountAddress, "T", "T", 18).send({
    from: accountAddress,
  });
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/ts/example_swap/index.ts#L296-L309" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/example_swap/index.ts#L296-L309</a></sub></sup>


Claim the deposited tokens on L2:

```typescript title="claim_on_l2" showLineNumbers 
console.log("Claiming WETH on L2...\n");

await mine2Blocks(wallet, account.address);

await l2WethBridge.methods
  .claim_public(account.address, SWAP_AMOUNT, depositSecret, depositLeafIndex)
  .send({ from: account.address });

const { result: wethBalanceBefore } = await l2Weth.methods
  .balance_of_public(account.address)
  .simulate({ from: account.address });
console.log(`L2 WETH balance after claim: ${wethBalanceBefore}\n`);
if (wethBalanceBefore !== SWAP_AMOUNT) {
  throw new Error(
    `Expected WETH balance ${SWAP_AMOUNT}, got ${wethBalanceBefore}`,
  );
}
console.log("✓ WETH claimed successfully on L2\n");
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/ts/example_swap/index.ts#L311-L330" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/example_swap/index.ts#L311-L330</a></sub></sup>


### Execute the Swap

Initiate the swap on L2:

```typescript title="public_swap" showLineNumbers 
console.log("=== PUBLIC SWAP FLOW ===\n");
console.log("Initiating public swap on L2 (WETH -> DAI)...\n");

// Force L2 block production so the claim message is included in a block before the swap
await mine2Blocks(wallet, account.address);

const swapSecret = Fr.random();
const swapSecretHash = await computeSecretHash(swapSecret);

// Create authwit for the uniswap contract to transfer WETH on our behalf
const transferAction = l2Weth.methods.transfer_in_public(
  account.address,
  l2Uniswap.address,
  SWAP_AMOUNT,
  0xdeadbeefn,
);
const authwit = await SetPublicAuthwitContractInteraction.create(
  wallet,
  account.address,
  { caller: l2Uniswap.address, action: transferAction },
  true,
);
await authwit.send();

// Call swap_public on the L2 uniswap contract
const { receipt: swapReceipt } = await l2Uniswap.methods
  .swap_public(
    account.address,
    l2WethBridge.address,
    SWAP_AMOUNT,
    l2DaiBridge.address,
    3000n, // fee tier
    0n, // minimum output
    account.address, // recipient
    swapSecretHash,
  )
  .send({ from: account.address });

console.log(`Swap tx sent (block: ${swapReceipt.blockNumber})\n`);

// Verify WETH was spent (balance should be 0 after swap)
const { result: wethAfterSwap } = await l2Weth.methods
  .balance_of_public(account.address)
  .simulate({ from: account.address });
if (wethAfterSwap !== 0n) {
  throw new Error(`Expected WETH balance 0 after swap, got ${wethAfterSwap}`);
}
console.log("✓ WETH transferred to bridge for swap\n");
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/ts/example_swap/index.ts#L332-L381" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/example_swap/index.ts#L332-L381</a></sub></sup>


### Waiting for Block Proofs

L2→L1 messages can only be consumed on L1 after the L2 block containing them has been **proven**. Aztec batches blocks into [**epochs**](../../aztec-nr/framework-description/ethereum_aztec_messaging.md) and generates ZK proofs for each epoch. The proof confirms that the L2 state transition (including our swap messages) actually happened according to the protocol rules. Until the proof is submitted to L1, the messages exist but cannot be trusted.

```typescript title="wait_for_proof" showLineNumbers 
const isLocalNetwork =
  nodeUrl.includes("localhost") ||
  nodeUrl.includes("127.0.0.1") ||
  nodeUrl.includes("local-network");
const nodeDebug = isLocalNetwork
  ? createAztecNodeDebugClient(nodeUrl)
  : undefined;

console.log("Waiting for block to be proven...\n");

let provenBlockNumber = await node.getBlockNumber("proven");
while (provenBlockNumber < swapReceipt.blockNumber!) {
  console.log(
    `   Waiting... (proven: ${provenBlockNumber}, needed: ${swapReceipt.blockNumber})`,
  );
  if (nodeDebug) {
    await nodeDebug.mineBlock();
  }
  await new Promise((resolve) => setTimeout(resolve, 10000));
  provenBlockNumber = await node.getBlockNumber("proven");
}

console.log("Block proven!\n");
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/ts/example_swap/index.ts#L383-L407" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/example_swap/index.ts#L383-L407</a></sub></sup>


The [outbox](../../aztec-nr/framework-description/ethereum_aztec_messaging.md) stores L2→L1 messages in a Merkle tree. To consume a message, you must provide the **epoch** (which proof batch contains the message), the **leaf index** (position in the message tree), and the **sibling path** (Merkle proof showing the message is in the tree). These parameters are computed offchain by observing L2 blocks.

First, read the rollup version from the portal and compute the content hash and message leaf for the token bridge exit message:

```typescript title="consume_l1_messages_setup" showLineNumbers 
console.log("Consuming L2->L1 messages on L1...\n");

// The swap generates 2 L2->L1 messages:
// 1. Token bridge exit (withdraw WETH to uniswap portal)
// 2. Uniswap swap intent

// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const portalRollupVersion = (await l1Client.readContract({
  address: wethPortalAddress.toString() as `0x${string}`,
  abi: ExampleTokenPortal.abi,
  functionName: "rollupVersion",
})) as bigint;

// Compute message 1: token bridge exit
// Encode using the same approach as Solidity's abi.encodeWithSignature("withdraw(address,uint256,address)", ...)
const withdrawContentEncoded = encodeFunctionData({
  abi: [
    {
      name: "withdraw",
      type: "function",
      inputs: [
        { name: "", type: "address" },
        { name: "", type: "uint256" },
        { name: "", type: "address" },
      ],
      outputs: [],
    },
  ],
  args: [
    uniswapPortalAddress.toString() as `0x${string}`,
    SWAP_AMOUNT,
    uniswapPortalAddress.toString() as `0x${string}`,
  ],
});
const withdrawContentHash = sha256ToField([
  Buffer.from(withdrawContentEncoded.slice(2), "hex"),
]);

// Message 1: Token bridge exit message
const exitMsgLeaf = computeL2ToL1MessageHash({
  l2Sender: l2WethBridge.address,
  l1Recipient: wethPortalAddress,
  content: withdrawContentHash,
  rollupVersion: new Fr(portalRollupVersion),
  chainId: new Fr(foundry.id),
});
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/ts/example_swap/index.ts#L409-L456" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/example_swap/index.ts#L409-L456</a></sub></sup>


Next, compute Merkle membership witnesses for both L2→L1 messages -- the sibling path (proof of inclusion) for each. We also compute the swap intent message leaf using the same encoding as the Solidity portal:

```typescript title="consume_l1_messages_witnesses" showLineNumbers 
// The node picks the smallest partial-proof root that covers each tx's checkpoint.
const waitForL2ToL1MembershipWitness = async (
  messageName: string,
  messageLeaf: Fr,
) => {
  const maxAttempts = 30;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const witness = await node.getL2ToL1MembershipWitness(
      swapReceipt.txHash,
      messageLeaf,
    );
    if (witness) {
      return witness;
    }

    console.log(
      `   Waiting for ${messageName} L2->L1 witness (${attempt}/${maxAttempts})...`,
    );
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  throw new Error(`Timed out waiting for ${messageName} L2->L1 witness`);
};

const exitWitness = await waitForL2ToL1MembershipWitness(
  "token bridge exit",
  exitMsgLeaf,
);
const exitSiblingPath = exitWitness.siblingPath
  .toBufferArray()
  .map((buf: Buffer) => `0x${buf.toString("hex")}` as `0x${string}`);

// Message 2: Uniswap swap intent message
// Compute using the same encoding as ExampleUniswapPortal.sol
const swapContentEncoded = encodeFunctionData({
  abi: [
    {
      name: "swap_public",
      type: "function",
      inputs: [
        { name: "", type: "address" },
        { name: "", type: "uint256" },
        { name: "", type: "uint24" },
        { name: "", type: "address" },
        { name: "", type: "uint256" },
        { name: "", type: "bytes32" },
        { name: "", type: "bytes32" },
      ],
      outputs: [],
    },
  ],
  args: [
    wethPortalAddress.toString() as `0x${string}`,
    SWAP_AMOUNT,
    3000,
    daiPortalAddress.toString() as `0x${string}`,
    0n,
    account.address.toString() as `0x${string}`,
    pad(swapSecretHash.toString() as `0x${string}`, {
      dir: "left",
      size: 32,
    }),
  ],
});

const swapContentHash = sha256ToField([
  Buffer.from(swapContentEncoded.slice(2), "hex"),
]);

const swapMsgLeaf = computeL2ToL1MessageHash({
  l2Sender: l2Uniswap.address,
  l1Recipient: uniswapPortalAddress,
  content: swapContentHash,
  rollupVersion: new Fr(portalRollupVersion),
  chainId: new Fr(foundry.id),
});

const swapWitness = await waitForL2ToL1MembershipWitness(
  "swap intent",
  swapMsgLeaf,
);
const swapSiblingPath = swapWitness.siblingPath
  .toBufferArray()
  .map((buf: Buffer) => `0x${buf.toString("hex")}` as `0x${string}`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/ts/example_swap/index.ts#L458-L543" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/example_swap/index.ts#L458-L543</a></sub></sup>


Next, call `swapPublic` on the L1 uniswap portal, passing both message proofs. The portal verifies both messages against the outbox, performs the mock swap, and deposits the output tokens back to L2:

```typescript title="consume_l1_messages_execute" showLineNumbers 
// Execute the swap on L1 (consumes both messages)
// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const l1SwapHash = await l1Client.writeContract({
  address: uniswapPortalAddress.toString() as `0x${string}`,
  abi: ExampleUniswapPortal.abi,
  functionName: "swapPublic",
  args: [
    wethPortalAddress.toString(),
    SWAP_AMOUNT,
    3000,
    daiPortalAddress.toString(),
    0n,
    account.address.toString(),
    pad(swapSecretHash.toString() as `0x${string}`, {
      dir: "left",
      size: 32,
    }),
    [BigInt(exitWitness.epochNumber), BigInt(swapWitness.epochNumber)],
    [
      BigInt(exitWitness.numCheckpointsInEpoch),
      BigInt(swapWitness.numCheckpointsInEpoch),
    ],
    [BigInt(exitWitness.leafIndex), BigInt(swapWitness.leafIndex)],
    [exitSiblingPath, swapSiblingPath],
  ],
});
const l1SwapReceipt = await l1Client.waitForTransactionReceipt({
  hash: l1SwapHash,
});
console.log(`L1 swap executed! Tx: ${l1SwapHash}\n`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/ts/example_swap/index.ts#L545-L576" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/example_swap/index.ts#L545-L576</a></sub></sup>


Finally, claim the output DAI on L2:

```typescript title="claim_output" showLineNumbers 
console.log("Claiming DAI output on L2...\n");

// Extract the deposit message leaf index from the L1 swap receipt
const daiDepositLogs = l1SwapReceipt.logs
  .filter((log) => log.address.toLowerCase() === inboxAddress.toLowerCase())
  .map((log: any) => {
    try {
      const decoded = decodeEventLog({
        abi: INBOX_ABI,
        data: log.data,
        topics: log.topics,
      });
      return { log, decoded };
    } catch {
      return null;
    }
  })
  .filter(
    (item): item is { log: any; decoded: any } =>
      item !== null && (item.decoded as any).eventName === "MessageSent",
  );

if (daiDepositLogs.length === 0) {
  throw new Error("No MessageSent events found in L1 swap transaction");
}
const daiDepositLeafIndex = new Fr(daiDepositLogs[0].decoded.args.index);

// Mine blocks and claim
await mine2Blocks(wallet, account.address);

await l2DaiBridge.methods
  .claim_public(account.address, SWAP_AMOUNT, swapSecret, daiDepositLeafIndex)
  .send({ from: account.address });

const { result: daiBalance } = await l2Dai.methods
  .balance_of_public(account.address)
  .simulate({ from: account.address });

const { result: wethBalanceAfter } = await l2Weth.methods
  .balance_of_public(account.address)
  .simulate({ from: account.address });

console.log(`L2 WETH balance: ${wethBalanceAfter}`);
console.log(`L2 DAI balance: ${daiBalance}`);

if (wethBalanceAfter !== 0n) {
  throw new Error(`Expected final WETH balance 0, got ${wethBalanceAfter}`);
}
if (daiBalance !== SWAP_AMOUNT) {
  throw new Error(`Expected DAI balance ${SWAP_AMOUNT}, got ${daiBalance}`);
}
console.log("\n✓ All checks passed — public swap complete!\n");
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/ts/example_swap/index.ts#L578-L631" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/example_swap/index.ts#L578-L631</a></sub></sup>


### Run It

Start a local Aztec network in one terminal, then execute the script in another. Make sure you are in the `examples/ts/example_swap` directory:

```bash
# Terminal 1: Start a local network
aztec start --local-network

# Terminal 2: From examples/ts/example_swap, run the swap script
npx tsx index.ts
```

You should see console output tracing each step: deploying contracts, depositing to L2, initiating the swap, waiting for the proof, consuming messages on L1, and claiming the output DAI on L2.

## Public vs Private Comparison

| Aspect | Public Swap | Private Swap |
|--------|------------|-------------|
| **L2 function** | `swap_public()` | `swap_private()` |
| **Token transfer** | `transfer_in_public` (public→public) | `transfer_to_public` (private→public) |
| **Bridge call** | `call_self` (immediate) | `enqueue_self` (deferred) |
| **L1 deposit** | `depositToAztecPublic` | `depositToAztecPrivate` |
| **L2 claim** | `claim_public` | `claim_private` |
| **Visibility** | Swap amount and recipient visible | Swap amount visible, recipient hidden |

The private flow hides *who* is swapping, but the amounts are visible on L1 because the token bridge exit is a public operation. The output deposit can be claimed privately, so the final recipient is hidden.

## What You Built

A complete cross-chain token swap system with:

1. **L1 Contracts** (Solidity)
   - `ExampleERC20`: Minimal ERC20 tokens for testing
   - `ExampleTokenPortal`: Handles L1↔L2 token deposits and withdrawals
   - `ExampleUniswapPortal`: Orchestrates the swap by consuming two L2→L1 messages

2. **L2 Contract** (Noir)
   - `ExampleUniswap`: User-facing contract that initiates the swap, exits tokens to L1, and sends the swap intent message

3. **Message Flow**
   - User calls `swap_public` on L2
   - Two L2→L1 messages are created (bridge exit + swap intent)
   - L1 portal consumes both messages, swaps, and deposits output back to L2
   - User claims output tokens on L2

## Next Steps

- Extend with a real Uniswap V3 integration instead of the mock swap
- Add slippage protection with meaningful `minimum_output_amount` values
- Implement the private swap flow end-to-end in the TypeScript script
- Explore [cross-chain messaging](../../aztec-nr/framework-description/ethereum_aztec_messaging.md) in depth

:::tip Learn More
- [Token bridge tutorial](./token_bridge.md) - NFT bridge example
- [Cross-chain messaging reference](../../aztec-nr/framework-description/ethereum_aztec_messaging.md)
:::
