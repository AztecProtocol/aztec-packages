# Aztec Packages JSDoc Documentation Status Analysis

## Executive Summary

This report analyzes the JSDoc documentation status across seven core Aztec packages. The analysis reveals that while many public API entry points have package-level documentation, individual class and function documentation is inconsistent across packages, with significant gaps in several critical areas.

---

## 1. @aztec/aztec.js - Main SDK Package

### Package Overview
- **Location**: `/Users/alejoamiras/Projects/aztec-packages/yarn-project/aztec.js`
- **Entry Point**: `src/index.ts`
- **Exports**: Via `src/api/` granular APIs
- **Package.json Exports**: 16 different export paths
- **TypeDoc Configuration**: Yes, configured in `package.json`

### Export Structure
Main export paths:
- `.` → root API
- `./wallet`, `./account`, `./contracts`, `./deployment`
- `./abi`, `./addresses`, `./ethereum`, `./fee`, `./log`, `./utils`
- And 6 more specialized exports

### Documented Files
✅ **With Package-Level JSDoc**:
- `src/api/contract.ts` - 37-line module documentation
- `src/wallet/wallet.ts` - Types documented with JSDoc (Aliased, UserFeeOptions, SimulateOptions, ProfileOptions, SendOptions, BatchableMethods, Wallet interface)
- `src/wallet/base_wallet.ts` - BaseWallet class documented, key methods have JSDoc

### Undocumented/Partially Documented Files
⚠️ **Missing Documentation**:
- `src/api/account.ts` - Export-only file (1 line)
- `src/api/abi.ts` - Export-only file (25 lines)
- `src/api/authorization.ts` - Export-only file
- `src/api/addresses.ts` - Export-only file
- `src/api/eth_address.ts` - Export-only file
- `src/api/fee.ts` - Export-only file
- `src/api/log.ts` - Export-only file
- `src/api/utils.ts` - Export-only file
- `src/contract/contract.ts` - Good class-level documentation (60 lines total)
- `src/contract/contract_function_interaction.ts` - No package-level docs
- `src/contract/sent_tx.ts` - No documentation found
- `src/contract/deploy_method.ts` - No documentation found
- `src/contract/deploy_sent_tx.ts` - No documentation found
- `src/fee/` directory - Multiple files without class/function documentation
- `src/deployment/contract_deployer.ts` - No documentation

### Key Issues
1. **Granular API Re-export Files**: Many API files only re-export from other packages without documentation
2. **Missing Type Documentation**: Fee payment types, deployment options
3. **Interaction Classes**: Limited documentation on contract interaction flow

### Missing Documentation Areas
- Fee payment methods and options
- Deployment process and options
- Authorization witnesses
- Advanced contract interaction patterns
- Ethereum integration details

---

## 2. @aztec/accounts - Account Management

### Package Overview
- **Location**: `/Users/alejoamiras/Projects/aztec-packages/yarn-project/accounts`
- **Entry Points**: Multiple - one per account type (defaults, ecdsa, schnorr, single_key, testing, stub, utils)
- **Package.json Exports**: 14 export paths
- **TypeDoc Configuration**: Yes, with 5 entry points

### Export Structure
- `./defaults` → DefaultAccountContract
- `./ecdsa` → ECDSA accounts (includes lazy variants)
- `./schnorr` → Schnorr accounts (recommended default)
- `./single_key` → Single key testing account
- `./testing` → Testing utilities
- `./stub` → Stub account (for testing)
- `./copy-cat` → Copy-cat account
- `./utils` → Utilities

### Documented Files
✅ **With Module Documentation**:
- `src/defaults/index.ts` - Package documentation present
- `src/ecdsa/ecdsa_r/index.ts` - Module documentation (7 lines)
- `src/schnorr/index.ts` - Module documentation (5 lines)  
- `src/single_key/index.ts` - Module documentation (6 lines)
- `src/testing/index.ts` - Module documentation (4 lines)

✅ **With Class Documentation**:
- `src/defaults/account_contract.ts` - DefaultAccountContract documented
- `src/defaults/account_interface.ts` - DefaultAccountInterface documented (50+ lines)
- `src/ecdsa/ecdsa_r/index.ts` - EcdsaRAccountContract documented (4 lines)
- `src/schnorr/index.ts` - SchnorrAccountContract documented (5 lines), getSchnorrAccountContractAddress function documented (4 lines)

