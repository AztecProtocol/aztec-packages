import { createRequire } from 'module';
import webpack from 'webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
const require = createRequire(import.meta.url);

export default (_, argv) => ({
  target: 'web',
  mode: 'production',
  devtool: 'source-map',
  entry: {
    main: './src/index.ts',
  },
  module: {
    rules: [
      {
        test: /\.ts?$/,
        use: 'ts-loader',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
    }),
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: JSON.stringify(argv.mode || 'production'),
      },
    }),
    new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'] }),
  ],
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    fallback: {
      crypto: false,
      os: false,
      fs: false,
      path: false,
      url: false,
      worker_threads: false,
      events: require.resolve('events/'),
      buffer: require.resolve('buffer/'),
      util: require.resolve('util/'),
      stream: require.resolve('stream-browserify'),
      string_decoder: require.resolve('string_decoder/'),
      tty: require.resolve('tty-browserify'),
    },
  },
  devServer: {
    port: 5173,
    historyApiFallback: true,
    open: true,
  },
});
