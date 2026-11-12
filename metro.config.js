const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// the 3D model of Lumi ships as a binary glTF file
if (!config.resolver.assetExts.includes('glb')) config.resolver.assetExts.push('glb');

module.exports = config;
