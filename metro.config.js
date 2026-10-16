// Learn more https://docs.expo.io/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// GramJS (the `telegram` package) imports Node built-ins. Expo Go has no Node
// runtime, so route them to small shims in src/shims.
const shim = (name) => path.resolve(__dirname, 'src/shims', name);
const nodeShims = {
  crypto: shim('crypto.js'),
  os: shim('os.js'),
  path: shim('path.js'),
  util: shim('util.js'),
  fs: shim('empty.js'),
  net: shim('empty.js'),
  socks: shim('empty.js'),
  websocket: shim('empty.js'),
  'node-localstorage': shim('empty.js'),
  store2: shim('empty.js'),
};

const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (Object.prototype.hasOwnProperty.call(nodeShims, moduleName)) {
    return { type: 'sourceFile', filePath: nodeShims[moduleName] };
  }
  return (upstreamResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
