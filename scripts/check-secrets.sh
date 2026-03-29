#!/bin/bash
# ═══════════════════════════════════════════════
# SECRET SCANNER — run before every commit
# Catches leaked keys, tokens, passwords, URLs
# ═══════════════════════════════════════════════

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'
FAIL=0

echo "Scanning for secrets..."

# Patterns to catch
PATTERNS=(
  'sk--[A-Za-z0-9]+'                          # Tensorix API key
  '8784197435:[A-Za-z0-9_-]+'                 # Telegram bot token
  '6103867809'                                 # Telegram chat ID
  'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+'     # JWT tokens (Supabase etc)
  'sb_secret_[A-Za-z0-9_-]+'                  # Supabase service key
  '29627aff-2a5d-4bfa-8daa-65ec650fad8b'      # CRO API key
  'Friedrice18'                                # Passwords
  'sk-or-v1-[A-Za-z0-9]+'                     # OpenRouter key
  'f1c1e077261ed8800c5b539407e8b0b9'          # OpenClaw token
  'fiittz/balnce-filing'                       # Private repo URL
  'ystgzxtxplhxuwsthmbj\.supabase\.co'        # Supabase project URL
  'PIN: 0899'                                  # Admin PIN
)

# Files to scan (tracked files only, skip .env)
FILES=$(git ls-files | grep -v '\.env$' | grep -v 'check-secrets\.sh' | grep -v '\.env\.example')

for pattern in "${PATTERNS[@]}"; do
  matches=$(echo "$FILES" | xargs grep -rlE "$pattern" 2>/dev/null)
  if [ -n "$matches" ]; then
    echo -e "${RED}LEAKED: Pattern '$pattern' found in:${NC}"
    echo "$matches" | while read f; do
      echo "  $f"
    done
    FAIL=1
  fi
done

if [ $FAIL -eq 1 ]; then
  echo ""
  echo -e "${RED}SECRETS DETECTED — DO NOT COMMIT${NC}"
  echo "Move sensitive values to .env and use env vars in code."
  exit 1
else
  echo -e "${GREEN}All clear. No secrets found in tracked files.${NC}"
  exit 0
fi
