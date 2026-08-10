#!/bin/bash
# Eski baslat.sh — kullanıcı için ana dosya: Uygulamayi-Baslat.command
cd "$(dirname "$0")"
chmod +x "./Uygulamayi-Baslat.command" 2>/dev/null || true
exec "./Uygulamayi-Baslat.command"
