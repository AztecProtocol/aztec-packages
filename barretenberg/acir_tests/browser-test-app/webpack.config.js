import { resolve, dirname } from "path";
import { createRequire } from 'module';
import { fileURLToPath } from "url";
import HtmlWebpackPlugin from "html-webpack-plugin";
import webpack from "webpack";

const require = createRequire(import.meta.url);

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
  },
  plugins: [
    new HtmlWebpackPlugin({ inject: false, template: "./src/index.html" }),
    new webpack.DefinePlugin({ "process.env.NODE_DEBUG": false }),
    new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'] }),
  ],
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    fallback: {
      buffer: require.resolve('buffer/'),
    }
  },
  devServer: {
    hot: false,
    client: {
      logging: "none",
      overlay: false,
    },
  },
};
