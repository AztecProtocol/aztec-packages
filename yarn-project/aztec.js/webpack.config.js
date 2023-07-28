import { createRequire } from 'module';
import path, { dirname, resolve } from 'path';
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
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.dest.json',
            },
          },
        ],
      },
    ],
  },
  output: {
    path: resolve(dirname(fileURLToPath(import.meta.url)), './dest'),
    filename: '[name].js',
    library: {
      type: 'module',
    },
    chunkFormat: 'module',
  },
  experiments: {
    outputModule: true,
  },
  plugins: [new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'] })],
  resolve: {
    extensionAlias: {
      '.js': ['.ts', '.js'],
      '.mjs': ['.mts', '.mjs'],
    },
    alias: {
      './node/index.js': false,
    },
    fallback: {
      fs: false,
      os: false,
      path: false,
      util: false,
      url: false,
      tty: false,
      worker_threads: false,
      buffer: require.resolve('buffer'),
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      tty: require.resolve('tty-browserify'),
    },
  },
};
