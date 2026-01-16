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
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'ts-loader',
      },
    ],
  },
  output: {
    path: resolve(dirname(fileURLToPath(import.meta.url)), './dist'),
    filename: '[name].js',
    chunkFilename: '[name].chunk.js', // This naming pattern is used for chunks produced from code-splitting.
  },
  plugins: [
    new HtmlWebpackPlugin({ inject: false, template: './src/index.html' }),
    new webpack.DefinePlugin({
      'process.env.NODE_DEBUG': false,
    }),
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: require.resolve('process/browser.js'),
    }),
  ],
  resolve: {
    plugins: [new ResolveTypeScriptPlugin()],
    fallback: {
      tty: false,
      os: false,
      buffer: require.resolve('buffer/'),
      process: require.resolve('process/browser.js'),
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
