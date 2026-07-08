# khanza_rs/rawat_inap/api.py
import frappe

@frappe.whitelist()
def checkin_pasien_ranap(no_rawat, kd_kamar, diagnosa=None):
    """
    Interface Contract to check-in a patient to inpatient care (Rawat Inap).
    Also triggers kamar status update.
    """
    if frappe.db.exists("Rawat Inap Pasien", {"no_rawat": no_rawat, "tgl_keluar": ("is", "not set")}):
        frappe.throw(f"Pasien dengan No. Rawat {no_rawat} sudah aktif dalam perawatan rawat inap.")
        
    doc = frappe.get_doc({
        "doctype": "Rawat Inap Pasien",
        "no_rawat": no_rawat,
        "tgl_masuk": frappe.utils.today(),
        "jam_masuk": frappe.utils.nowtime(),
        "kd_kamar": kd_kamar,
        "diagnosa_awal": diagnosa,
        "tarif_kamar": 150000.0 # Default fallback cost
    })
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    
    # Event wiring: Publish event that patient has checked in
    frappe.publish_realtime("kamar_inap_checkin", {"no_rawat": no_rawat, "kd_kamar": kd_kamar})
    return doc.name

@frappe.whitelist()
def checkout_pasien_ranap(no_rawat, status_pulang):
    """
    Interface Contract to check-out a patient from inpatient care.
    Calculates total days and frees up the bed.
    """
    docs = frappe.get_all("Rawat Inap Pasien", filters={"no_rawat": no_rawat, "tgl_keluar": ("is", "not set")}, limit=1)
    if not docs:
        frappe.throw(f"Tidak ditemukan sesi rawat inap aktif untuk No. Rawat {no_rawat}")
        
    doc = frappe.get_doc("Rawat Inap Pasien", docs[0].name)
    doc.tgl_keluar = frappe.utils.today()
    doc.jam_keluar = frappe.utils.nowtime()
    doc.stts_pulang = status_pulang
    
    # Calculate days
    delta = frappe.utils.date_diff(doc.tgl_keluar, doc.tgl_masuk)
    doc.total_hari = max(delta, 1) # Minimum 1 day
    
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return doc.name

@frappe.whitelist()
def update_diet_pasien(no_rawat, tanggal, waktu_makan, jenis_diet, keterangan=None):
    """
    Interface Contract to order/update patient diet from inpatient doctor to nutrition kitchen.
    """
    doc = frappe.get_doc({
        "doctype": "Diet Gizi Pasien",
        "no_rawat": no_rawat,
        "tanggal": tanggal,
        "waktu_makan": waktu_makan,
        "jenis_diet": jenis_diet,
        "keterangan": keterangan
    })
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    
    # Event wiring: publish event that patient diet is updated
    frappe.publish_realtime("patient_diet_updated", {"no_rawat": no_rawat, "jenis_diet": jenis_diet})
    return doc.name
