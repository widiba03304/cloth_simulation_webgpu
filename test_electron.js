// Test electron environment
console.log('process.versions:', process.versions);
console.log('process.type:', process.type);
console.log('typeof process.electronBinding:', typeof process.electronBinding);

// Try to get electron
try {
  const electron = require('electron');
  console.log('electron type:', typeof electron);
  console.log('electron value:', electron);
} catch (err) {
  console.error('Error requiring electron:', err.message);
}
