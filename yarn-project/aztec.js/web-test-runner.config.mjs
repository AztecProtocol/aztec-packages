import { esbuildPlugin } from '@web/dev-server-esbuild';

export default {
  nodeResolve: true,
  files: ['src/**/*.ts'],
  plugins: [
    esbuildPlugin({
      ts: true,
    }),
  ],
  testRunnerHtml: testFramework => `
  <html>
    <head>
      <script type="module" src="${testFramework}"></script>
      <script type="module">import 'jest-browser-globals';</script>
    </head>
  </html>
`,
};
