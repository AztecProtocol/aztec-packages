import React from 'react';
import Layout from '@theme-original/Layout';
import NPSWidget from '@site/src/components/NPSWidget';

export default function LayoutWrapper(props) {
  return (
    <>
      <Layout {...props} />
      <NPSWidget 
        siteId="aztec-docs"
        showAfterSeconds={180} // 3 minutes total session time
        scrollThreshold={50} // Show when 50% through content
        pageViewsBeforeShow={2} // Show after 2nd page view
        timeOnPageBeforeShow={120} // 2 minutes actively on current page
      />
    </>
  );
}