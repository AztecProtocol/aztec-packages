import CopyWebpackPlugin from 'copy-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import { createRequire } from 'module';
import { dirname, resolve } from 'path';
import ResolveTypeScriptPlugin from 'resolve-typescript-plugin';
import { fileURLToPath } from 'url';
import webpack from 'webpack';

const require = createRequire(import.meta.url);

export default {
  target: 'web',
  mode: 'production',
  entry: {
    index: './src/serve.ts',
  },
  ignoreWarnings: [
    {
      module: /node_modules/,
    },
    {
      message: /node\/bbapi_log/,
    },
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /\.test\.tsx?$/,
        loader: 'ts-loader',
        options: {
          transpileOnly: true, // Skip type checking in webpack (use tsc separately)
        },
      },
    ],
  },
  output: {
    path: resolve(dirname(fileURLToPath(import.meta.url)), './dest'),
    filename: '[name].js',
    chunkFilename: '[name].chunk.js', // This naming pattern is used for chunks produced from code-splitting.
  },
  plugins: [
    new HtmlWebpackPlugin({ inject: false, template: './src/index.html' }),
    new webpack.DefinePlugin({ 'process.env.NODE_DEBUG': false }),
    // Replace node/bbapi_log with a stub for browser builds
    new webpack.NormalModuleReplacementPlugin(
      /node\/bbapi_log\.js$/,
      resolve(dirname(fileURLToPath(import.meta.url)), './src/bbapi_log_stub.ts'),
    ),
    // Provide Buffer global for browser
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
    }),
  ],
  resolve: {
    plugins: [new ResolveTypeScriptPlugin()],
    fallback: {
      buffer: require.resolve('buffer/'),
      tty: false,
      os: false,
    },
    alias: {
      // Stub out the node bbapi_log module for browser builds
      // The runtime check ensures this code path is never executed in browser
      '../../barretenberg/ts/dest/browser/cbind/node/bbapi_log.js': false,
    },
  },
  devServer: {
    hot: false,
    client: {
      logging: 'none',
      overlay: false,
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
};
