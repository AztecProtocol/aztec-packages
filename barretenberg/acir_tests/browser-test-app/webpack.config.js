import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import ResolveTypeScriptPlugin from "resolve-typescript-plugin";
import CopyWebpackPlugin from "copy-webpack-plugin";
import HtmlWebpackPlugin from "html-webpack-plugin";
import webpack from "webpack";

export default {
  target: "web",
  mode: "production",
  entry: {
    index: "./src/index.ts",
  },
  module: {
    parser: {
      javascript: { importMeta: false },
    },
    rules: [
      {
        test: /\.gz$/,
        type: 'asset/resource',
      },
      {
        test: /\.tsx?$/,
        use: [{ loader: "ts-loader" }],
      },
    ],
  },
  output: {
    path: resolve(dirname(fileURLToPath(import.meta.url)), "./dest"),
    filename: "[name].js",
    chunkFilename: "[name].chunk.js", // This naming pattern is used for chunks produced from code-splitting.
    library: {
      type: 'module',
    },
    chunkFormat: 'module',
  },
  experiments: {
    outputModule: true,
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          context: '../../ts/dest/browser',
          from: '*.gz',
        },
      ],
    }),
    new HtmlWebpackPlugin({ inject: false, template: "./src/index.html" }),
    new webpack.DefinePlugin({ "process.env.NODE_DEBUG": false }),
  ],
  resolve: {
    plugins: [new ResolveTypeScriptPlugin()],
  },
  devServer: {
    hot: false,
    client: {
      logging: "none",
      overlay: false,
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
};
