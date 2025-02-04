import CopyPlugin from 'copy-webpack-plugin';
import { createRequire } from 'module';
import { dirname, resolve } from 'path';
import ResolveTypeScriptPlugin from 'resolve-typescript-plugin';
import { fileURLToPath } from 'url';
import webpack from 'webpack';

const require = createRequire(import.meta.url);

export default {
  target: 'web',
  mode: 'production',
  devtool: false,
  entry: {
    index: './src/index.ts',
    'interfaces/pxe': './src/api/interfaces/pxe.ts',
    abi: './src/api/abi.ts',
    account: './src/api/account.ts',
    addresses: './src/api/addresses.ts',
    contracts: './src/contract/index.ts',
    deployment: './src/api/deployment.ts',
    entrypoint: './src/api/entrypoint.ts',
    eth_address: './src/api/eth_address.ts',
    ethereum: './src/api/ethereum/index.ts',
    fee: './src/api/fee.ts',
    fields: './src/api/fields.ts',
    log_id: './src/api/log_id.ts',
    rpc: './src/rpc_clients/index.ts',
    tx_hash: './src/api/tx_hash.ts',
    wallet: './src/api/wallet.ts',
    utils: './src/utils/index.ts',
  },
  module: {
    rules: [
      {
        test: /\.wasm\.gz$/,
        type: 'asset/resource',
        generator: {
          filename: '[base]',
          publicPath: '/',
        },
      },
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.browser.json',
              onlyCompileBundledFiles: true,
            },
          },
        ],
      },
    ],
  },
  output: {
    filename: '[name].js',
    path: resolve(dirname(fileURLToPath(import.meta.url)), './dest/browser'),
    library: {
      type: 'module',
    },
    chunkFormat: 'module',
    chunkFilename: '[name].chunk.js',
  },
  experiments: {
    outputModule: true,
  },
  optimization: {
    runtimeChunk: 'single',
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        bb: {
          test: /[\\/](bb\.js|barretenberg)[\\/]/,
          chunks: 'all',
          name: 'bb',
          reuseExistingChunk: true,
        },
        vendor: {
          test: /[\\/]node_modules[\\/](!viem)[\\/]/,
          chunks: 'all',
          name: 'vendor',
          reuseExistingChunk: true,
        },
        'vendor-viem': {
          test: /[\\/]node_modules[\\/](viem)[\\/]/,
          chunks: 'all',
          name: 'vendor-viem',
          reuseExistingChunk: true,
        },
      },
    },
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          // createRequire resolves the cjs version, so we need to go up one level
          context: resolve(require.resolve('@aztec/bb.js'), '../../browser'),
          from: '*.gz',
        },
      ],
    }),
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: JSON.stringify('production'),
      },
    }),
    new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'] }),
  ],
  resolve: {
    plugins: [new ResolveTypeScriptPlugin()],
    alias: {
      // All node specific code, wherever it's located, should be imported as below.
      // Provides a clean and simple way to always strip out the node code for the web build.
      './node/index.js': false,
    },
    fallback: {
      crypto: false,
      os: false,
      fs: false,
      path: false,
      url: false,
      tty: false,
      worker_threads: false,
      buffer: require.resolve('buffer/'),
      util: require.resolve('util/'),
      stream: require.resolve('stream-browserify'),
    },
  },
  performance: {
    hints: 'error',
    maxAssetSize: 2.7 * 1024 * 1024, // 2.7MB
    maxEntrypointSize: 3 * 1024 * 1024, // 3MB
  },
};
