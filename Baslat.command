#!/bin/bash
# Compatibility wrapper — use Start.command
cd "$(dirname "$0")" || exit 1
exec ./Start.command
