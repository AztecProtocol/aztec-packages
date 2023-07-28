import { glob } from 'glob';
import { createRequire } from 'module';
import path, { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import webpack from 'webpack';

const require = createRequire(import.meta.url);

// Find all test files in the 'tests' directory
const tests = glob.sync('./src/**/*.ts', { dotRelative: true });

// Create an entry object mapping test file paths to their bundled output
const entries = tests.reduce((obj, test) => {
  const entry = path.parse(test);
  const filePath = path.join(entry.dir, entry.name); // strip out the extension
  obj[filePath] = test;
  return obj;
}, {});

export default {
  target: 'web',
  entry: entries,
  mode: 'development',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.json',
            },
          },
        ],
      },
    ],
  },
  output: {
    filename: '[name].js', // 'name' corresponds to the keys of the 'entry' object
    path: resolve(dirname(fileURLToPath(import.meta.url)), './test_dest'),
  },
  plugins: [new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'] })],
  resolve: {
    extensionAlias: {
      '.js': ['.ts', '.js'],
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
      assert: require.resolve('assert'),
      buffer: require.resolve('buffer'),
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      tty: require.resolve('tty-browserify'),
    },
  },
};
