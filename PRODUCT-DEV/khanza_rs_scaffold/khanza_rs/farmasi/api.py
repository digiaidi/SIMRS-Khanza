# khanza_rs/farmasi/api.py
# ============================================================================
# INTERFACE CONTRACT — Modul Farmasi
# ============================================================================
# Gerbang resmi untuk akses data farmasi/obat oleh modul lain.
# SatuSehat Critical: Modul ini menyediakan data untuk:
#   - FHIR MedicationRequest (resep obat)
#   - FHIR MedicationDispense (pemberian obat)
#   - FHIR MedicationStatement (status pengobatan)
# ============================================================================

import frappe
from frappe import _


def get_resep_by_no_rawat(no_rawat: str) -> list:
    """
    Contract: Mengembalikan semua resep obat untuk satu kunjungan.
    
    Input:  no_rawat (str)
    Output: list[dict] — [{no_resep, tgl_peresepan, kd_dokter, nm_dokter, status, items: [...]}]
    
    Caller: keuangan (untuk billing obat), bridging (untuk SatuSehat)
    SatuSehat: Maps to FHIR MedicationRequest
               Lihat SyncPharmacy.ts: resep_obat + resep_dokter tables
    """
    resep_list = frappe.get_all("Resep Obat",
        filters={"no_rawat": no_rawat},
        fields=["name", "no_resep", "tgl_peresepan", "jam", 
                "kd_dokter", "nm_dokter", "status"],
        order_by="tgl_peresepan desc, jam desc"
    )
    
    for resep in resep_list:
        resep["items"] = frappe.get_all("Resep Obat Item",
            filters={"parent": resep["name"]},
            fields=["kode_brng", "nama_brng", "jml", "aturan_pakai", "harga", "subtotal"]
        )
    
    return resep_list


def get_stok_obat(kode_brng: str, gudang: str = None) -> float:
    """
    Contract: Mengembalikan sisa stok obat.
    
    Input:  kode_brng (str), gudang (str, optional)
    Output: float — jumlah stok tersedia
    
    Caller: rawat_jalan (cek stok saat peresepan)
    """
    filters = {"kode_brng": kode_brng}
    if gudang:
        filters["gudang"] = gudang
    
    stok = frappe.get_all("Stok Obat",
        filters=filters,
        fields=["sum(stok_akhir) as total_stok"]
    )
    return stok[0].get("total_stok", 0) if stok else 0


def cari_obat(keyword: str, limit: int = 20) -> list:
    """
    Contract: Pencarian obat berdasarkan nama atau kode.
    
    Input:  keyword (str), limit (int)
    Output: list[dict] — [{kode_brng, nama_brng, kode_sat, ralan, stok_minimum}]
    
    Caller: rawat_jalan (autocomplete obat saat resep)
    """
    return frappe.get_all("Obat",
        or_filters=[
            ["nama_brng", "like", f"%{keyword}%"],
            ["kode_brng", "like", f"%{keyword}%"],
        ],
        fields=["kode_brng", "nama_brng", "kode_sat", "ralan", "stok_minimum", "jenis"],
        limit_page_length=limit,
        order_by="nama_brng asc"
    )


def get_total_biaya_resep(no_rawat: str) -> float:
    """
    Contract: Mengembalikan total biaya obat untuk satu kunjungan.
    
    Input:  no_rawat (str)
    Output: float — total biaya obat
    
    Caller: keuangan (untuk billing)
    """
    resep_list = get_resep_by_no_rawat(no_rawat)
    total = 0
    for resep in resep_list:
        for item in resep.get("items", []):
            total += item.get("subtotal", 0)
    return total
