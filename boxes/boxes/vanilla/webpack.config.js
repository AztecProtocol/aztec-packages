import { createRequire } from 'module';
import webpack from 'webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import Dotenv from 'dotenv-webpack';

const require = createRequire(import.meta.url);

export default (_, argv) => ({
  target: 'web',
  devtool: 'source-map',
  mode: argv.mode || 'development',
  entry: {
    main: './app/main.ts',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'ts-loader',
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './app/index.html',
      scriptLoading: 'module',
    }),
    new Dotenv({ path: './.env' }),
    new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'] }),
  ],
  resolve: {
    extensions: ['.ts', '.js'],
    fallback: {
      tty: false,
      path: false,
      net: false,
      crypto: false,
      util: require.resolve('util/'),
      assert: require.resolve('assert/'),
      buffer: require.resolve('buffer/'),
    },
  },
  devServer: {
    port: 3000,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    },
    client: {
      overlay: false,
    },
  },
});
