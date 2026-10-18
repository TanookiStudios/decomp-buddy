#!/bin/zsh
# Builds the Apple Intelligence bridge (native/apple-ai) into build/apple-ai/decomp-buddy-ai.
# Apple Silicon only and macOS 26+: older Macs can't launch it, and the app treats that as "not available".
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/apple-ai
xcrun swiftc -parse-as-library -O -target arm64-apple-macos26.0 -o build/apple-ai/decomp-buddy-ai native/apple-ai/main.swift
echo "✓ build/apple-ai/decomp-buddy-ai"
