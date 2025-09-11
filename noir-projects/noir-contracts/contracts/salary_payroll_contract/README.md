# SalaryPayroll Contract

The `SalaryPayroll` contract is a minimal Aztec.nr example that demonstrates how to define public functions, enforce constraints, and successfully compile a smart contract with Aztec.

## Overview

This contract is intentionally simple, focusing on the basics of Aztec.nr:

- Registering an employee with a salary  
- Simulating a salary withdrawal  
- Demonstrating `#[aztec]` and `#[public]` macros  
- Explaining why `pub` return types are required for entrypoints  

The goal is to provide a clean starting point for developers exploring Aztec smart contracts.

---

## Project Structure

salary_payroll_contract/
│
├── Nargo.toml # Project metadata & dependencies
├── README.md # Documentation
└── src/
└── main.nr # Contract source code

rust
Copy code

---

## Contract Code

```rust
use dep::aztec::macros::aztec;

#[aztec]
pub contract SalaryPayroll {
    use dep::aztec::macros::{functions::{public}, storage::storage};
    use dep::aztec::prelude::{AztecAddress};

    #[public]
    fn add_employee(_employee_id: u64, salary: u64) -> pub bool {
        assert(salary >= 1);
        assert(salary <= 1_000_000);
        true
    }

    #[public]
    fn withdraw_salary(_employee_id: u64) -> pub bool {
        true
    }
}
Compilation
Ensure you are on Aztec v1.2.0:

bash
Copy code
aztec-up -v 1.2.0
Compile the contract:

bash
Copy code
$aztec-nargo compile
Expected output:

bash
Copy code
Saved contract artifact to: target/salary_payroll-SalaryPayroll.json
The generated JSON artifact can be consumed by Aztec.js for deployment or integration tests.

Optional: Deploy with Aztec.js
This example can also be deployed to the Aztec sandbox.

Start the sandbox:

bash
Copy code
$aztec start --sandbox
Generate TypeScript bindings:

bash
Copy code
$aztec codegen target --outdir ts/artifacts
Example script (ts/index.ts):

ts
Copy code
import { createPXEClient, waitForPXE, getInitialTestAccountsWallets } from "@aztec/aztec.js";
import { SalaryPayrollContract } from "../artifacts/SalaryPayroll.js";

const run = async () => {
  const pxe = createPXEClient("http://localhost:8080");
  await waitForPXE(pxe);

  const wallets = await getInitialTestAccountsWallets(pxe);
  const deployerWallet = wallets[0];

  const payroll = await SalaryPayrollContract.deploy(deployerWallet).send().wait();

  console.log("Contract deployed at:", payroll.address.toString());
};

run().catch(console.error);
Run:

bash
Copy code
 $npm start
Why This Example?
Resolves common beginner errors (public not in scope, missing pub keyword)

Provides a minimal but valid reference contract

Shows end-to-end flow: write → compile → artifact → deploy

Serves as a foundation for more advanced payroll or HR modules

Contribution Notes
This example is designed as a developer-friendly reference.
If merged, it can be added under noir-contracts/contracts/examples/salary_payroll_contract/ to help new contributors and developers quickly get started with Aztec.nr.



