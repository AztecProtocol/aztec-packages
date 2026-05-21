import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import CopyPlugin from 'copy-webpack-plugin';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default {
  mode: 'production',
  entry: {
    main: './src/index.ts',
  },
  output: {
    path: resolve(__dirname, 'dest'),
    filename: '[name].js',
    publicPath: '',
    workerPublicPath: '',
  },
  resolve: {
    extensions: ['.ts', '.js'],
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: { loader: 'ts-loader', options: { transpileOnly: true } },
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: 'src/index.html',
      inject: 'body',
    }),
    new CopyPlugin({
      patterns: [
        {
          from: resolve(__dirname, '../cpp/build-wasm-threads/bin/barretenberg.wasm.gz'),
          to: 'barretenberg.wasm.gz',
          noErrorOnMissing: true,
        },
      ],
    }),
  ],
  experiments: {
    asyncWebAssembly: true,
  },
  performance: {
    hints: false,
    maxAssetSize: 8 * 1024 * 1024,
    maxEntrypointSize: 8 * 1024 * 1024,
  },
};
