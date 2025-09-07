---
title: "Development Environment Setup"
description: "Setting up your Aztec.nr development environment with all necessary tools and understanding the development workflow."
sidebar_position: 1
tags: [development-environment, setup, tools, workflow]
---

# Development Environment Setup

## Overview

Building privacy-preserving smart contracts requires a specialized development environment. Unlike traditional smart contract development, Aztec.nr involves additional steps for proof generation and private execution. Let's set up your complete development workspace.

## Required Tools

### 1. Aztec Sandbox

The **Aztec Sandbox** is your local development network - like Ganache for Ethereum, but for Aztec.

**What it provides:**
- Local Aztec network for testing
- PXE (Private Execution Environment) 
- Sequencer and prover simulation
- Pre-funded test accounts
- Development APIs and interfaces

**Installation:**
```bash
# Install Aztec CLI
bash -i <(curl -s https://install.aztec.network)

# Start the sandbox (this may take a few minutes on first run)
aztec start --sandbox
```

**Verification:**
```bash
# Check sandbox is running
aztec get-node-info
```

### 2. Aztec.nr Development Tools

**Aztec Nargo** - The Aztec.nr compiler and package manager:

```bash
# Install Aztec-specific version of Nargo
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/noir/noir-repo/scripts/install_nargo.sh | bash

# Verify installation
aztec-nargo --version
```

**Why Aztec Nargo?**
- Standard Nargo compiles to circuits
- Aztec Nargo adds Aztec-specific features
- Handles contract compilation and artifact generation
- Manages dependencies for Aztec.nr libraries

### 3. Node.js and Package Manager

For testing and deployment scripts:

```bash
# Install Node.js (version 18 or later)
# Visit https://nodejs.org or use your package manager

# Verify installation
node --version
npm --version
```

### 4. Code Editor Setup

**VS Code with Extensions:**
```bash
# Install recommended extensions
code --install-extension noir-lang.noir-syntax
code --install-extension AztecProtocol.aztec-syntax-highlighting
```

**Alternative Editors:**
- Any editor with Rust syntax highlighting works reasonably well
- Noir language server provides better completion (if available)

## Project Structure

Let's create your first Aztec.nr project:

```bash
# Create new project directory
mkdir my-first-aztec-contract
cd my-first-aztec-contract

# Initialize Aztec.nr project
aztec-nargo init --contract

# Project structure created:
ls -la
```

**Generated Project Structure:**
```
my-first-aztec-contract/
├── Nargo.toml          # Project configuration and dependencies
├── src/
│   └── main.nr         # Your contract code
└── tests/
    └── contract.test.ts # TypeScript tests
```

### Understanding Nargo.toml

```toml
[package]
name = "my_first_aztec_contract"
type = "contract"
authors = [""]
compiler_version = ">=0.18.0"

[dependencies]
# Core Aztec library - always required
aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir/noir-projects/aztec-nr/aztec" }

# Common note types
value_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir/noir-projects/aztec-nr/value-note" }
```

**Key Configuration:**
- `type = "contract"` - Tells Nargo this is an Aztec contract
- `aztec` dependency - Core Aztec.nr functionality
- Version tags ensure compatibility with your Aztec sandbox

## Development Workflow

Understanding the complete development workflow helps you work efficiently:

### 1. Code → Compile → Deploy Workflow

```bash
# 1. Write your contract (src/main.nr)
# 2. Compile the contract
aztec-nargo compile

# 3. Generate TypeScript interfaces
aztec codegen target --outdir src/artifacts

# 4. Deploy using TypeScript/JavaScript
npm run deploy
```

### 2. What Happens During Compilation

```
Aztec.nr Source Code
        ↓
Noir Compiler (aztec-nargo compile)
        ↓  
Contract Artifacts (.json files)
        ↓
Aztec Postprocessing (automatic)
        ↓
AVM Bytecode + Circuit Artifacts
        ↓
Codegen (aztec codegen)
        ↓
TypeScript Interfaces (.ts files)
```

**Generated Artifacts:**
```
target/
├── my_contract-MyContract.json    # Contract ABI and bytecode
├── my_contract.json               # Contract metadata
└── ... (other compilation artifacts)

src/artifacts/
├── MyContract.ts                  # TypeScript contract interface  
└── ... (generated TypeScript files)
```

## Testing Environment Setup

### Setting Up TypeScript Testing

```bash
# Initialize npm project (if not already done)
npm init -y

# Install testing dependencies
npm install --save-dev @aztec/aztec.js @aztec/circuits.js @aztec/types
npm install --save-dev typescript @types/node jest ts-jest

# Create test configuration
echo '{
  "preset": "ts-jest",
  "testEnvironment": "node",
  "roots": ["<rootDir>/tests"]
}' > jest.config.json
```

