# Messaging Module

The messaging module provides functionality for cross-chain communication between Ethereum (L1) and Aztec (L2). It handles message passing, verification, and consumption in both directions.

## Overview

This module handles:

- **L1→L2 Messages**: Sending messages from Ethereum to Aztec
- **L2→L1 Messages**: Sending messages from Aztec to Ethereum
- **Message Verification**: Proving message existence and validity
- **Message Consumption**: Spending messages with secrets
- **Cross-Chain Actors**: Identifying senders and recipients

## Core Concepts

### Cross-Chain Messaging

Aztec enables secure communication between L1 (Ethereum) and L2 (Aztec):

**L1→L2 (Portal to Aztec):**
- Ethereum contracts send messages to Aztec contracts
- Messages are stored in the L1→L2 message tree
- Aztec contracts consume messages by providing a secret
- One-time consumption (messages are nullified)

**L2→L1 (Aztec to Portal):**
- Aztec contracts send messages to Ethereum contracts
- Messages are accumulated and stored in the outbox tree
- Ethereum contracts consume messages from the outbox
- Requires Merkle proof of message inclusion

## L1 to L2 Messages

### L1 Actor

Represents a sender on Ethereum (L1):

```typescript
import { L1Actor } from '@aztec/stdlib';

// Create from Ethereum address
const l1Actor = new L1Actor(
  ethereumAddress,  // EthAddress of the sender
  chainId          // L1 chain ID (e.g., 1 for mainnet)
);

// Access properties
console.log(l1Actor.sender);   // EthAddress
console.log(l1Actor.chainId);  // number

// Serialize
const fields = l1Actor.toFields();
const buffer = l1Actor.toBuffer();

// Factory methods
const empty = L1Actor.empty();      // Zero address, chain 0
const random = L1Actor.random();     // Random for testing
```

### L2 Actor

Represents a recipient on Aztec (L2):

```typescript
import { L2Actor } from '@aztec/stdlib';

// Create from Aztec contract
const l2Actor = new L2Actor(
  contractAddress,  // AztecAddress of recipient contract
  version          // Protocol version (default: 1)
);

// Access properties
console.log(l2Actor.recipient);  // AztecAddress
console.log(l2Actor.version);    // number

// Serialize
const fields = l2Actor.toFields();
const buffer = l2Actor.toBuffer();

// Factory methods
const empty = L2Actor.empty();
const random = await L2Actor.random();
```

### L1 to L2 Message

Complete message from L1 to L2:

```typescript
import { L1ToL2Message, L1Actor, L2Actor, Fr } from '@aztec/stdlib';

// Create a message
const message = new L1ToL2Message(
  sender,      // L1Actor - who sent it
  recipient,   // L2Actor - who can consume it
  content,     // Fr - message content
  secretHash,  // Fr - hash of consumption secret
  index        // Fr - index in message tree
);

// Access components
console.log(message.sender);      // L1Actor
console.log(message.recipient);   // L2Actor
console.log(message.content);     // Fr - the actual message
console.log(message.secretHash);  // Fr - required to consume
console.log(message.index);       // Fr - position in tree

// Hash the message
const messageHash = message.hash();

// Serialize
const fields = message.toFields();
const buffer = message.toBuffer();
const hex = message.toString();

// Deserialize
const restored = L1ToL2Message.fromBuffer(buffer);
const fromHex = L1ToL2Message.fromString(hex);

// Factory methods
const empty = L1ToL2Message.empty();
const random = await L1ToL2Message.random();
```

### Consuming L1→L2 Messages

```typescript
import { getNonNullifiedL1ToL2MessageWitness } from '@aztec/stdlib';

// Get witness for consuming a message
const [messageIndex, siblingPath] = await getNonNullifiedL1ToL2MessageWitness(
  node,
  contractAddress,  // Contract consuming the message
  messageHash,      // Hash of the L1→L2 message
  secret           // Secret to unlock the message
);

// The function:
// 1. Retrieves the message membership witness
// 2. Computes the message nullifier using the secret
// 3. Verifies the message hasn't been consumed yet
// 4. Returns witness for the contract to consume the message

// In your Noir contract:
// context.consume_l1_to_l2_message(
//   message_hash,
//   secret,
//   sender,
//   leaf_index,
//   sibling_path
// );
```

## L2 to L1 Messages

### Basic L2→L1 Message

Simple message from Aztec to Ethereum:

```typescript
import { L2ToL1Message, EthAddress, Fr } from '@aztec/stdlib';

// Create a message
const message = new L2ToL1Message(
  recipient,  // EthAddress - Ethereum recipient
  content    // Fr - message content
);

// Access properties
console.log(message.recipient);  // EthAddress
console.log(message.content);    // Fr

// Check if empty
if (message.isEmpty()) {
  console.log('Message is empty');
}

// Serialize
const buffer = message.toBuffer();
const fields = message.toFields();

// Deserialize
const restored = L2ToL1Message.fromBuffer(buffer);
const fromFields = L2ToL1Message.fromFields(fields);

// Factory methods
const empty = L2ToL1Message.empty();

// Add scope (contract address)
const scoped = message.scope(contractAddress);
```

