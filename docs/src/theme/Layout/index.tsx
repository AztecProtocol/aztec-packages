import React, { useContext, createContext, useState, useEffect } from "react";
import { TestProvider } from "../../theme/Root";

import Layout from "@theme-original/Layout";
import type LayoutType from "@theme/Layout";
import type { WrapperProps } from "@docusaurus/types";

type Props = WrapperProps<typeof LayoutType>;

export default function LayoutWrapper(props: Props): JSX.Element {
  return (
    <TestProvider>
      <Layout {...props} />
    </TestProvider>
  );
}
