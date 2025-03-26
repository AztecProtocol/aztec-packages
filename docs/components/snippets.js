import React from "react";

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
