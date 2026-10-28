import React, { useEffect } from 'react';
import Layout from '@theme-original/DocItem/Layout';
import { createPortal } from 'react-dom';
import CopyMarkdownButton from '@site/src/components/CopyMarkdownButton';

function PortalButton() {
  const [container, setContainer] = React.useState(null);

  useEffect(() => {
    // Find the article element and inject the button
    const article = document.querySelector('article');
    if (article) {
      article.style.position = 'relative';
      setContainer(article);
    }
  }, []);

  if (!container) return null;
  return createPortal(<CopyMarkdownButton />, container);
}

export default function LayoutWrapper(props) {
  return (
    <>
      <Layout {...props} />
      <PortalButton />
    </>
  );
}
