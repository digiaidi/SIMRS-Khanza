# khanza_rs/keuangan/api.py
# ============================================================================
# INTERFACE CONTRACT — Modul Keuangan
# ============================================================================
# Gerbang resmi untuk akses data billing & keuangan oleh modul lain.
# Modul ini MENERIMA event dari modul lain (via hooks.py) untuk:
#   - Membuat billing saat registrasi
#   - Menambah item billing saat tindakan/resep
#   - Menghitung total billing
# ============================================================================

import frappe
from frappe import _


# ============================================================================
# EVENT HANDLERS — Dipicu oleh hooks.py
# ============================================================================

def create_billing_rawat_jalan(doc, method):
    """
    Event Handler: Dipicu saat Registrasi Pasien di-submit.
    Membuat nota billing awal dengan biaya registrasi.
    
    Publisher: pasien_core (Registrasi Pasien.on_submit)
    
    doc = Registrasi Pasien document
    method = "on_submit"
    """
    # Cek apakah billing sudah ada untuk no_rawat ini
    existing = frappe.db.exists("Billing Pasien", {"no_rawat": doc.no_rawat})
    if existing:
        return
    
    billing = frappe.new_doc("Billing Pasien")
    billing.no_rawat = doc.no_rawat
    billing.no_rkm_medis = doc.no_rkm_medis
    billing.nm_pasien = doc.nm_pasien
    billing.tanggal = doc.tgl_registrasi
    billing.cara_bayar = doc.p_jawab
    billing.total_registrasi = doc.biaya_reg or 0
    billing.grand_total = doc.biaya_reg or 0
    billing.status = "Belum Lunas"
    billing.insert(ignore_permissions=True)
    
    frappe.msgprint(_(f"Billing {billing.name} dibuat untuk {doc.nm_pasien}"))


def add_tindakan_to_billing(doc, method):
    """
    Event Handler: Dipicu saat Pemeriksaan Rawat Jalan di-submit.
    Menambahkan biaya tindakan ke billing pasien.
    
    Publisher: rawat_jalan (Pemeriksaan Rawat Jalan.on_submit)
    """
    billing = _get_or_create_billing(doc.no_rawat)
    if not billing:
        return
    
    # Ambil tindakan terkait pemeriksaan ini
    from khanza_rs.rawat_jalan.api import get_tindakan_by_no_rawat
    tindakan_list = get_tindakan_by_no_rawat(doc.no_rawat)
    
    for tindakan in tindakan_list:
        # Cek apakah item ini sudah ada di billing
        exists = any(
            item.keterangan == tindakan["nm_perawatan"] 
            for item in billing.items
        )
        if not exists:
            total = (tindakan.get("biaya_rawat", 0) + 
                     tindakan.get("material", 0) + 
                     tindakan.get("bhp", 0))
            billing.append("items", {
                "jenis": "Tindakan",
                "keterangan": tindakan["nm_perawatan"],
                "jumlah": 1,
                "harga_satuan": total,
                "subtotal": total,
            })
    
    _recalculate_billing(billing)
    billing.save(ignore_permissions=True)


def add_resep_to_billing(doc, method):
    """
    Event Handler: Dipicu saat Resep Obat di-submit.
    Menambahkan biaya obat ke billing pasien.
    
    Publisher: farmasi (Resep Obat.on_submit)
    SatuSehat: MedicationRequest & MedicationDispense hanya di-sync
               setelah status_bayar = 'Sudah Bayar'
    """
    billing = _get_or_create_billing(doc.no_rawat)
    if not billing:
        return
    
    for item in doc.items:
        billing.append("items", {
            "jenis": "Obat",
            "keterangan": f"{item.nama_brng} ({item.aturan_pakai})",
            "jumlah": item.jml,
            "harga_satuan": item.harga,
            "subtotal": item.subtotal,
        })
    
    _recalculate_billing(billing)
    billing.save(ignore_permissions=True)


# ============================================================================
# PUBLIC API — Boleh dipanggil oleh modul lain
# ============================================================================

