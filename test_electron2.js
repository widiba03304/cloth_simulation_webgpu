// Try to find the real electron module
console.log('Module paths:', require.main.paths);

// Try using Module._load directly
const Module = require('module');
try {
  const electron = Module._load('electron', require.main, false);
  console.log('Module._load electron type:', typeof electron);
  console.log('Module._load electron:', electron);
} catch (err) {
  console.error('Module._load error:', err.message);
}

// Check if there's a built-in electron
try {
  const electronPath = require.resolve('electron');
  console.log('electron resolves to:', electronPath);
} catch (err) {
  console.error('resolve error:', err.message);
}

// Try deleting the cache and re-requiring
delete require.cache[require.resolve('electron')];
const electron2 = require('electron');
console.log('After cache delete, electron type:', typeof electron2);
