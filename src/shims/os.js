const { Platform } = require('react-native');

module.exports = {
  type: () => (Platform.OS === 'ios' ? 'iPhone' : 'Android'),
  release: () => String(Platform.Version ?? '1.0'),
};