def get_billing_by_no_rawat(no_rawat: str) -> dict:
    """
    Contract: Mengembalikan detail billing untuk satu kunjungan.
    
    Input:  no_rawat (str)
    Output: dict — {no_nota, nm_pasien, grand_total, status, items: [...]}
    
    Caller: pasien_core (untuk status), bridging (untuk klaim BPJS)
    """
    billing_name = frappe.db.get_value("Billing Pasien", {"no_rawat": no_rawat})
    if not billing_name:
        return {}
    
    billing = frappe.get_doc("Billing Pasien", billing_name)
    return {
        "no_nota": billing.name,
        "no_rawat": billing.no_rawat,
        "nm_pasien": billing.nm_pasien,
        "tanggal": str(billing.tanggal),
        "cara_bayar": billing.cara_bayar,
        "total_registrasi": billing.total_registrasi,
        "total_tindakan": billing.total_tindakan,
        "total_obat": billing.total_obat,
        "grand_total": billing.grand_total,
        "status": billing.status,
        "items": [
            {
                "jenis": item.jenis,
                "keterangan": item.keterangan,
                "jumlah": item.jumlah,
                "harga_satuan": item.harga_satuan,
                "subtotal": item.subtotal,
            }
            for item in billing.items
        ],
    }


def get_tarif_by_kode(kd_jenis_prw: str) -> dict:
    """
    Contract: Mengembalikan tarif tindakan berdasarkan kode.
    
    Input:  kd_jenis_prw (str)
    Output: dict — {kd_jenis_prw, nm_perawatan, total_byrdr, total_byrpr, ...}
    
    Caller: rawat_jalan (untuk denormalisasi nama tindakan)
    """
    tarif = frappe.db.get_value("Tarif Tindakan", kd_jenis_prw,
        ["kd_jenis_prw", "nm_perawatan", "total_byrdr", "total_byrpr", 
         "material", "bhp", "tarif_tindakandr", "tarif_tindakanpr"],
        as_dict=True
    )
    return tarif or {}


# ============================================================================
# INTERNAL HELPERS — Tidak boleh dipanggil dari modul lain
# ============================================================================

def _get_or_create_billing(no_rawat: str):
    """Internal: Ambil billing existing atau buat baru jika belum ada."""
    billing_name = frappe.db.get_value("Billing Pasien", {"no_rawat": no_rawat})
    if billing_name:
        return frappe.get_doc("Billing Pasien", billing_name)
    
    # Jika belum ada billing (edge case: tindakan sebelum registrasi di-submit)
    from khanza_rs.pasien_core.api import get_registrasi_by_no_rawat
    reg = get_registrasi_by_no_rawat(no_rawat)
    if not reg:
        frappe.log_error(f"No registrasi found for {no_rawat}", "Billing Error")
        return None
    
    billing = frappe.new_doc("Billing Pasien")
    billing.no_rawat = no_rawat
    billing.no_rkm_medis = reg.get("no_rkm_medis", "")
    billing.nm_pasien = reg.get("nm_pasien", "")
    billing.tanggal = reg.get("tgl_registrasi", frappe.utils.today())
    billing.cara_bayar = reg.get("p_jawab", "Umum")
    billing.total_registrasi = reg.get("biaya_reg", 0)
    billing.status = "Belum Lunas"
    billing.insert(ignore_permissions=True)
    return billing


def _recalculate_billing(billing):
    """Internal: Hitung ulang total billing dari semua items."""
    billing.total_tindakan = sum(
        item.subtotal for item in billing.items if item.jenis == "Tindakan"
    )
    billing.total_obat = sum(
        item.subtotal for item in billing.items if item.jenis == "Obat"
    )
    billing.total_lab = sum(
        item.subtotal for item in billing.items if item.jenis == "Lab"
    )
    billing.total_radiologi = sum(
        item.subtotal for item in billing.items if item.jenis == "Radiologi"
    )
    billing.grand_total = (
        (billing.total_registrasi or 0) +
        (billing.total_tindakan or 0) +
        (billing.total_obat or 0) +
        (billing.total_lab or 0) +
        (billing.total_radiologi or 0) -
        (billing.diskon or 0)
    )
