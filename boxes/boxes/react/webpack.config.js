import CopyPlugin from 'copy-webpack-plugin';
import { createRequire } from 'module';
import webpack from 'webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
const require = createRequire(import.meta.url);

export default (_, argv) => ({
  target: 'web',
  mode: 'production',
  devtool: 'source-map',
  entry: {
    main: './src/index.tsx',
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
        use: 'ts-loader',
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          context: '../../../barretenberg/ts/dest/browser',
          from: '*.gz',
        },
      ],
    }),
    new HtmlWebpackPlugin({
      template: './index.html',
      scriptLoading: 'module',
    }),
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: JSON.stringify(argv.mode || 'production'),
        PXE_URL: JSON.stringify(process.env.PXE_URL || 'http://localhost:8080'),
      },
    }),
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
      worker_threads: false,
      events: require.resolve('events/'),
      buffer: require.resolve('buffer/'),
      util: require.resolve('util/'),
      stream: require.resolve('stream-browserify'),
      string_decoder: require.resolve('string_decoder/'),
    },
  },
  devServer: {
    port: 5173,
    open: true,
    historyApiFallback: true,
    headers: (req, res) => {
      if (req.originalUrl.endsWith('.gz')) {
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Type', 'application/wasm');
      }
    },
  },
});
