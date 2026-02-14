// Workaround for electron module loading issue
// When running inside Electron, require('electron') from npm package returns a string path
// We need to use Electron's built-in module instead

let electron;

if (process.versions.electron) {
  // We're running inside Electron
  // Try to use the built-in electron module
  try {
    // Delete the npm package from cache to force re-resolution
    const electronPath = require.resolve('electron');
    delete require.cache[electronPath];

    // Temporarily override the require to force using built-in
    const Module = require('module');
    const originalRequire = Module.prototype.require;

    Module.prototype.require = function(id) {
      if (id === 'electron') {
        // Check if we're being called from within Electron's context
        // In that case, the module should be available via process.electronBinding
        if (typeof process._linkedBinding === 'function') {
          // Use Electron's internal binding
          return originalRequire.call(this, 'electron');
        }
      }
      return originalRequire.apply(this, arguments);
    };

    electron = originalRequire.call(module, 'electron');

    // Restore original require
    Module.prototype.require = originalRequire;

  } catch (err) {
    console.error('Failed to load electron module:', err);
    throw err;
  }
} else {
  // Not running in Electron, just require normally (for build tools, etc.)
  electron = require('electron');
}

module.exports = electron;
