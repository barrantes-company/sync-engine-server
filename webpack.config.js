const path = require('path');
const nodeExternals = require('webpack-node-externals');

function isNpmPackageRequest(request) {
  return Boolean(request) && !request.startsWith('.') && !path.isAbsolute(request);
}

module.exports = {
  mode: 'production',
  target: 'node',
  context: __dirname,
  entry: './server.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'server.js',
    library: {
      type: 'commonjs2'
    },
    clean: true
  },
  externalsPresets: {
    node: true
  },
  // nodeExternals() only sees packages already present in node_modules.
  // CI/local installs can omit optional trees, and firebase-admin uses
  // subpath exports (firebase-admin/app) that must stay external.
  externals: [
    nodeExternals({
      modulesFromFile: {
        excludeFromBundle: ['dependencies', 'optionalDependencies', 'peerDependencies']
      }
    }),
    ({ request }, callback) => {
      if (isNpmPackageRequest(request)) {
        return callback(null, 'commonjs ' + request);
      }
      callback();
    }
  ],
  node: {
    __dirname: false,
    __filename: false
  },
  resolve: {
    extensions: ['.js', '.json']
  },
  optimization: {
    minimize: false
  },
  stats: {
    errorDetails: true
  },
  ignoreWarnings: [
    { message: /Critical dependency: the request of a dependency is an expression/ }
  ]
};
