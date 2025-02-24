import React from "react";

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

export const Gas_Components = () => (
  <p>
    The <code>Gas</code> and <code>GasFees</code> types each specify Data
    availability and L2 cost components.
  </p>
);

export const Spec_Placeholder = () => (
  <p>
    The design and implementation have largely changed since the original
    specification, and these docs will soon be updated to reflect the latest
    implementation.
  </p>
);
