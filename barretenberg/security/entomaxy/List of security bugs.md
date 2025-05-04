# Collection of bugs found in barretenberg

This list is a collection of bugs. Its goal is to help developers, auditors and security researchers to find and fix bugs in the barretenberg library.

## List of bugs

### Unordered/old
| BarVD-ID | Component | Short description | Type | Potential Impact | Mechanism of finding | Found with a tool? | Found internally (yes or no) | Found by | Link to issue | Link to fix | Link to description |
|-----------|-----------|-------------------|------|------------------|----------------------|-------------------|------------------------------|-----------|--------------|------------|---------------------|
| BarVD-001 | Bigfield stdlib primitive| insufficient constraint for non-native field arithmetic | Soundness | fraudulent recursive proofs | Manual code review | No | Yes | | | | [Description](https://medium.com/@jaosef/54dff729a24f) |
| BarVD-002 | Account circuit | nullifier mechanism broke privacy | Information leak | - | Manual code review | No | Yes | | | | [Description](https://medium.com/@jaosef/54dff729a24f) |
| BarVD-003 | Join-split circuit | account nonce not included in encrypted note | Soundness | Deprecated account could spend notes | Manual code review | No | Yes | | | | [Description](https://medium.com/@jaosef/54dff729a24f) |
| BarVD-004 | Join-split circuit | lack of range constraints for the `tree_index` variable | Soundness | Double spending | Manual code review | No | Yes | Wedderburn | | | [Description](https://hackmd.io/@aztec-network/disclosure-of-recent-vulnerabilities) |
| BarVD-005 | Bigfield stdlib primitive | insufficient range checks while emulating non-native field operations | Soundness | Fraudulent recursive proofs | Manual code review | No | No | Xin Gao and Onur Kilic | | | [Description](https://hackmd.io/@aztec-network/disclosure-of-recent-vulnerabilities) |
| BarVD-006 | In-circuit pedersen hash | underconstrained 2-bit window representation of field elements | Soundness | Double spending | Manual code review | No | Yes | @arielgabizon | | | [Description](https://medium.com/aztec-protocol/vulnerabilities-found-in-aztec-2-0-9b80c8bf416c) |
| BarVD-007 | Join-split circuit | incorrect note position check | Completeness | Denial of service | Manual code review | No | Yes | @arielgabizon | | | [Description](https://medium.com/aztec-protocol/vulnerabilities-found-in-aztec-2-0-9b80c8bf416c) |
| BarVD-008 | Rollup circuit | point aggregation in the rollup circuit doesnn't incldue join-split proof points | Soundness | Recursively proving fraudulent proofs | Manual code review | No | Yes | @arielgabizon | | | [Description](https://medium.com/aztec-protocol/vulnerabilities-found-in-aztec-2-0-9b80c8bf416c) |
| BarVD-009 | PRNG | Mersenne Twister in production | Use of insecure PRNG| Leak of entropy | Manual code review | No | No | Daira Hopwood and Sean Bowe | | | [Description](https://medium.com/aztec-protocol/vulnerabilities-found-in-aztec-2-0-9b80c8bf416c) |
| BarVD-010 | PRNG | 256-bit random number used for generating a random field element in a 254-bit field | Use of insecure cryptographic primitive | Biased random number | Manual code review | No | No | Daira Hopwood and Sean Bowe | | | [Description](https://medium.com/aztec-protocol/vulnerabilities-found-in-aztec-2-0-9b80c8bf416c) |
| BarVD-011 | Join-split circuit | Note commitment and contents are not validated to correspond | Soundness | Phishing | Manual code review | No | Yes | @arielgabizon | | | [Description](https://medium.com/aztec-protocol/vulnerabilities-found-in-aztec-2-0-9b80c8bf416c) |
| BarVD-012 | Account circuit | same public key can be used for multiple accounts | Soundness | Spending other person's funds | Manual code review | No | Yes | @arielgabizon | | | [Description](https://hackmd.io/@aztec-network/HJDt63w69?type=view) |
| BarVD-013 | Join-split circuit | public key nullifier uses only the x coordinate of the public key | Soundness | Spending other person's funds | Manual code review | No | Yes | @arielgabizon | | | [Description](https://hackmd.io/@aztec-network/HJDt63w69?type=view) |
| BarVD-014 | claim-proof circuit | incorrect implementation of integer arithemtic in field | Soundness | Draining rollup funds | Manual code review | No | No | [@lucash-dev](https://github.com/lucash-dev) | | | [Description](https://hackmd.io/@aztec-network/claim-proof-bug) |
| BarVD-015 | stdlib/logic | 3bit overflow in AND/XOR | Soundness |  | acir_formal_proofs | Yes | Yes | @defkit & @Sarkoxed | | https://github.com/AztecProtocol/aztec-packages/pull/11651 |  |

### Protogalaxy
| BarVD-PG-ID | Component | Short description | Type | Potential Impact | Mechanism of finding | Found with a tool? | Found internally (yes or no) | Found by | Link to issue | Link to fix | Link to description |
|-------------|-----------|-------------------|------|------------------|----------------------|-------------------|------------------------------|-----------|--------------|------------|---------------------|
| BarVD-PG-001 | Protogalaxy recursive verifier |  | Soundness |  | Manual code review + Origin Tag Mechanism | No and Yes | Yes | @Rumata888 | https://github.com/AztecProtocol/barretenberg/issues/1381 | https://github.com/AztecProtocol/aztec-packages/pull/14004 | [Description](../descriptions/Protogalaxy%20recursive%20verifier%20transcript%20bug.md) |

