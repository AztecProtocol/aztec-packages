import { createRequire } from 'module';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import webpack from 'webpack';

const require = createRequire(import.meta.url);

export default {
  target: 'web',
  mode: 'production',
  devtool: false,
  entry: {
    main: './src/web/main.ts',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.web.json',
            },
          },
        ],
      },
    ],
  },
  output: {
    path: resolve(dirname(fileURLToPath(import.meta.url)), './src/web'),
    publicPath: '/',
    library: {
      type: 'module',
    },
    chunkFormat: 'module',
  },
  experiments: {
    outputModule: true,
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: JSON.stringify('production'),
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
      tty: false,
      worker_threads: false,
      buffer: require.resolve('buffer/'),
      util: require.resolve('util/'),
      stream: require.resolve('stream-browserify'),
    },
  },
};
