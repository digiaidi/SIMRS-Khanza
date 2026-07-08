# khanza_rs/pasien_core/api.py
# ============================================================================
# INTERFACE CONTRACT — Modul Pasien Core
# ============================================================================
# Gerbang resmi untuk akses data pasien oleh modul lain.
# ATURAN: Modul lain DILARANG melakukan frappe.get_doc("Pasien", ...)
#         atau frappe.db.sql("SELECT * FROM tabPasien ...") secara langsung.
#         Semua akses WAJIB melalui fungsi-fungsi di file ini.
# ============================================================================

import frappe
from frappe import _


# ============================================================================
# PUBLIC API — Boleh dipanggil oleh modul lain
# ============================================================================

def get_pasien_info(no_rkm_medis: str) -> dict:
    """
    Contract: Mengembalikan info pasien lengkap.
    
    Input:  no_rkm_medis (str) — Nomor Rekam Medis
    Output: dict {no_rkm_medis, nm_pasien, no_ktp, jk, tgl_lahir, alamat, 
                  no_peserta, gol_darah, umur}
    
    Caller: rawat_jalan, rawat_inap, farmasi, keuangan, bridging
    SatuSehat: Data ini digunakan untuk resolve Patient reference via NIK (no_ktp)
    """
    pasien = frappe.get_doc("Pasien", no_rkm_medis)
    return {
        "no_rkm_medis": pasien.no_rkm_medis,
        "nm_pasien": pasien.nm_pasien,
        "no_ktp": pasien.no_ktp,
        "jk": pasien.jk,
        "tgl_lahir": str(pasien.tgl_lahir) if pasien.tgl_lahir else "",
        "alamat": pasien.alamat or "",
        "no_peserta": pasien.no_peserta or "",
        "gol_darah": pasien.gol_darah or "-",
        "no_tlp": pasien.no_tlp or "",
    }


def get_registrasi_aktif(no_rkm_medis: str) -> list:
    """
    Contract: Mengembalikan daftar registrasi AKTIF (belum selesai) untuk pasien.
    
    Input:  no_rkm_medis (str)
    Output: list[dict] — [{no_rawat, tgl_registrasi, kd_poli, nm_poli, kd_dokter, nm_dokter}]
    
    Caller: rawat_jalan (untuk menampilkan pasien antri), keuangan (untuk billing)
    SatuSehat: no_rawat menjadi key utama untuk Encounter resource
    """
    return frappe.get_all("Registrasi Pasien",
        filters={"no_rkm_medis": no_rkm_medis, "stts": "Belum"},
        fields=["no_rawat", "tgl_registrasi", "kd_poli", "nm_poli", 
                "kd_dokter", "nm_dokter", "p_jawab"],
        order_by="tgl_registrasi desc, jam_reg desc"
    )


def get_registrasi_by_no_rawat(no_rawat: str) -> dict:
    """
    Contract: Mengembalikan detail registrasi berdasarkan no_rawat.
    
    Input:  no_rawat (str) — Nomor Rawat unik per kunjungan
    Output: dict — {no_rawat, no_rkm_medis, nm_pasien, kd_poli, nm_poli, ...}
    
    Caller: rawat_jalan, farmasi, keuangan
    SatuSehat: Encounter resource reference
    """
    reg = frappe.get_doc("Registrasi Pasien", no_rawat)
    return {
        "no_rawat": reg.no_rawat,
        "no_rkm_medis": reg.no_rkm_medis,
        "nm_pasien": reg.nm_pasien,
        "tgl_registrasi": str(reg.tgl_registrasi),
        "jam_reg": str(reg.jam_reg) if reg.jam_reg else "",
        "kd_poli": reg.kd_poli,
        "nm_poli": reg.nm_poli,
        "kd_dokter": reg.kd_dokter,
        "nm_dokter": reg.nm_dokter,
        "p_jawab": reg.p_jawab,
        "stts": reg.stts,
        "status_lanjut": reg.status_lanjut,
        "biaya_reg": reg.biaya_reg,
    }


def cari_pasien(keyword: str, limit: int = 50) -> list:
    """
    Contract: Pencarian pasien berdasarkan nama, no_rkm_medis, atau NIK.
    
    Input:  keyword (str), limit (int, default 50)
    Output: list[dict] — [{no_rkm_medis, nm_pasien, no_ktp, jk, tgl_lahir, alamat}]
    
    Caller: rawat_jalan (autocomplete pasien), keuangan (cari billing)
    """
    return frappe.get_all("Pasien",
        or_filters=[
            ["nm_pasien", "like", f"%{keyword}%"],
            ["no_rkm_medis", "like", f"%{keyword}%"],
            ["no_ktp", "like", f"%{keyword}%"],
        ],
        fields=["no_rkm_medis", "nm_pasien", "no_ktp", "jk", "tgl_lahir", "alamat"],
        limit_page_length=limit,
        order_by="nm_pasien asc"
    )


# ============================================================================
# EVENT HANDLERS — Dipicu oleh hooks.py dari modul lain
# ============================================================================

def update_status_registrasi_lunas(doc, method):
    """
    Event Handler: Dipicu saat Pembayaran Pasien di-submit (dari hooks.py).
    Mengubah status registrasi menjadi 'Sudah' (sudah bayar).
    
    Publisher: keuangan (Pembayaran Pasien.on_submit)
    SatuSehat: Encounter hanya di-sync jika status_bayar = 'Sudah Bayar'
               (lihat SyncEncounter.ts line 27: WHERE reg_periksa.status_bayar = 'Sudah Bayar')
    """
    if not doc.no_rawat:
        return
    
    reg = frappe.get_doc("Registrasi Pasien", doc.no_rawat)
    reg.stts = "Sudah"
    reg.add_comment("Comment", 
        f"Pembayaran lunas via {doc.metode_bayar or 'Kasir'}. "
        f"Total: Rp {doc.jumlah_bayar:,.0f}")
    reg.save(ignore_permissions=True)
    
    frappe.msgprint(_(f"Status registrasi {doc.no_rawat} telah diperbarui menjadi 'Sudah'."))


def bootstrap_modules():
    """Bootstrap all 8 Module Defs for SIMRS Khanza."""
    modules = ["Pasien Core", "Rawat Jalan", "Rawat Inap", "Farmasi", "Penunjang Medis", "Keuangan", "Kepegawaian", "Bridging"]
    for m in modules:
        if not frappe.db.exists("Module Def", m):
            frappe.get_doc({
                "doctype": "Module Def",
                "module_name": m,
                "app_name": "khanza_rs",
                "custom": 1
            }).insert(ignore_permissions=True)
            print(f"Created Module Def: {m}")
    frappe.db.commit()

