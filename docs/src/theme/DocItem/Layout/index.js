import React, { useEffect } from 'react';
import Layout from '@theme-original/DocItem/Layout';
import { createPortal } from 'react-dom';
import { useDoc } from '@docusaurus/plugin-content-docs/client';
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
  // Pages with a custom hero (the landing page) opt out via front matter so the
  // button does not float over the hero panel.
  const { frontMatter } = useDoc();
  return (
    <>
      <Layout {...props} />
      {!frontMatter.hide_copy_button && <PortalButton />}
    </>
  );
}
