#!/bin/bash
# ============================================================================
# deploy_khanza_rs.sh — Deploy khanza_rs scaffold to wsladvan2
# ============================================================================
# Run from your Mac:
#   cd ~/OPREK2/simrs-khanza/PRODUCT-DEV
#   bash scripts/deploy_khanza_rs.sh
# ============================================================================

set -euo pipefail

REMOTE="wsladvan2"
PROJECT_ROOT="/home/budiwiyono/ERPNext-main-live"
BENCH_DIR="$PROJECT_ROOT/frappe-bench"
APP_NAME="khanza_rs"
SITE="erpnext.localhost"
SCAFFOLD_DIR="$(dirname "$0")/../khanza_rs_scaffold"

echo "============================================"
echo "  Deploy SIMRS Khanza RS to wsladvan2"
echo "============================================"

# --- Step 1: Create app on remote if not exists ---
echo ""
echo "[1/5] Creating Frappe App on $REMOTE ..."
ssh "$REMOTE" "
  export PATH=\$HOME/.local/bin:\$PATH
  if [ -d $BENCH_DIR/apps/$APP_NAME ]; then
    echo '  → App already exists, skipping creation.'
  else
    echo '  → Running bench new-app under flox ...'
    flox activate -d $PROJECT_ROOT/ -- bash -c '
      cd $BENCH_DIR
      bench new-app $APP_NAME --no-git <<EOF
SIMRS Khanza
Sistem Informasi Manajemen Rumah Sakit - Modular Monolith
Khanza Digital
admin@khanza.or.id
gpl-3.0
n
EOF
    '
  fi
"

# --- Step 2: Copy scaffold files (hooks.py + api.py) ---
echo ""
echo "[2/5] Copying scaffold files to $REMOTE ..."

# Copy hooks.py
scp "$SCAFFOLD_DIR/$APP_NAME/hooks.py" \
    "$REMOTE:$BENCH_DIR/apps/$APP_NAME/$APP_NAME/hooks.py"
echo "  ✓ hooks.py"

# Copy module api.py and __init__.py files
for module in pasien_core rawat_jalan farmasi keuangan; do
  ssh "$REMOTE" "mkdir -p $BENCH_DIR/apps/$APP_NAME/$APP_NAME/$module"
  scp "$SCAFFOLD_DIR/$APP_NAME/$module/__init__.py" \
      "$REMOTE:$BENCH_DIR/apps/$APP_NAME/$APP_NAME/$module/__init__.py"
  scp "$SCAFFOLD_DIR/$APP_NAME/$module/api.py" \
      "$REMOTE:$BENCH_DIR/apps/$APP_NAME/$APP_NAME/$module/api.py"
  echo "  ✓ $module/api.py"
done

# --- Step 3: Install app to site ---
echo ""
echo "[3/5] Installing app to site $SITE ..."
ssh "$REMOTE" "
  export PATH=\$HOME/.local/bin:\$PATH
  flox activate -d $PROJECT_ROOT/ -- bash -c '
    cd $BENCH_DIR
    bench --site $SITE install-app $APP_NAME
  '
"

# --- Step 4: Create Module Defs ---
echo ""
echo "[4/5] Creating Module Defs ..."
ssh "$REMOTE" "
  export PATH=\$HOME/.local/bin:\$PATH
  flox activate -d $PROJECT_ROOT/ -- bash -c '
    cd $BENCH_DIR
    bench --site $SITE execute khanza_rs.pasien_core.api.bootstrap_modules
  '
"

# --- Step 5: Migrate & Build ---
echo ""
echo "[5/5] Running migrate & build ..."
ssh "$REMOTE" "
  export PATH=\$HOME/.local/bin:\$PATH
  flox activate -d $PROJECT_ROOT/ -- bash -c '
    cd $BENCH_DIR
    bench --site $SITE migrate
    bench build --app $APP_NAME
  '
"

echo ""
echo "============================================"
echo "  ✅ Deployment Complete!"
echo ""
echo "  App:  $APP_NAME"
echo "  Site: $SITE"
echo ""
echo "  Next: Run 'bench restart' on wsladvan2"
echo "        and open Frappe Desk to verify."
echo "============================================"
