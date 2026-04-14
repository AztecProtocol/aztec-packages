/**
 * Placeholder for aztecjs_runner
 *
 * This project is a test runner for aztec.js documentation examples.
 * Use ./run.sh to execute the examples against a live local network.
 *
 * The actual example files are in sibling directories:
 * - aztecjs_connection/index.ts
 * - aztecjs_advanced/index.ts
 * - aztecjs_authwit/index.ts
 * - aztecjs_testing/index.ts
 */

// Import dependencies to verify they resolve correctly
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import { Fr } from "@aztec/aztec.js/fields";

// Export to satisfy noUnusedLocals
export { createAztecNodeClient, EmbeddedWallet, TokenContract, Fr };

console.log("aztecjs_runner: Use ./run.sh to execute examples against a live network");
