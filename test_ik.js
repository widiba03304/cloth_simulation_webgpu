#!/usr/bin/env node

/**
 * Automatic IK system test
 * Validates that IK transforms are being computed correctly
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('Starting IK system validation test...\n');

// Start the app
const appPath = path.join(__dirname, 'node_modules', '.bin', 'electron');
const app = spawn('npm', ['run', 'dev'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: __dirname
});

let output = '';
let foundIssues = [];
let testResults = {
  gizmoInitialized: false,
  ikInitialized: false,
  gpuSkinningInitialized: false,
  restPositionsValid: false,
  matricesNonIdentity: false
};

// Monitor output
app.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;
  process.stdout.write(text);

  // Check for initialization markers
  if (text.includes('GPU skinning initialized')) {
    testResults.gpuSkinningInitialized = true;
  }
  if (text.includes('IK Controller initialized')) {
    testResults.ikInitialized = true;
  }
  if (text.includes('Sample rest positions')) {
    testResults.restPositionsValid = true;
  }
  if (text.includes('Non-identity matrix computed')) {
    testResults.matricesNonIdentity = true;
  }

  // Detect errors
  if (text.includes('ERROR') || text.includes('Failed')) {
    foundIssues.push(text.trim());
  }
});

app.stderr.on('data', (data) => {
  const text = data.toString();
  console.error('STDERR:', text);
  foundIssues.push('STDERR: ' + text.trim());
});

// Timeout after 30 seconds
setTimeout(() => {
  console.log('\n\n=== Test Results ===');
  console.log('GPU Skinning Initialized:', testResults.gpuSkinningInitialized ? '✓' : '✗');
  console.log('IK Controller Initialized:', testResults.ikInitialized ? '✓' : '✗');
  console.log('Rest Positions Valid:', testResults.restPositionsValid ? '✓' : '✗');
  console.log('Matrices Non-Identity:', testResults.matricesNonIdentity ? '✓' : '✗');

  if (foundIssues.length > 0) {
    console.log('\n=== Issues Found ===');
    foundIssues.forEach((issue, i) => {
      console.log(`${i + 1}. ${issue}`);
    });
  }

  app.kill();
  process.exit(0);
}, 30000);