### Basic Test Structure

```typescript
// tests/contract.test.ts
import { 
  AztecAddress, 
  Contract, 
  PXE, 
  Wallet, 
  createPXEClient, 
  getInitialTestAccountsWallets 
} from '@aztec/aztec.js';
import { MyContractArtifact } from '../src/artifacts/MyContract.js';

describe('MyContract', () => {
  let pxe: PXE;
  let wallet: Wallet;
  let contract: Contract;

  beforeAll(async () => {
    // Connect to sandbox
    pxe = createPXEClient(process.env.PXE_URL || 'http://localhost:8080');
    
    // Get test wallet
    const wallets = await getInitialTestAccountsWallets(pxe);
    wallet = wallets[0];

    // Deploy contract
    contract = await Contract.deploy(wallet, MyContractArtifact, []).send().deployed();
  });

  test('should deploy successfully', async () => {
    expect(contract.address).toBeDefined();
  });
});
```

## Environment Variables and Configuration

### Setting Up Environment Variables

Create `.env` file in your project root:

```bash
# .env
AZTEC_NODE_URL=http://localhost:8080
PXE_URL=http://localhost:8080
ETHEREUM_HOST=http://localhost:8545
DEBUG=aztec:*
```

**Environment Variables Explained:**
- `AZTEC_NODE_URL` - Your Aztec sandbox endpoint
- `PXE_URL` - Private Execution Environment endpoint  
- `ETHEREUM_HOST` - L1 Ethereum endpoint (for L1-L2 interactions)
- `DEBUG` - Enable debug logging for development

### Loading Environment Variables

```javascript
// In your deployment/test scripts
import dotenv from 'dotenv';
dotenv.config();

const PXE_URL = process.env.PXE_URL || 'http://localhost:8080';
```

## Debugging and Development Tools

### Aztec CLI for Development

```bash
# Check sandbox status  
aztec get-node-info

# View accounts in your sandbox
aztec get-accounts

# Check contract deployment
aztec get-contract-data <contract-address>

# Monitor logs
aztec logs --follow
```

### Browser-based Development Tools

Access the Aztec Sandbox dashboard:
```
http://localhost:8080
```

**Dashboard Features:**
- Account management
- Transaction history
- Contract interaction interface
- Network status monitoring
- Debug information

## Common Setup Issues and Solutions

### Issue 1: Sandbox Won't Start

**Symptoms:** `aztec start --sandbox` fails or hangs

**Solutions:**
```bash
# Clear previous sandbox data
aztec clean

# Start with fresh state
aztec start --sandbox --force

# Check for port conflicts
lsof -i :8080
```

### Issue 2: Compilation Errors

**Symptoms:** `aztec-nargo compile` fails with version errors

**Solutions:**
```bash
# Update to latest Aztec version
aztec update

# Clean and recompile
aztec-nargo clean
aztec-nargo compile
```

### Issue 3: TypeScript Interface Generation Fails

**Symptoms:** `aztec codegen` doesn't generate TypeScript files

**Solutions:**
```bash
# Ensure contract compiled successfully first
aztec-nargo compile

# Generate interfaces with correct target
aztec codegen target --outdir src/artifacts

# Check for naming conflicts in contract
```

## Development Best Practices

### Project Organization

```
my-aztec-project/
├── contracts/           # Multiple contracts
│   ├── Counter.nr
│   ├── Token.nr
│   └── lib.nr          # Shared utilities
├── src/
│   ├── artifacts/      # Generated interfaces
│   ├── deploy/         # Deployment scripts
│   └── tests/          # Integration tests
├── scripts/            # Utility scripts
├── Nargo.toml          # Dependencies
└── package.json        # Node.js dependencies
```

### Version Management

```bash
# Always pin Aztec versions in Nargo.toml
aztec = { git="...", tag="v0.XX.X", directory="..." }

# Update all dependencies together
aztec update

# Check for version compatibility
aztec-nargo check
```

### Testing Strategy

1. **Unit Tests:** Test individual functions in isolation
2. **Integration Tests:** Test complete contract workflows
3. **End-to-End Tests:** Test with frontend integration
4. **Privacy Tests:** Verify privacy properties hold

## Ready to Code!

Your development environment is now set up with:
- ✅ Aztec Sandbox running locally
- ✅ Aztec.nr compilation tools installed
- ✅ Testing framework configured  
- ✅ Development workflow understood

## Next Steps

Now that your environment is ready, let's write your first privacy-preserving smart contract!

**Continue to:** [Your First Private Contract →](/aztec/learning_journey/phase_5/first_private_contract)

---

**Phase 5 Navigation:**  
← *Phase 5 Overview* | **Development Environment** | [First Private Contract →](/aztec/learning_journey/phase_5/first_private_contract)