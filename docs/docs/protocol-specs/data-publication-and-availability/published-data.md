---
title: Published Data Format
---

The "Effects" of a transaction are the collection of state changes and metadata that resulted from executing a transaction. These include:

| Field                | Type                                                                    | Description                                                                          |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `revertCode`         | `RevertCode`                                                            | Indicates the reason for reverting in public application logic. 0 indicates success. |
| `transactionFee`     | `Fr`                                                            | The transaction fee, denominated in FPA. |
| `noteHashes`         | `Tuple<Fr, typeof MAX_NOTE_HASHES_PER_TX>`                          | The note hashes to be inserted into the note hash tree.                              |
| `nullifiers`         | `Tuple<Fr, typeof MAX_NULLIFIERS_PER_TX>`                           | The nullifiers to be inserted into the nullifier tree.                               |
| `l2ToL1Msgs`         | `Tuple<Fr, typeof MAX_L2_TO_L1_MSGS_PER_TX>`                        | The L2 to L1 messages to be inserted into the messagebox on L1.                      |
| `publicDataWrites`   | `Tuple<PublicDataWrite, typeof MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>` | Public data writes to be inserted into the public data tree                          |
| `noteEncryptedLogs`  | `TxL2Logs`                                                              | Buffers containing the emitted note logs.                                       |
| `encryptedLogs`      | `TxL2Logs`                                                              | Buffers containing the emitted encrypted logs.                                       |
| `unencryptedLogs`    | `TxL2Logs`                                                              | Buffers containing the emitted unencrypted logs.                                     |

To publish the above data, we must convert it into arrays of BLS12 fields for EVM defined blobs. The encoding is defined as:

| field start                                           | num fields | name                   | contents                                                                     |
| ----------------------------------------------------- | ---------- | ---------------------- | ---------------------------------------------------------------------------- |
| 0                                                     | 1          | Tx Start               | TX_START_PREFIX, total len, REVERT_CODE_PREFIX, revertCode                   |
| 1                                                     | 1          | Tx Fee                 | TX_FEE_PREFIX, transactionFee                                                |
| 2                                                     | 1          | Notes Start            | (If notes exist) NOTES_PREFIX, noteHashes.len()                              |
| 3                                                     | n          | Notes                  | (If notes exist) noteHashes                                                  |
| 3 + n                                                 | 1          | Nullifiers Start       | (If nullifiers exist) NULLIFIERS_PREFIX, nullifiers.len()                    |
| 3 + n + 1                                             | m          | Nullifiers             | (If nullifiers exist) nullifiers                                             |
| 3 + n + 1 + m                                         | 1          | L2toL1Messages Start   | (If msgs exist) L2_L1_MSGS_PREFIX, l2ToL1Msgs.len()                          |
| 3 + n + 1 + m + 1                                     | l          | L2toL1Messages         | (If msgs exist) l2ToL1Msgs                                                   |
| 3 + n + 1 + m + 1 + l                                 | 1          | PublicDataWrites Start | (If writes exist) PUBLIC_DATA_UPDATE_REQUESTS_PREFIX, publicDataWrites.len() |
| 3 + n + 1 + m + 1 + l + 1                             | p          | PublicDataWrites       | (If writes exist) publicDataWrites                                           |
| 3 + n + 1 + m + 1 + l + 1 + p                         | 1          | Note Logs Start        | (If note logs exist) NOTE_ENCRYPTED_LOGS_PREFIX, noteEncryptedLogs.len()     |
| 3 + n + 1 + m + 1 + l + 1 + p + 1                     | nl         | Note Logs              | (If note logs exist) noteEncryptedLogs                                       |
| 3 + n + 1 + m + 1 + l + 1 + p + 1 + nl                | 1          | Encrypted Logs Start   | (If encrypted logs exist) ENCRYPTED_LOGS_PREFIX, encryptedLogs.len()         |
| 3 + n + 1 + m + 1 + l + 1 + p + 1 + nl + 1            | el         | Encrypted Logs         | (If encrypted logs exist) encryptedLogs                                      |
| 3 + n + 1 + m + 1 + l + 1 + p + 1 + nl + 1 + el       | 1          | Unencrypted Logs Start | (If unencrypted logs exist) UNENCRYPTED_LOGS_PREFIX, unencryptedLogs.len()   |
| 3 + n + 1 + m + 1 + l + 1 + p + 1 + nl + 1 + el + 1   | ul         | Unencrypted Logs       | (If unencrypted logs exist) unencryptedLogs                                  |
