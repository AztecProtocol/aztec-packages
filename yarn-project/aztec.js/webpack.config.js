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
    main: './src/index.ts',
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
              configFile: 'tsconfig.dest.json',
              transpileOnly: true,
            },
          },
        ],
      },
    ],
  },
  output: {
    path: resolve(dirname(fileURLToPath(import.meta.url)), './dest'),
    filename: 'main.js',
    library: {
      type: 'module',
    },
    chunkFormat: 'module',
  },
  experiments: {
    outputModule: true,
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
};
