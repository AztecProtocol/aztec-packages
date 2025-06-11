import React from "react";

export const General = {
  VersionLatestTestnet: () => <code>alpha-testnet</code>,
  VersionLatestSandbox: () => <code>0.87.2</code>,
  ViewTransactions: () => (
    <p>
      Transactions and balances can be viewed in block explorers like{" "}
      <a href="https://aztecexplorer.xyz">AztecExplorer</a> and{" "}
      <a href="https://aztecscan.xyz">AztecScan</a>.
    </p>
  ),
  InstallationInstructions: () => (
    <p>
      To use Aztec's suite of tools you'll need to:
      <ul>
        <li>
          <a href="https://docs.docker.com/engine/install/">Get docker</a>{" "}
          (engine or desktop)
        </li>
        <li>
          Run <code>bash -i &lt;(curl -s https://install.aztec.network)</code>
        </li>
      </ul>
    </p>
  ),

  node_ver: () => (
    <p>
      Aztec libraries use Node.js version v22.15.x (lts/jod), and backwards
      compatible from version 20. You can use{" "}
      <a href="https://github.com/nvm-sh/nvm">nvm</a> to help manage node
      versions.
    </p>
  ),

  PXE: () => (
    <p>
      <b>PXE</b> - a client-side key manager, private contract storage, and
      Private eXecution Environment for private transactions. A PXE is a core
      part of an Aztec wallet and Sandbox, but can be decoupled and run
      independently.
    </p>
  ),

  AztecNode: () => (
    <p>
      <b>Aztec Node</b> - A machine running aztec software as part of an Aztec
      network. The Aztec testnet rolls up to Ethereum Sepolia.
    </p>
  ),

  AztecSandbox: () => (
    <p>
      <b>Aztec Sandbox</b> - runs a set of Aztec tools for convenient local
      development, it includes: an Ethereum node, an Aztec node, and PXE.
    </p>
  ),

  AztecTestnetVersion: () => <span>alpha-testnet</span>,

  AztecWalletCLI: () => (
    <p>
      <b>AztecWallet</b> - is a CLI wallet, <code>aztec-wallet</code>, that
      allows a user to manage accounts and interact with an Aztec network. It
      includes a PXE.
    </p>
  ),

  Account: () => (
    <p>
      An account on Aztec is a smart contract that specifies a method of
      authentication and a method of payment, allowing it to be used by the
      protocol to perform a transaction.
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
