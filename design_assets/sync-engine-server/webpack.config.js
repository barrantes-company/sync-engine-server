const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  mode: 'production',
  target: 'node',
  entry: './server.js',
  output: {
    path: __dirname,
    filename: 'server.bundle.js'
  },
  externalsPresets: {
    node: true
  },
  externals: [nodeExternals()]
};