### Undocumented/Partially Documented Files
⚠️ **Missing Documentation**:
- `src/ecdsa/index.ts` - No module documentation (re-exports 3 variants)
- `src/ecdsa/ecdsa_k/index.ts` - No module documentation
- `src/ecdsa/ssh_ecdsa_r/index.ts` - No module documentation
- `src/ecdsa/ecdsa_k/account_contract.ts` - No class documentation
- `src/ecdsa/ecdsa_r/account_contract.ts` - No class documentation
- `src/ecdsa/ssh_ecdsa_r/account_contract.ts` - No class documentation
- `src/schnorr/account_contract.ts` - Base class SchnorrBaseAccountContract - NO DOCUMENTATION
- `src/single_key/account_contract.ts` - Base class SingleKeyBaseAccountContract - NO DOCUMENTATION
- `src/stub/account_contract.ts` - StubAccountContract - NO DOCUMENTATION
- `src/utils/index.ts` - No documentation
- `src/copy_cat/` - Not documented

### JSDoc Count by Directory
- `defaults/`: 3 comments total
- `ecdsa/`: 0 comments (index), 3 comments (ecdsa_r/index)
- `schnorr/`: 3 comments
- `single_key/`: 2 comments
- `stub/`: 2 comments
- `testing/`: 3 comments
- `utils/`: 0 comments

### Key Issues
1. **ECDSA Variants**: EcdsaK and SSH_EcdsaR have no module-level documentation
2. **Base Classes**: Account base classes (SchnorrBaseAccountContract, SingleKeyBaseAccountContract) lack documentation
3. **Authentication Methods**: Auth witness providers not documented
4. **Key Derivation**: Key derivation functions missing documentation
5. **Account Initialization**: Missing docs on how accounts are initialized

### Missing Documentation Areas
- Account initialization process
- Key derivation and management
- Authentication witness creation
- Different ECDSA variants and when to use each
- Account address computation
- Encryption and signing key separation

---

## 3. @aztec/noir-contracts.js - Noir Contracts Interface

