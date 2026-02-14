#!/bin/bash

# WebGPU Browser Test Runner
# Starts a local HTTP server and opens the WebGPU test page

echo "🚀 Starting WebGPU Test Server..."
echo ""
echo "Opening WebGPU test page in your default browser..."
echo "URL: http://localhost:8888/tests/webgpu-browser-test.html"
echo ""
echo "Requirements:"
echo "  - Chrome 113+ or Edge 113+ (WebGPU enabled)"
echo "  - macOS: Chrome/Edge should work out of the box"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start Python HTTP server on port 8888
cd "$(dirname "$0")"

# Try python3 first, fallback to python
if command -v python3 &> /dev/null; then
    python3 -m http.server 8888
elif command -v python &> /dev/null; then
    python -m http.server 8888
else
    echo "Error: Python not found. Please install Python 3."
    exit 1
fi
