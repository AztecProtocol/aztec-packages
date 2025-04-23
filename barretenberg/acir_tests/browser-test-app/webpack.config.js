import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import HtmlWebpackPlugin from "html-webpack-plugin";
import webpack from "webpack";

export default {
  target: "web",
  mode: "production",
  entry: {
    index: "./src/index.ts",
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
    path: resolve(dirname(fileURLToPath(import.meta.url)), "./dest"),
    filename: "[name].js",
    chunkFormat: 'module',
  },
  experiments: {
    outputModule: true,
  },
  optimization: {
    splitChunks: {
      // Cannot use async due to https://github.com/webpack/webpack/issues/17014
      // messing with module workers loaded asynchronously.
      chunks: /barretenberg.*.js/,
    },
  },
  plugins: [
    new HtmlWebpackPlugin({ inject: false, template: "./src/index.html" }),
    new webpack.DefinePlugin({ "process.env.NODE_DEBUG": false }),
  ],
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  devServer: {
    hot: false,
    client: {
      logging: "none",
      overlay: false,
    },
  },
};
