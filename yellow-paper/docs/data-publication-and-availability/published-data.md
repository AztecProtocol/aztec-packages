---
title: Published Data Format
---

# Publishing TxEffects

The `TxEffect` of a transaction is the collection of state changes and metadata that resulted from executing a transaction.

`TxEffect`s are published to DA.

These include:

| Field                | Type                                                                    | Description                                                                          |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `daGasUsed`          | `GasUsed`                                                               | Total DA gas used in this transaction.                                               |
| `revertCode`         | `RevertCode`                                                            | Indicates the reason for reverting in public application logic. 0 indicates success. |
| `note_hashes`        | `Tuple<Fr, typeof MAX_NEW_NOTE_HASHES_PER_TX>`                          | The note hashes to be inserted into the note hash tree.                              |
| `nullifiers`         | `Tuple<Fr, typeof MAX_NEW_NULLIFIERS_PER_TX>`                           | The nullifiers to be inserted into the nullifier tree.                               |
| `l2_to_l2_msgs`      | `Tuple<Fr, typeof MAX_NEW_L2_TO_L1_MSGS_PER_TX>`                        | The L2 to L1 messages to be inserted into the messagebox on L1.                      |
| `public_data_writes` | `Tuple<PublicDataWrite, typeof MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>` | Public data writes to be inserted into the public data tree                          |
| `encrypted_logs`     | `TxL2Logs`                                                              | Buffers containing the emitted encrypted logs.                                       |
| `unencrypted_logs`   | `TxL2Logs`                                                              | Buffers containing the emitted unencrypted logs.                                     |

`GasUsed` is a 64-bit unsigned integer when serialized, and a 256-bit unsigned integer when hashed.
Similarly, `RevertCode` is a 8-bit unsigned integer when serialized, and a 256-bit unsigned integer when hashed.

The discrepancy is due to the fact that the content commitment for a transaction is computed by the base rollup, which treats each of its inputs as Field elements.

Each can have several transactions. Thus, an block is encoded as:
| byte start                                                                                           | num bytes | name                                    |
| ---------------------------------------------------------------------------------------------------- | --------- | --------------------------------------- |
| 0x0                                                                                                  | 0x4       | len(numTxs) (denoted t)                 |
|                                                                                                      |           | TxEffect 0 {                            |
| 0x4                                                                                                  | 0x8       | daGasUsed                               |
| 0x4 + 0x8                                                                                            | 0x1       | revertCode                              |
| 0x4 + 0x8 + 0x1                                                                                      | 0x1       | len(newNoteHashes) (denoted b)          |
| 0x4 + 0x8 + 0x1 + 0x1                                                                                | b * 0x20  | newNoteHashes                           |
| 0x4 + 0x8 + 0x1 + 0x1 + b * 0x20                                                                     | 0x1       | len(newNullifiers) (denoted c)          |
| 0x4 + 0x8 + 0x1 + 0x1 + b * 0x20 + 0x1                                                               | c * 0x20  | newNullifiers                           |
| 0x4 + 0x8 + 0x1 + 0x1 + b * 0x20 + 0x1 + c * 0x20                                                    | 0x1       | len(newL2ToL1Msgs) (denoted d)          |
| 0x4 + 0x8 + 0x1 + 0x1 + b * 0x20 + 0x1 + c * 0x20 + 0x1                                              | d * 0x20  | newL2ToL1Msgs                           |
| 0x4 + 0x8 + 0x1 + 0x1 + b * 0x20 + 0x1 + c * 0x20 + 0x1 + d * 0x20                                   | 0x1       | len(newPublicDataWrites) (denoted e)    |
| 0x4 + 0x8 + 0x1 + 0x1 + b * 0x20 + 0x1 + c * 0x20 + 0x1 + d * 0x20 + 0x01                            | e * 0x40  | newPublicDataWrites                     |
| 0x4 + 0x8 + 0x1 + 0x1 + b * 0x20 + 0x1 + c * 0x20 + 0x1 + d * 0x20 + 0x01 + e * 0x40                 | 0x04      | byteLen(newEncryptedLogs) (denoted f)   |
| 0x4 + 0x8 + 0x1 + 0x1 + b * 0x20 + 0x1 + c * 0x20 + 0x1 + d * 0x20 + 0x01 + e * 0x40 + 0x4           | f         | newEncryptedLogs                        |
| 0x4 + 0x8 + 0x1 + 0x1 + b * 0x20 + 0x1 + c * 0x20 + 0x1 + d * 0x20 + 0x01 + e * 0x40 + 0x4 + f       | 0x04      | byteLen(newUnencryptedLogs) (denoted g) |
| 0x4 + 0x8 + 0x1 + 0x1 + b * 0x20 + 0x1 + c * 0x20 + 0x1 + d * 0x20 + 0x01 + e * 0x40 + 0x4 + f + 0x4 | g         | newUnencryptedLogs                      |
|                                                                                                      |           | },                                      |
|                                                                                                      |           | TxEffect 1 {                            |
|                                                                                                      |           | ...                                     |
|                                                                                                      |           | },                                      |
|                                                                                                      |           | ...                                     |
|                                                                                                      |           | TxEffect (t - 1) {                      |
|                                                                                                      |           | ...                                     |
|                                                                                                      |           | },                                      |


# Reading TxReceipts

A client can query an Aztec node for a particular transaction hash to get the `TxReceipt` of the transaction.

The `TxReceipt` includes:

| Field         | Type          | Description                                                    |
| ------------- | ------------- | -------------------------------------------------------------- |
| `daGasUsed`   | `String`      | Total DA gas used in this transaction, encoded in decimal.     |
| `txHash`      | `TxHash`      | A unique identifier for a transaction.                         |
| `status`      | `TxStatus`    | "pending", "success", "reverted", or "dropped"                 |
| `error`       | `String`      | An explanation for reverted, if any                            |
| `blockHash`   | `BlockHash`   | The hash of the block in which the transaction was included.   |
| `blockNumber` | `BlockNumber` | The number of the block in which the transaction was included. |
| `debugInfo`   | `DebugInfo`   | Information useful for testing/debugging                       |

