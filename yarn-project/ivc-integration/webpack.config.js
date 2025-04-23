import CopyWebpackPlugin from 'copy-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import { dirname, resolve } from 'path';
import ResolveTypeScriptPlugin from 'resolve-typescript-plugin';
import { fileURLToPath } from 'url';
import webpack from 'webpack';

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
        exclude: /node_modules|\.d\.ts(.map)?$/,
      },
      {
        test: /\.d\.ts(.map)?$/,
        loader: 'ignore-loader',
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
  ],
  resolve: {
    plugins: [new ResolveTypeScriptPlugin()],
    fallback: {
      tty: false,
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
