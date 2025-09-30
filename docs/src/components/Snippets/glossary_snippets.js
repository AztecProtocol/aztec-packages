import React from "react";

export const Glossary = {
  Tools: {
    aztec: () => (
      <p>
        The CLI tool (with an extensive set of parameters) that enables users to
        perform a wide range of tasks. It can: run a node, run a sandbox,
        execute tests, generate contract interfaces for javascript...
      </p>
    ),
    aztec_nargo: () => (
      <p>
        The command line tool used to compile Aztec contracts. It is a specific
        version of <code>nargo</code>, with additional transpiler for turning a
        contract's public function code from Noir brillig bytecode into Aztec
        Virtual Machine (AVM) bytecode.
      </p>
    ),
    aztec_up: () => (
      <p>
        This tool updates the local aztec executables to the latest version
        (default behavior) or to a specified version.
      </p>
    ),
    aztec_wallet: () => (
      <p>
        The Aztec Wallet is a CLI wallet, <code>aztec-wallet</code>, that allows
        a user to manage accounts and interact with an Aztec network. It
        includes a PXE.
      </p>
    ),
  },

  Libs: {
    aztec_nr: () => (
      <p>
        A <a href="https://noir-lang.org">Noir</a> framework for writing smart
        contracts on Aztec.
      </p>
    ),
    noir_contracts: () => (
      <p>
        Programs that run on the Aztec network, written in the Noir programming
        language. They may optionally include private state and private
        functions.
      </p>
    ),
    aztec_js: () => (
      <p>
        A{" "}
        <a href="https://www.npmjs.com/package/@aztec/aztec.js">Node package</a>{" "}
        to help make Aztec dApps.
      </p>
    ),
  },

  Noir: () => (
    <p>
      Noir is a Domain Specific Language for SNARK proving systems. It is used
      for writing smart contracts in Aztec because private functions on Aztec
      are implemented as SNARKs to support privacy-preserving operations.
    </p>
  ),

  PXE: () => (
    <p>
      A client-side key manager, private contract storage, and Private eXecution
      Environment for private transactions. A PXE is a core part of an Aztec
      wallet and Sandbox, but can be decoupled and run independently.
    </p>
  ),

  AztecNode: () => (
    <p>
      A machine running aztec software as part of an Aztec network. The Aztec
      testnet rolls up to Ethereum Sepolia.
    </p>
  ),

  AztecSandbox: () => (
    <p>
      The Aztec Sandbox runs a set of Aztec tools for convenient local
      development, it includes: an Ethereum node (anvil), an Aztec node, and
      PXE.
    </p>
  ),

  Account: () => (
    <p>
      An account on Aztec is a smart contract that specifies a method of
      authentication and a method of payment, allowing it to be used by the
      protocol to perform a transaction.
    </p>
  ),

  TXE: () => (
    <p>
      TXE stands for Test eXecution Environment. It enables rapid Aztec contract
      development by using "cheatcodes" in the Aztec Sandbox that manipulate
      state. For convenience, similar "cheatcodes" to manipulate Anvil's EVM
      state are wrapped.
    </p>
  ),

  Barretenberg: () => (
    <p>
      Aztec's cryptography back-end. Refer to the graphic at the top of{" "}
      <a href="https://medium.com/aztec-protocol/explaining-the-network-in-aztec-network-166862b3ef7d">
        this page
      </a>{" "}
      to see how it fits in the Aztec architecture.
      <br />
      <br />
      Barretenberg's source code can be found{" "}
      <a href="https://github.com/AztecProtocol/barretenberg">here</a>.
    </p>
  ),
};

export const Fees = {
  FPC: () => (
    <p>
      A fee paying contract (FPC) effectively implements fee abstraction. It is
      a contract that pays for transactions of other accounts, when its own
      custom criteria is met.
    </p>
  ),

  FeeAsset_NonTransferrable: () => (
    <p>
      The fee asset is only transferrable within a block to the current
      sequencer, as it powers the fee abstraction mechanism on Aztec. The asset
      is not transferable beyond this to ensure credible neutrality between all
      third party developer made asset portals and to ensure local compliance
      rules can be followed.
    </p>
  ),
};

export const Tx_Teardown_Phase = () => (
  <p>
    Transactions can optionally have a "teardown" phase as part of their public
    execution, during which the "transaction fee" is available to public
    functions. This is useful to transactions/contracts that need to compute a
    "refund", e.g. contracts that facilitate fee abstraction.
  </p>
);

export const CLI_Add_Test_Accounts = () => (
  <p>
    For convenience, the sandbox comes with 3 initial accounts that are
    prefunded, helping bootstrap payment of any transaction. To use them, you
    will need to add them to your pxe/wallet.
  </p>
);

export const Why_Fees = () => (
  <p>
    Fees are an integral part of any protocol's design. Proper fee pricing
    contributes to the longevity and security of a network, and the fee payment
    mechanisms available inform the types of applications that can be built.
  </p>
);

export const CLI_Fees = () => (
  <p>
    The CLI tool <code>aztec-wallet</code> takes the fee payment method via the
    param: <code>--payment method=fee_juice</code>. See help for sending txs, eg{" "}
    <code>aztec-wallet help deploy</code>
  </p>
);

export const Gas_Settings = () => (
  <p>
    <code>Gas Settings</code> used in transactions specify gas limits and
    maximum fee rates (fees-per-gas)
  </p>
);

export const Gas_Settings_Components = () => (
  <p>
    The <code>Gas</code> and <code>GasFees</code> types each specify Data
    availability and L2 cost components, so the settings are:
    <ul>
      <li>gasLimits: DA and L2 gas limits</li>
      <li>
        teardownGasLimits: DA and L2 gas limits for a txs optional teardown
        operation
      </li>
      <li>maxFeesPerGas: maximum DA and L2 fees-per-gas</li>
      <li>maxPriorityFeesPerGas: maximum priority DA and L2 fees-per-gas</li>
    </ul>
  </p>
);

export const Spec_Placeholder = () => (
  <p>
    The design and implementation have largely changed since the original
    specification, and these docs will soon be updated to reflect the latest
    implementation.
  </p>
);
