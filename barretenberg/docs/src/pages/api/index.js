import React from 'react';
import Layout from '@theme/Layout';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import { useLocation } from '@docusaurus/router';

export default function DoxygenPage() {
  const { siteConfig } = useDocusaurusContext();
  const location = useLocation();
  
  // Get the current path and construct the Doxygen HTML path
  const doxygenBasePath = '/doxygen/';
  const currentPath = location.pathname.replace('/api', '');
  let doxygenPath = doxygenBasePath;
  
  // If there's a specific path, use it, otherwise default to index.html
  if (currentPath && currentPath !== '/') {
    doxygenPath += currentPath.startsWith('/') ? currentPath.slice(1) : currentPath;
  } else {
    doxygenPath += 'index.html';
  }

  return (
    <Layout title="API Documentation" description="Barretenberg C++ API Documentation">
      <div style={{ height: 'calc(100vh - 60px)' }}>
        <iframe
          src={doxygenPath}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          title="Doxygen Documentation"
        />
      </div>
    </Layout>
  );
}