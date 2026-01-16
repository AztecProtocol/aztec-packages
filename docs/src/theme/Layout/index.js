import React from 'react';
import Layout from '@theme-original/Layout';
import NPSWidget from '@site/src/components/NPSWidget';

export default function LayoutWrapper(props) {
  return (
    <>
      <Layout {...props} />
      <NPSWidget 
        siteId="aztec-docs"
      />
    </>
  );
}