### Scoped L2→L1 Message

Message with originating contract address:

```typescript
import { ScopedL2ToL1Message } from '@aztec/stdlib';

// Create or scope an existing message
const scoped = new ScopedL2ToL1Message(
  message,          // L2ToL1Message
  contractAddress  // AztecAddress of sender
);

// Access properties
console.log(scoped.message);          // L2ToL1Message
console.log(scoped.contractAddress);  // AztecAddress

// Serialize
const buffer = scoped.toBuffer();
const fields = scoped.toFields();

// Check if empty
if (scoped.isEmpty()) {
  console.log('Scoped message is empty');
}
```

### Counted L2→L1 Message

Message with counter for ordering:

```typescript
import { CountedL2ToL1Message } from '@aztec/stdlib';

// Create with counter
const counted = new CountedL2ToL1Message(
  message,  // L2ToL1Message
  counter   // number - sequence number
);

// Access properties
console.log(counted.message);  // L2ToL1Message
console.log(counted.counter);  // number

// Serialize
const buffer = counted.toBuffer();
const fields = counted.toFields();
```

### Scoped + Counted L2→L1 Message

Full message with both scope and counter:

```typescript
import { ScopedCountedL2ToL1Message, CountedL2ToL1Message } from '@aztec/stdlib';

// Create complete message
const full = new ScopedCountedL2ToL1Message(
  countedMessage,   // CountedL2ToL1Message
  contractAddress  // AztecAddress
);

// Access properties
console.log(full.inner);            // CountedL2ToL1Message
console.log(full.contractAddress);  // AztecAddress

// Get the base message
console.log(full.inner.message);    // L2ToL1Message
console.log(full.inner.counter);    // number
```

## Common Patterns

### 1. Send Message from L1 to L2

```typescript
// On Ethereum (L1)
const portal = await ethers.getContractAt('TokenPortal', portalAddress);

// Generate secret and hash
const secret = Fr.random();
const secretHash = computeSecretHash(secret);

// Send message with content
await portal.sendToAztec(
  aztecRecipientAddress,
  content.toBigInt(),
  secretHash.toBigInt()
);

// Message is now in L1→L2 message tree
// Can be consumed on L2 by anyone with the secret
```

### 2. Consume L1→L2 Message in Aztec Contract

```typescript
// In your Noir contract (pseudo-code):
fn consume_message_from_l1(
  message_hash: Field,
  secret: Field,
  sender: EthAddress,
  leaf_index: Field,
  sibling_path: [Field; MSG_TREE_HEIGHT]
) {
  // Verify and consume the message
  context.consume_l1_to_l2_message(
    message_hash,
    secret,
    sender,
    leaf_index,
    sibling_path
  );

  // Message is now consumed (nullified)
  // Process the message content...
}

// From TypeScript, get the witness:
const [leafIndex, siblingPath] = await getNonNullifiedL1ToL2MessageWitness(
  node,
  contractAddress,
  messageHash,
  secret
);

// Call the contract
await contract.methods.consume_message_from_l1(
  messageHash,
  secret,
  sender,
  leafIndex,
  siblingPath.toFields()
).send().wait();
```

### 3. Send Message from L2 to L1

```typescript
// In your Noir contract:
fn send_to_l1(recipient: EthAddress, content: Field) {
  // Create and send message
  context.message_portal(recipient, content);

  // Message is added to L2→L1 outbox
}

// Message will be available for consumption on L1
// after the block is proven and finalized
```

### 4. Consume L2→L1 Message on Ethereum

```typescript
// On Ethereum, after Aztec block is proven:
const outbox = await ethers.getContractAt('Outbox', outboxAddress);

// Get message proof from Aztec
const proof = await node.getL2ToL1MessageMembershipWitness(
  blockNumber,
  messageHash
);

// Consume message on L1
await outbox.consume(
  message,          // L2ToL1Message data
  contractAddress,  // Aztec contract that sent it
  blockNumber,      // Block containing message
  proof            // Merkle proof
);

// Message is now consumed on L1
```

### 5. Bridge Tokens L1→L2

```typescript
// Complete token bridge flow

// 1. User locks tokens on L1
const secret = Fr.random();
const secretHash = computeSecretHash(secret);

await tokenPortal.depositToAztec(
  amount,
  aztecRecipient,
  secretHash
);

// 2. Get message details
const messageHash = await getMessageHash(/*...*/);

// 3. Get witness to consume message on L2
const [leafIndex, siblingPath] = await getNonNullifiedL1ToL2MessageWitness(
  node,
  aztecTokenAddress,
  messageHash,
  secret
);

// 4. Mint tokens on L2 by consuming message
await aztecToken.methods.claim_from_l1(
  amount,
  secretHash,
  sender,
  leafIndex,
  siblingPath.toFields()
).send().wait();

// Tokens are now available on L2
```

### 6. Bridge Tokens L2→L1

