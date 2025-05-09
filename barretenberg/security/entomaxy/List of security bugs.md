# Collection of bugs found in barretenberg

This list is a collection of bugs. Its goal is to help developers, auditors and security researchers to find and fix bugs in the barretenberg library.

## List of resolved bugs

### Native Bugs

| BarVD-ID | Component | Short description | Type | Potential Impact | Mechanism of finding | Found with a tool? | Found internally (yes or no) | Found by | Link to issue | Link to fix | Link to description |
|-----------|-----------|-------------------|------|------------------|----------------------|-------------------|------------------------------|-----------|--------------|------------|---------------------|
| BarVD-N-001 | Account circuit | nullifier mechanism broke privacy | Information leak | - | Manual code review | No | Yes | | | | [Description](https://medium.com/@jaosef/54dff729a24f) |
| BarVD-N-002 | PRNG | Mersenne Twister in production | Use of insecure PRNG| Leak of entropy | Manual code review | No | No | Daira Hopwood and Sean Bowe | | | [Description](https://medium.com/aztec-protocol/vulnerabilities-found-in-aztec-2-0-9b80c8bf416c) |
| BarVD-N-003 | PRNG | 256-bit random number used for generating a random field element in a 254-bit field | Use of insecure cryptographic primitive | Biased random number | Manual code review | No | No | Daira Hopwood and Sean Bowe | | | [Description](https://medium.com/aztec-protocol/vulnerabilities-found-in-aztec-2-0-9b80c8bf416c) |


### Soundness Bugs

| BarVD-ID | Component | Short description | Potential Impact | Mechanism of finding | Found with a tool? | Found internally (yes or no) | Found by | Link to issue | Link to fix | Link to description |
|----------|-----------|-------------------|------------------|----------------------|-------------------|------------------------------|-----------|--------------|------------|---------------------|
| BarVD-S-001 | stdlib/BigField | insufficient constraint for non-native field arithmetic | fraudulent recursive proofs | Manual code review | No | Yes | | | | [Description](https://medium.com/@jaosef/54dff729a24f) |
| BarVD-S-002 | Join-split circuit | account nonce not included in encrypted note | Deprecated account could spend notes | Manual code review | No | Yes | | | | [Description](https://medium.com/@jaosef/54dff729a24f) |
| BarVD-S-003 | Join-split circuit | lack of range constraints for the `tree_index` variable | Double spending | Manual code review | No | Yes | Wedderburn | | | [Description](https://hackmd.io/@aztec-network/disclosure-of-recent-vulnerabilities) |
| BarVD-S-004 | stdlib/BigField | insufficient range checks while emulating non-native field operations | Fraudulent recursive proofs | Manual code review | No | No | Xin Gao and Onur Kilic | | | [Description](https://hackmd.io/@aztec-network/disclosure-of-recent-vulnerabilities) |
| BarVD-S-005 | In-circuit pedersen hash | underconstrained 2-bit window representation of field elements | Double spending | Manual code review | No | Yes | @arielgabizon | | | [Description](https://medium.com/aztec-protocol/vulnerabilities-found-in-aztec-2-0-9b80c8bf416c) |
| BarVD-S-006 | Rollup circuit | point aggregation in the rollup circuit doesnn't incldue join-split proof points | Recursively proving fraudulent proofs | Manual code review | No | Yes | @arielgabizon | | | [Description](https://medium.com/aztec-protocol/vulnerabilities-found-in-aztec-2-0-9b80c8bf416c) |
| BarVD-S-007 | Join-split circuit | Note commitment and contents are not validated to correspond | Phishing | Manual code review | No | Yes | @arielgabizon | | | [Description](https://medium.com/aztec-protocol/vulnerabilities-found-in-aztec-2-0-9b80c8bf416c) |
| BarVD-S-008 | Account circuit | same public key can be used for multiple accounts | Spending other person's funds | Manual code review | No | Yes | @arielgabizon | | | [Description](https://hackmd.io/@aztec-network/HJDt63w69?type=view) |
| BarVD-S-009 | Join-split circuit | public key nullifier uses only the x coordinate of the public key | Spending other person's funds | Manual code review | No | Yes | @arielgabizon | | | [Description](https://hackmd.io/@aztec-network/HJDt63w69?type=view) |
| BarVD-S-010 | claim-proof circuit | incorrect implementation of integer arithemtic in field | Draining rollup funds | Manual code review | No | No | [@lucash-dev](https://github.com/lucash-dev) | | | [Description](https://hackmd.io/@aztec-network/claim-proof-bug) |
| BarVD-S-011 | stdlib/logic | 3bit overflow in AND/XOR | Malform AND/XOR/OR operations | acir_formal_proofs | Yes | Yes | @defkit & @Sarkoxed | | https://github.com/AztecProtocol/aztec-packages/pull/11651 |  |
| BarVD-S-012 | StandardCircuitBuilder/logic gate | Passing arbitrary values as XOR/AND results x2 | Getting arbitrary result of any computation that involves AND/XOR | smt_verification | Yes | Yes | @Sarkoxed | | https://github.com/AztecProtocol/aztec-packages/pull/4530 | |


### Completeness Bugs

| BarVD-ID | Component | Short description | Potential Impact | Mechanism of finding | Found with a tool? | Found internally (yes or no) | Found by | Link to issue | Link to fix | Link to description |  Extra Information |
|-----------|-----------|-------------------|------------------|----------------------|-------------------|------------------------------|-----------|--------------|------------|---------------------|--|
| BarVD-C-001 | Join-split circuit | incorrect note position check | Denial of service | Manual code review | No | Yes | @arielgabizon | | | [Description](https://medium.com/aztec-protocol/vulnerabilities-found-in-aztec-2-0-9b80c8bf416c) |
| BarVD-C-002 | stdlib/cycle_group | Adding two witness values produced a constant value | Private key leakage, Recursive proof failure | Manual code review | No | Yes | @Sarkoxed | | https://github.com/AztecProtocol/aztec-packages/pull/12385 | [Description](https://github.com/AztecProtocol/aztec-packages/pull/12385) |
| BarVD-C-003 | stdlib/BigField | Adding some amount of special bigfield values resulted in an overflow | Inability to satisfy the constraints | bigfield_fuzzer | Yes | Yes | @Sarkoxed | | https://github.com/AztecProtocol/aztec-packages/pull/9547 | | Same thing was further rediscovered by the auditors |

### Protogalaxy
| BarVD-PG-ID | Component | Short description | Type | Potential Impact | Mechanism of finding | Found with a tool? | Found internally (yes or no) | Found by | Link to issue | Link to fix | Link to description |
|-------------|-----------|-------------------|------|------------------|----------------------|-------------------|------------------------------|-----------|--------------|------------|---------------------|
| BarVD-PG-001 | Protogalaxy recursive verifier |  | Soundness |  | Manual code review + Origin Tag Mechanism | No and Yes | Yes | @Rumata888 | https://github.com/AztecProtocol/barretenberg/issues/1381 | https://github.com/AztecProtocol/aztec-packages/pull/14004 | [Description](../descriptions/Protogalaxy%20recursive%20verifier%20transcript%20bug.md) |