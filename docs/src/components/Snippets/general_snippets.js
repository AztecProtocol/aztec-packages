import React from "react";

export const General = {
  VersionLatestTestnet: () => <code>testnet</code>,
  VersionLatestLocalNetwork: () => <code>0.87.2</code>,
  ViewTransactions: () => (
    <p>
      Transactions and balances can be viewed in block explorers like{" "}
      <a href="https://aztecexplorer.xyz">AztecExplorer</a> and{" "}
      <a href="https://aztecscan.xyz">AztecScan</a>.
    </p>
  ),
  InstallationInstructions: () => (
    <p>
      To use Aztec's suite of tools, run:{" "}
      <code>
        VERSION=&lt;version&gt; bash -i &lt;(curl -sL
        https://install.aztec.network/&lt;version&gt;)
      </code>
    </p>
  ),

  node_ver: () => (
    <p>
      Aztec libraries require Node.js version 24. If you have an older version
      installed, the installer will try to upgrade via{" "}
      <a href="https://github.com/nvm-sh/nvm">nvm</a> if available. If nvm is
      not installed, you will need to upgrade Node.js manually (e.g.{" "}
      <code>nvm install 24</code> after installing nvm).
    </p>
  ),

  PXE: () => (
    <p>
      <b>PXE</b> - a client-side key manager, private contract storage, and
      Private eXecution Environment for private transactions. A PXE is a core
      part of an Aztec wallet .
    </p>
  ),

  AztecNode: () => (
    <p>
      <b>Aztec Node</b> - A machine running aztec software as part of an Aztec
      network. The Aztec testnet rolls up to Ethereum Sepolia.
    </p>
  ),

  AztecLocalNetwork: () => (
    <p>
      <b>Aztec's Local network</b> - runs a set of Aztec tools for convenient
      local development, it includes: an Ethereum node, an Aztec node, and PXE.
    </p>
  ),

  AztecTestnetVersion: () => <span>testnet</span>,

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

  AztecJSPrerequisites: ({ href = "how_to_connect_to_local_network" }) => (
    <>
      <a href={href}>Connected to a network</a> with an{" "}
      <code>EmbeddedWallet</code> instance and funded accounts
    </>
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
    For convenience, the local network comes with 3 initial accounts that are
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
      <li>
        gasLimits: total DA and L2 gas limits for the transaction, covering all
        phases including teardown
      </li>
      <li>
        teardownGasLimits: portion of gasLimits reserved for an optional
        teardown call. A tx with a teardown call is billed these limits in full,
        regardless of actual teardown consumption
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
