#!/bin/zsh
# Builds the Apple Intelligence bridge (native/apple-ai) into build/apple-ai/decomp-buddy-ai.
# Apple Silicon only. Before macOS 26 the FoundationModels framework doesn't exist, so the loader stops it with
# "Library not loaded" (the minos stamp alone does NOT stop it - checked 18 Oct 2026); the app reads any failure as "not available".
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/apple-ai
xcrun swiftc -parse-as-library -O -target arm64-apple-macos26.0 -o build/apple-ai/decomp-buddy-ai native/apple-ai/main.swift native/apple-ai/status.swift
echo "✓ build/apple-ai/decomp-buddy-ai"
