import { createRequire } from 'module';
import webpack from 'webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import Dotenv from 'dotenv-webpack';

const require = createRequire(import.meta.url);

export default (_, argv) => ({
  target: 'web',
  mode: argv.mode || 'production',
  devtool: 'source-map',
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
    extensions: ['.tsx', '.ts', '.js'],
    fallback: {
      assert: require.resolve('assert/'),
      crypto: false,
      os: false,
      fs: false,
      path: false,
      tty: false,
      url: false,
      net: false,
      worker_threads: false,
      events: require.resolve('events/'),
      buffer: require.resolve('buffer/'),
      util: require.resolve('util/'),
      stream: require.resolve('stream-browserify'),
      string_decoder: require.resolve('string_decoder/'),
    },
  },
  devServer: {
    port: 3000,
    open: true,
    historyApiFallback: true,
  },
});
