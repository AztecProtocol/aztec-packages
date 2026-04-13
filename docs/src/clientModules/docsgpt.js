import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

if (ExecutionEnvironment.canUseDOM) {
  const React = require('react');
  const ReactDOM = require('react-dom/client');
  const { DocsGPTWidget } = require('docsgpt-react');

  const container = document.createElement('div');
  container.id = 'docsgpt-widget';
  document.body.appendChild(container);

  const root = ReactDOM.createRoot(container);
  root.render(
    React.createElement(DocsGPTWidget, {
      apiHost: 'http://localhost:7091',
      apiKey: 'aztec-agent-5ebd6e7b-b31b-4189-be16-88eb0a3255d4',
      title: 'Aztec Dev Assistant',
      description: 'Ask me anything about Aztec protocol, smart contracts, and privacy-preserving development.',
      heroTitle: 'Aztec Dev Assistant',
      heroDescription: 'Your AI guide to building on Aztec. Ask about contracts, privacy patterns, PXE, and more.',
      theme: 'dark',
      avatar: '/img/Aztec_Symbol_Dark.png',
      buttonBg: '#a9cc1f',
      showSources: true,
      size: {
        custom: {
          width: '85vw',
          height: '85vh',
          maxWidth: '1200px',
          maxHeight: '90vh',
        },
      },
    }),
  );
}
