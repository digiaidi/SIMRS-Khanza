app_name = "khanza_rs"
app_title = "SIMRS Khanza"
app_publisher = "Khanza Digital"
app_description = "Sistem Informasi Manajemen Rumah Sakit — Modular Monolith (Frappe Port)"
app_email = "admin@khanza.or.id"
app_license = "GPL-3.0"

# ============================================================================
# MODULE DEFINITIONS
# ============================================================================
# Bounded Contexts (8 Module Def):
#   1. Pasien Core    — Master Pasien, Registrasi, Poliklinik, Bangsal, Kamar
#   2. Rawat Jalan    — Pemeriksaan Dokter, SOAP, Diagnosa, Tindakan
#   3. Rawat Inap     — Kamar Inap, Rawat Inap, Mutasi
#   4. Farmasi        — Inventory Obat, Resep, Apotek
#   5. Penunjang Medis — Lab, Radiologi, IGD
#   6. Keuangan       — Billing, Kasir, Jurnal
#   7. Kepegawaian    — SDM, Jadwal, Absensi
#   8. Bridging       — BPJS, SatuSehat, Mobile JKN
# ============================================================================

# ============================================================================
# EVENT-DRIVEN COMMUNICATION (Loose Coupling via hooks)
# ============================================================================
# RULE: Modul Publisher TIDAK TAHU siapa Subscriber.
#       Subscriber mendaftar di sini (hooks.py) sebagai listener.
# ============================================================================

doc_events = {
    # --- SatuSehat Chain Level 1: Encounter ---
    # Saat registrasi pasien di-submit → buat billing awal
    "Registrasi Pasien": {
        "on_submit": "khanza_rs.keuangan.api.create_billing_rawat_jalan",
    },

    # --- SatuSehat Chain Level 2: Condition + Procedure + Observation ---
    # Saat pemeriksaan rawat jalan selesai → tambahkan biaya tindakan ke billing
    "Pemeriksaan Rawat Jalan": {
        "on_submit": "khanza_rs.keuangan.api.add_tindakan_to_billing",
    },

    # --- SatuSehat Chain Level 3: MedicationRequest + MedicationDispense ---
    # Saat resep obat di-submit → tambahkan biaya obat ke billing
    "Resep Obat": {
        "on_submit": "khanza_rs.keuangan.api.add_resep_to_billing",
    },

    # --- Billing Completion ---
    # Saat pembayaran selesai → update status registrasi
    "Pembayaran Pasien": {
        "on_submit": "khanza_rs.pasien_core.api.update_status_registrasi_lunas",
    },
}

# ============================================================================
# FIXTURES (untuk export/import data konfigurasi antar environment)
# ============================================================================
fixtures = [
    {"dt": "Cara Bayar", "filters": [["module", "=", "Pasien Core"]]},
    {"dt": "Poliklinik", "filters": [["module", "=", "Pasien Core"]]},
    {"dt": "Bangsal", "filters": [["module", "=", "Pasien Core"]]},
]

# ============================================================================
# SCHEDULED JOBS (untuk integrasi SatuSehat - future)
# ============================================================================
# scheduler_events = {
#     "cron": {
#         # Setiap 4 jam: trigger sync SatuSehat via middleware
#         "0 */4 * * *": [
#             "khanza_rs.bridging.api.trigger_satusehat_sync"
#         ]
#     }
# }

# ============================================================================
# AFTER MIGRATE HOOKS
# ============================================================================
after_migrate = [
    "khanza_rs.bridging.api.create_satusehat_views"
]