### Package Overview
- **Location**: `/Users/alejoamiras/Projects/aztec-packages/yarn-project/noir-contracts.js`
- **Entry Point**: Generated TypeScript (no src/ folder - generated from Noir)
- **Package.json Exports**: 3 export paths (. , ./artifacts/*, ./* )
- **TypeDoc Configuration**: None present
- **Build Process**: Code is generated via `./scripts/generate-types.sh`

### Status
❌ **NO SOURCE TypeScript Files** - Package generates TypeScript from Noir artifacts
- This package auto-generates TypeScript interfaces from Noir contract compilations
- No manual JSDoc documentation possible in src/
- Documentation would need to be added to generated code or README

### Key Points
- Types are auto-generated, so JSDoc must come from README or separate docs
- No TypeScript source files to document
- Generated code should include inline documentation generation from Noir contract metadata

### Missing Documentation Areas
- Contract artifact structure
- Type generation process
- How to use generated types
- Available protocols contracts
- Version compatibility

---

## 4. @aztec/protocol-contracts - Protocol Contracts

### Package Overview
- **Location**: `/Users/alejoamiras/Projects/aztec-packages/yarn-project/protocol-contracts`
- **Entry Points**: `src/index.ts`
- **Main Exports**: Via `src/index.ts` (2 lines)
- **TypeDoc Configuration**: None present
- **Directory Structure**: Contracts in subdirectories (auth-registry, class-registry, fee-juice, instance-registry, etc.)

### Documented Files
✅ **With Documentation**:
- `src/protocol_contract.ts` - ProtocolContract interface documented (7 lines)
- `src/index.ts` - Minimal documentation, re-exports

### Exported Types & Functions
```typescript
export interface ProtocolContract {
  instance: ContractInstanceWithAddress;
  contractClass: ContractClassWithId & ContractClassIdPreimage;
  artifact: ContractArtifact;
  address: AztecAddress;
}
export function isProtocolContract(address: AztecAddress): boolean
export type ProtocolContractsProvider
```

### Undocumented/Partially Documented Files
⚠️ **Missing Documentation**:
- `src/make_protocol_contract.ts` - Function not documented
- `src/provider/protocol_contracts_provider.ts` - Provider interface not examined
- `src/class-registry/` - No documentation on class registry contract
- `src/fee-juice/` - No documentation on fee juice contract
- `src/instance-registry/` - No documentation on instance registry
- `src/auth-registry/` - No documentation on auth registry
- `src/router/` - No documentation on router contract
- `src/multi-call-entrypoint/` - No documentation
- Contract artifact loading functions - Not documented

### Key Issues
1. **Minimal Module-Level Docs**: Only basic type definitions documented
2. **Missing Contract Descriptions**: No explanation of what each protocol contract does
3. **Provider Interface**: ProtocolContractsProvider type exported but not documented
4. **Lack of Usage Examples**: No guidance on using protocol contracts
5. **No Architecture Docs**: Missing explanation of protocol contract system

### Missing Documentation Areas
- What each protocol contract does (fee-juice, class-registry, etc.)
- ProtocolContractsProvider interface and methods
- How to access protocol contract instances
- Registry functions and patterns
- Protocol contract initialization
- Fee payment contract functions

---

## 5. @aztec/pxe - Private eXecution Environment

### Package Overview
- **Location**: `/Users/alejoamiras/Projects/aztec-packages/yarn-project/pxe`
- **Entry Points**: Multiple via `src/entrypoints/`
- **Package.json Exports**: 5 export paths (./server, ./client/lazy, ./client/bundle, ./simulator, ./config)
- **TypeDoc Configuration**: None present
- **Main Class**: PXE class (~1100 lines)

### Documented Files
✅ **With Documentation**:
- `src/pxe.ts` - PXE class documented:
  - Class-level documentation: "Private eXecution Environment (PXE) is a library used by wallets to simulate private phase of transactions and to manage private state of users." (2 lines)
  - `create()` static method: Well documented (8 lines)
  - Public methods: Most have good JSDoc
    - `registerAccount()` - 7 lines documentation
    - `registerSender()` - 7 lines documentation
    - `getSenders()` - 1 line
    - `removeSender()` - Minimal
    - `getRegisteredAccounts()` - 1 line
    - `registerContractClass()` - 1 line
    - `registerContract()` - 8 lines
    - `updateContract()` - 8 lines
    - `getContracts()` - 1 line
    - `getNotes()` - 11 lines (with production warning)
    - `proveTx()` - 5 lines
    - `profileTx()` - 9 lines
    - `simulateTx()` - 18 lines (comprehensive!)
    - `simulateUtility()` - 9 lines
    - `getPrivateEvents()` - 10 lines
    - `stop()` - 1 line

### Partially Documented
⚠️ **Some Documentation**:
- `src/pxe.ts` - Private methods marked with `#` but most lack documentation:
  - `#getSimulatorForTx()` - No docs
  - `#contextualizeError()` - No docs
  - `#putInJobQueue()` - Has documentation (4 lines)
  - `#registerProtocolContracts()` - No docs
  - `#simulateUtility()` - 5 lines of docs
  - `#simulatePublicCalls()` - 3 lines of docs
  - `#prove()` - 9 lines of docs
  - `#executePrivate()` - 4 lines of docs

### Undocumented/Partially Documented
⚠️ **Missing Documentation**:
- `src/config/index.ts` - PXEConfig not examined
- `src/storage/` - Multiple providers without documentation
  - AddressDataProvider
  - CapsuleDataProvider
  - ContractDataProvider
  - NoteDataProvider
  - PrivateEventDataProvider
  - SyncDataProvider
  - TaggingDataProvider
- `src/synchronizer/index.ts` - Synchronizer class
- `src/contract_function_simulator/` - Simulator classes
- `src/private_kernel/` - Private kernel execution
- `src/tagging/` - Tagging system
- `src/error_enriching.ts` - Error handling functions

### Storage Providers (Critical Gap)
None of the storage data providers have documentation:
- How to add/query addresses
- Note storage and filtering
- Capsule management
- Synchronization patterns
- Tagging system

### Key Issues
1. **Public API Well Documented**: Main PXE class has good method-level docs
2. **Private Methods Under-documented**: Private implementation methods lack docs
3. **Storage Layer Not Documented**: Critical gap in data provider documentation
4. **Config Not Documented**: PXEConfig options not explained
5. **Simulator Interface Not Documented**: How simulation works is unclear
6. **Error Handling**: Error enrichment and context not documented

### Missing Documentation Areas
- Storage system and data providers
- PXE configuration options
- Contract function simulation process
- Private kernel execution flow
- Synchronization mechanism
- Note tagging system
- Capsule management
- Address registration process

---

## 6. @aztec/stdlib - Standard Library

### Package Overview
- **Location**: `/Users/alejoamiras/Projects/aztec-packages/yarn-project/stdlib`
- **Entry Point**: No main index.ts - exports via package.json only
- **Package.json Exports**: 55 different export paths!
- **TypeDoc Configuration**: Yes, single entry point: `./src/index.ts`
- **Subdirectories**: 42 directories with their own exports

### Export Coverage (Partial Sample)
Major export paths documented:
- `./abi` → ABI utilities
- `./aztec-address` → AztecAddress types
- `./hash` → Hashing functions
- `./keys` → Key derivation
- `./contract` → Contract utilities
- `./simulation` → Simulation types
- `./rollup` → Rollup data structures
- `./kernel` → Kernel circuits
- `./avm` → AVM types
- `./tx` → Transaction types
- `./block` → Block data structures
- `./errors` → Error types
- `./messaging` → L1-L2 messaging
- `./gas` → Gas estimation
- ... and 40+ more

### Documentation Status
❌ **MINIMAL TO NO DOCUMENTATION** on index level
- Each subdirectory may have its own exports but we haven't examined all
- Only sampled a few in the analysis

### Known Documented Areas
✅ **Potentially Documented** (based on module naming):
- `src/abi/` - ABI encoding/decoding
- `src/hash/` - Hash functions (likely documented)
- `src/keys/` - Key derivation (likely documented)
- `src/contract/` - Contract utilities
- `src/tx/` - Transaction types

### Likely Undocumented Areas
⚠️ **Assumed Not Documented**:
- `src/block/` - Block structures
- `src/kernel/` - Kernel circuit types
- `src/avm/` - AVM types
- `src/rollup/` - Rollup data
- `src/messaging/` - Messaging types
- `src/schemas/` - Schema definitions
- `src/validators/` - Validator functions
- `src/snapshots/` - Snapshot utilities
- Most specialized exports

### Key Issues
1. **MASSIVE PACKAGE**: 55 export paths with no single entry point documentation
2. **No Root-Level Guidance**: No index.ts to explain what stdlib provides
3. **Unclear Organization**: Unclear which exports developers should use
4. **Mixed Responsibility**: Contains both types and utilities
5. **No Type Relationships**: No documentation showing how types relate

### Missing Documentation Areas
- What stdlib provides (overview)
- Type hierarchies and relationships
- Recommended imports for common tasks
- Deprecated vs. current exports
- Internal vs. public APIs
- Each major module's purpose

---

## 7. @aztec/foundation - Foundation Utilities

### Package Overview
- **Location**: `/Users/alejoamiras/Projects/aztec-packages/yarn-project/foundation`
- **Entry Point**: `src/index.ts`
- **Package.json Exports**: 31 export paths via re-export as namespaces
- **TypeDoc Configuration**: None found
- **Structure**: All exports are namespaced re-exports from subdirectories

### Export Structure
```typescript
export * as asyncMap from './async-map/index.js';
export * as bigintBuffer from './bigint-buffer/index.js';
export * as collection from './collection/index.js';
export * as committable from './committable/index.js';
export * as crypto from './crypto/index.js';
export * as errors from './error/index.js';
export * as ethAddress from './eth-address/index.js';
export * as fields from './fields/index.js';
// ... 23 more namespaced exports
```

### Documentation Status
❌ **NO ROOT-LEVEL DOCUMENTATION**
- `src/index.ts` is pure re-exports (31 lines)
- No module documentation
- No explanation of what foundation provides

### Subdirectories (Not Examined in Detail)
Likely contain utilities for:
- Async operations (asyncMap)
- BigInt/Buffer handling (bigintBuffer)
- Collections (collection)
- Committable types (committable)
- Cryptography (crypto)
- Error handling (errors)
- Ethereum address (ethAddress)
- Field arithmetic (fields)
- File system (fs)
- JSON-RPC (jsonRpc)
- Logging (log)
- Mutexes (mutex)
- Retry logic (retry)
- Promises (runningPromise)
- Serialization (serialize)
- Sleep utilities (sleep)
- Timers (timer)
- Transport (transport)
- Trees (trees)
- Types (types)
- URL handling (url)
- Testing (testing)
- Profiling (profiler)
- Configuration (config)
- Buffers (buffer)
- Ethereum signatures (ethSignature)

### Key Issues
1. **ZERO DOCUMENTATION**: Root index has no comments at all
2. **Opaque Namespacing**: All exports hidden behind namespaces - unclear what's available
3. **No Guidance**: New developers have no idea what foundation provides
4. **Missing Utility Descriptions**: Each utility is undocumented
5. **No Usage Examples**: No indication of how to use any utilities

### Missing Documentation Areas
- Package purpose and overview
- Description of each utility namespace
- When to use each utility
- Common patterns and use cases
- API stability guarantees
- Dependencies between utilities
- Migration guides for breaking changes

---

## Summary Table

| Package | Total Exports | Entry Point Docs | Class/Function Docs | Critical Gaps |
|---------|---------------|-----------------|-------------------|--------------|
| @aztec/aztec.js | 16 paths | Good (1) | Partial (3-5) | Fee payment, deployment, interactions |
| @aztec/accounts | 14 paths | Good (5) | Partial (5) | ECDSA variants, base classes, key mgmt |
| @aztec/noir-contracts.js | 3 paths | N/A (generated) | N/A | Generated code, no source |
| @aztec/protocol-contracts | 2 paths | Minimal (1) | Poor (1) | All protocol contracts, providers |
| @aztec/pxe | 5 paths | Good (1) | Good public, Bad private | Storage, config, simulator |
| @aztec/stdlib | 55 paths | None | Unknown | Entire library uncovered |
| @aztec/foundation | 31 paths | None | Unknown | All utilities undocumented |

---

## High-Priority Documentation Needs

### Critical (Blocking developers)
1. **@aztec/stdlib**: No overview - 55 exports with no guidance
2. **@aztec/foundation**: Zero documentation - core utilities hidden
3. **@aztec/protocol-contracts**: Missing all protocol contract descriptions
4. **@aztec/pxe**: Storage layer completely undocumented
5. **@aztec/accounts**: ECDSA variants and key management missing

### High (Useful but not blocking)
1. **@aztec/aztec.js**: Fee payment details, deployment patterns
2. **@aztec/accounts**: Base class documentation, initialization flow
3. **@aztec/pxe**: Private methods, configuration options
4. **@aztec/noir-contracts.js**: README explaining generated code

### Medium (Nice-to-have)
1. **@aztec/pxe**: Synchronization mechanics, tagging system
2. **@aztec/aztec.js**: Authorization witness patterns
3. **@aztec/accounts**: Account address computation

---

## Recommendations

### Immediate Actions (Week 1-2)
1. Add module-level JSDoc to:
   - `@aztec/stdlib/src/index.ts` (or create if missing)
   - `@aztec/foundation/src/index.ts`
   - `@aztec/protocol-contracts` main classes

2. Document critical functions:
   - All account base classes in @aztec/accounts
   - All storage providers in @aztec/pxe
   - ProtocolContractsProvider interface

3. Create README.md files for:
   - @aztec/stdlib (explaining module organization)
   - @aztec/foundation (describing utility namespaces)
   - @aztec/protocol-contracts (explaining each protocol contract)

### Short-term (Week 3-4)
1. Add JSDoc to all public methods in @aztec/pxe
2. Document fee payment system in @aztec/aztec.js
3. Create account usage guide in @aztec/accounts
4. Document key derivation and management

### Medium-term (Month 1-2)
1. Complete all remaining function documentation
2. Add type relationship documentation
3. Create decision trees for choosing account types
4. Document storage architecture
5. Add configuration references

### Tools & Process
1. Enable TypeDoc generation with current settings
2. Set up documentation build in CI/CD
3. Create documentation PR template
4. Establish JSDoc standards document

