# khanza_rs/rawat_jalan/api.py
# ============================================================================
# INTERFACE CONTRACT — Modul Rawat Jalan
# ============================================================================
# Gerbang resmi untuk akses data pemeriksaan rawat jalan.
# SatuSehat Critical: Modul ini menyediakan data untuk:
#   - FHIR Condition (diagnosa ICD-10)
#   - FHIR Procedure (tindakan medis)
#   - FHIR Observation TTV (suhu, tensi, nadi, respirasi)
#   - FHIR ClinicalImpression (penilaian klinis)
# ============================================================================

import frappe
from frappe import _


def get_pemeriksaan_by_no_rawat(no_rawat: str) -> list:
    """
    Contract: Mengembalikan semua pemeriksaan untuk satu kunjungan.
    
    Input:  no_rawat (str)
    Output: list[dict] — [{tgl_perawatan, jam_rawat, keluhan, pemeriksaan, 
                           penilaian, rtl, suhu_tubuh, tensi, nadi, respirasi, ...}]
    
    Caller: keuangan (untuk billing tindakan), bridging (untuk SatuSehat)
    SatuSehat: Maps to Observation TTV (suhu, tensi, nadi, respirasi, spo2)
    """
    return frappe.get_all("Pemeriksaan Rawat Jalan",
        filters={"no_rawat": no_rawat},
        fields=["name", "tgl_perawatan", "jam_rawat", "kd_dokter", "nm_dokter",
                "keluhan", "pemeriksaan", "penilaian", "rtl",
                "suhu_tubuh", "tensi", "nadi", "respirasi", 
                "tinggi", "berat", "spo2", "gcs", "kesadaran"],
        order_by="tgl_perawatan desc, jam_rawat desc"
    )


def get_diagnosa_by_no_rawat(no_rawat: str) -> list:
    """
    Contract: Mengembalikan semua diagnosa untuk satu kunjungan.
    
    Input:  no_rawat (str)
    Output: list[dict] — [{kd_penyakit, nm_penyakit, status, prioritas}]
    
    Caller: keuangan (untuk INACBG grouping), bridging (untuk SatuSehat)
    SatuSehat: Maps to FHIR Condition (ICD-10 coding)
               Lihat SyncClinical.ts: diagnosa_pasien + penyakit tables
    """
    return frappe.get_all("Diagnosa Pasien",
        filters={"no_rawat": no_rawat},
        fields=["kd_penyakit", "nm_penyakit", "status", "prioritas"],
        order_by="prioritas asc"
    )


def get_tindakan_by_no_rawat(no_rawat: str) -> list:
    """
    Contract: Mengembalikan semua tindakan medis untuk satu kunjungan.
    
    Input:  no_rawat (str)
    Output: list[dict] — [{kd_jenis_prw, nm_perawatan, biaya_rawat, ...}]
    
    Caller: keuangan (untuk billing), bridging (untuk SatuSehat)
    SatuSehat: Maps to FHIR Procedure
               Lihat SyncClinical.ts: rawat_jl_dr + jns_perawatan tables
    """
    return frappe.get_all("Tindakan Rawat Jalan",
        filters={"no_rawat": no_rawat},
        fields=["kd_jenis_prw", "nm_perawatan", "tgl_perawatan", "jam_rawat",
                "kd_dokter", "biaya_rawat", "material", "bhp"],
        order_by="tgl_perawatan desc, jam_rawat desc"
    )


def get_tarif_tindakan(kd_jenis_prw: str) -> dict:
    """
    Contract: Mengembalikan tarif tindakan berdasarkan kode.
    
    Input:  kd_jenis_prw (str) — Kode jenis perawatan
    Output: dict — {kd_jenis_prw, nm_perawatan, total_byrdr, total_byrpr, ...}
    
    Caller: keuangan (untuk billing otomatis)
    """
    # Note: Tarif tindakan ada di modul keuangan, tapi rawat_jalan perlu tahu 
    # nama tindakan untuk denormalisasi. Ini contoh cross-module yang tetap clean.
    from khanza_rs.keuangan.api import get_tarif_by_kode
    return get_tarif_by_kode(kd_jenis_prw)
