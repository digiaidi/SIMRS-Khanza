#!/bin/bash
# ============================================================================
# SIMRS Khanza → Frappe Modular Monolith
# Setup Script for wsladvan2
# ============================================================================
# USAGE: 
#   ssh wsladvan2
#   cd ~/ERPNext-main-live/frappe-bench
#   bash /path/to/setup_khanza_rs.sh
# ============================================================================

set -euo pipefail

# --- Config ---
BENCH_DIR="/home/budiwiyono/ERPNext-main-live/frappe-bench"
VENV_BIN="/home/budiwiyono/ERPNext-main-live/venv/bin"
SITE="erpnext.localhost"
APP_NAME="khanza_rs"

export PATH="$VENV_BIN:$PATH"
cd "$BENCH_DIR"

echo "============================================"
echo "  SIMRS Khanza RS — Frappe App Setup"
echo "============================================"

# --- Step 1: Create App ---
if [ -d "apps/$APP_NAME" ]; then
  echo "[SKIP] App '$APP_NAME' already exists."
else
  echo "[1/6] Creating Frappe App: $APP_NAME ..."
  bench new-app "$APP_NAME" \
    --no-git \
    2>&1 || {
      echo "[INFO] bench new-app might require interactive input."
      echo "[INFO] If prompted, use these values:"
      echo "  App Title: SIMRS Khanza"
      echo "  App Description: Sistem Informasi Manajemen Rumah Sakit - Modular Monolith"  
      echo "  App Publisher: Khanza Digital"
      echo "  App Email: admin@khanza.or.id"
      echo "  App License: GPL-3.0"
    }
fi

# --- Step 2: Install App to Site ---
echo "[2/6] Installing $APP_NAME to site $SITE ..."
bench --site "$SITE" install-app "$APP_NAME" 2>/dev/null || echo "[SKIP] App may already be installed."

# --- Step 3: Create Module Defs ---
echo "[3/6] Creating 8 Module Defs ..."

MODULES=(
  "Pasien Core"
  "Rawat Jalan"
  "Rawat Inap"
  "Farmasi"
  "Penunjang Medis"
  "Keuangan"
  "Kepegawaian"
  "Bridging"
)

for module in "${MODULES[@]}"; do
  bench --site "$SITE" execute \
    "frappe.get_doc({'doctype':'Module Def','module_name':'$module','app_name':'$APP_NAME','custom':1}).insert(ignore_if_duplicate=True)" \
    2>/dev/null && echo "  ✓ Module Def: $module" || echo "  → Module Def '$module' already exists or error"
done

# --- Step 4: Verify ---
echo "[4/6] Verifying installation ..."
echo ""
echo "=== Installed Apps ==="
bench --site "$SITE" list-apps
echo ""
echo "=== Module Defs ==="
bench --site "$SITE" execute \
  "print([m.module_name for m in frappe.get_all('Module Def', filters={'app_name':'$APP_NAME'}, fields=['module_name'])])" \
  2>/dev/null || echo "(Could not list modules)"

echo ""
echo "============================================"
echo "  Setup Complete!"
echo "  Next steps:"
echo "    1. bench --site $SITE migrate"
echo "    2. bench build --app $APP_NAME"
echo "    3. bench restart"
echo "    4. Open http://erpnext.localhost to verify"
echo "============================================"
