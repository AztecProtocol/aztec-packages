import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import ResolveTypeScriptPlugin from "resolve-typescript-plugin";
import CopyWebpackPlugin from "copy-webpack-plugin";
import HtmlWebpackPlugin from "html-webpack-plugin";
import webpack from "webpack";

export default {
  target: "web",
  mode: "production",
  // devtool: false,
  entry: {
    index: "./src/index.ts",
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [{ loader: "ts-loader" }],
      },
    ],
  },
  // optimization: {
  //   splitChunks: {
  //     chunks: "all", // This is key. It specifies to use code-splitting for all chunks, including those imported dynamically.
  //   },
  // },
  output: {
    path: resolve(dirname(fileURLToPath(import.meta.url)), "./dest"),
    filename: "[name].js",
    chunkFilename: "[name].chunk.js", // This naming pattern is used for chunks produced from code-splitting.
  },
  plugins: [
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