```typescript
// Complete withdrawal flow

// 1. Burn tokens on L2 and send message to L1
await aztecToken.methods.withdraw_to_l1(
  amount,
  l1Recipient
).send().wait();

// 2. Wait for block to be proven on L1
const block = await waitForBlockFinalization();

// 3. Get message proof
const proof = await node.getL2ToL1MessageMembershipWitness(
  block.number,
  messageHash
);

// 4. Withdraw tokens on L1
await tokenPortal.withdraw(
  message,
  aztecTokenAddress,
  block.number,
  proof
);

// Tokens are now available on L1
```

## Security Considerations

### 1. Message Secrets

```typescript
// CRITICAL: Keep secrets private until ready to consume

// GOOD: Generate secret, only share hash publicly
const secret = Fr.random();
const secretHash = computeSecretHash(secret);

// Send secretHash to L1 contract (public)
await portal.sendMessage(recipient, content, secretHash);

// Keep secret private until consumption
// Only reveal secret when calling consume function

// BAD: Revealing secret publicly allows front-running
// Anyone can consume the message if they see the secret
```

### 2. Message Consumption

```typescript
// Messages can only be consumed once
// Attempting to consume again will fail

try {
  await getNonNullifiedL1ToL2MessageWitness(
    node,
    contractAddress,
    messageHash,
    secret
  );
} catch (error) {
  // Error: Message already nullified
  console.log('Message was already consumed');
}
```

### 3. Recipient Validation

```typescript
// L1→L2: Verify recipient matches your contract
const message = await node.getL1ToL2Message(messageHash);

if (!message.recipient.recipient.equals(myContractAddress)) {
  throw new Error('Message not intended for this contract');
}

// L2→L1: Verify sender on L1
// Only accept messages from trusted Aztec contracts
```

### 4. Message Replay Protection

```typescript
// L1→L2 messages: Protected by nullifier
// Each message can only be consumed once
// Nullifier = hash(contract, message_hash, secret)

// L2→L1 messages: Protected by message tree
// Each message recorded with unique index
// Cannot replay consumed messages
```

## Performance Considerations

### 1. Message Latency

```typescript
// L1→L2: Near-instant availability
// - Message added to tree on L1 transaction
// - Available for consumption on L2 immediately

// L2→L1: Delayed availability
// - Message in outbox when transaction executes
// - Must wait for block to be proven on L1
// - Typical delay: minutes to hours depending on proving time
```

### 2. Batch Messages

```typescript
// For multiple messages, batch when possible

// EFFICIENT: Single transaction, multiple messages
await contract.methods.batch_process([
  { recipient: addr1, content: content1 },
  { recipient: addr2, content: content2 },
  { recipient: addr3, content: content3 }
]).send().wait();

// INEFFICIENT: Multiple transactions
for (const msg of messages) {
  await contract.methods.send_to_l1(msg.recipient, msg.content).send().wait();
}
```

### 3. Message Size

```typescript
// L1→L2 content: Single field element
// - Limited to ~254 bits of data
// - For larger data, send hash and store data elsewhere

// L2→L1 content: Single field element
// - Same limitation
// - Consider packing multiple values if needed
```

## Best Practices

### 1. Use Unique Secrets

```typescript
// Generate unique secret per message
const uniqueSecret = Fr.random();

// AVOID: Reusing secrets across messages
// Reveals pattern and enables linking
```

### 2. Validate Message Sources

```typescript
// Always verify message origin

// L1→L2
if (!message.sender.sender.equals(trustedPortalAddress)) {
  throw new Error('Message from untrusted source');
}

// L2→L1
if (!scopedMessage.contractAddress.equals(trustedAztecContract)) {
  throw new Error('Message from untrusted contract');
}
```

### 3. Handle Errors Gracefully

```typescript
// Message consumption can fail
try {
  const witness = await getNonNullifiedL1ToL2MessageWitness(/*...*/);
  await contract.methods.consume_message(/*...*/).send().wait();
} catch (error) {
  if (error.message.includes('already nullified')) {
    console.log('Message already consumed');
  } else if (error.message.includes('not found')) {
    console.log('Message does not exist');
  } else {
    throw error;
  }
}
```

### 4. Document Message Formats

```typescript
// Define clear message content formats

// Example: Token bridge message
interface TokenBridgeMessage {
  amount: Fr;      // Field 0: Amount to bridge
  recipient: Fr;   // Field 1: Recipient address
  tokenId: Fr;     // Field 2: Token identifier
}

// Pack into single field if needed
const packedContent = packMessageFields([amount, recipient, tokenId]);
```

## Related Modules

- **aztec-address/**: Addresses for L2 actors
- **hash/**: Computing message nullifiers
- **trees/**: L1→L2 message tree
- **l1-contracts/**: Portal contract interactions

## Additional Resources

- [Cross-Chain Communication](https://docs.aztec.network/developers/contracts/portals)
- [Token Bridge Tutorial](https://docs.aztec.network/developers/tutorials/token_bridge)
- [Message Passing Protocol](https://docs.aztec.network/protocol-specs/l1-l2-messaging)
