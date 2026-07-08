# khanza_rs/penunjang_medis/api.py
import frappe

@frappe.whitelist()
def create_permintaan_lab(no_rawat, dokter, klinis=None):
    """
    Interface Contract to request a new Lab test order.
    """
    doc = frappe.get_doc({
        "doctype": "Permintaan Lab",
        "no_rawat": no_rawat,
        "tgl_permintaan": frappe.utils.today(),
        "jam_permintaan": frappe.utils.nowtime(),
        "dokter_pengirim": dokter,
        "klinis_informasi": klinis,
        "status": "Pending"
    })
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return doc.name

@frappe.whitelist()
def submit_hasil_lab(no_permintaan, petugas, detail_items):
    """
    Interface Contract to record results of a Lab test.
    Updates Permintaan Lab status to 'Selesai'.
    detail_items should be a JSON-serialized list of objects containing:
    { "nama_pemeriksaan": "...", "nilai_hasil": "...", "satuan": "...", "nilai_rujukan": "...", "keterangan": "..." }
    """
    if not frappe.db.exists("Permintaan Lab", no_permintaan):
        frappe.throw(f"Permintaan Lab dengan ID {no_permintaan} tidak ditemukan.")
        
    doc = frappe.get_doc({
        "doctype": "Hasil Lab",
        "no_permintaan": no_permintaan,
        "tgl_periksa": frappe.utils.today(),
        "jam_periksa": frappe.utils.nowtime(),
        "petugas_lab": petugas,
        "status_hasil": "Final"
    })
    
    # Parse items if passed as string
    if isinstance(detail_items, str):
        detail_items = frappe.parse_json(detail_items)
        
    for item in detail_items:
        doc.append("detail_hasil", {
            "nama_pemeriksaan": item.get("nama_pemeriksaan"),
            "nilai_hasil": item.get("nilai_hasil"),
            "satuan": item.get("satuan"),
            "nilai_rujukan": item.get("nilai_rujukan"),
            "keterangan": item.get("keterangan")
        })
        
    doc.insert(ignore_permissions=True)
    
    # Update order status
    frappe.db.set_value("Permintaan Lab", no_permintaan, "status", "Selesai")
    frappe.db.commit()
    return doc.name

@frappe.whitelist()
def create_permintaan_radiologi(no_rawat, dokter, klinis=None):
    """
    Interface Contract to request a new Radiology order.
    """
    doc = frappe.get_doc({
        "doctype": "Permintaan Radiologi",
        "no_rawat": no_rawat,
        "tgl_permintaan": frappe.utils.today(),
        "jam_permintaan": frappe.utils.nowtime(),
        "dokter_pengirim": dokter,
        "klinis_informasi": klinis,
        "status": "Pending"
    })
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return doc.name

@frappe.whitelist()
def submit_hasil_radiologi(no_permintaan, radiolog, hasil_expertise):
    """
    Interface Contract to submit Radiology reading results.
    Updates Permintaan Radiologi status to 'Selesai'.
    """
    if not frappe.db.exists("Permintaan Radiologi", no_permintaan):
        frappe.throw(f"Permintaan Radiologi dengan ID {no_permintaan} tidak ditemukan.")
        
    doc = frappe.get_doc({
        "doctype": "Hasil Radiologi",
        "no_permintaan": no_permintaan,
        "tgl_periksa": frappe.utils.today(),
        "jam_periksa": frappe.utils.nowtime(),
        "dokter_radiolog": radiolog,
        "hasil": hasil_expertise
    })
    doc.insert(ignore_permissions=True)
    
    # Update order status
    frappe.db.set_value("Permintaan Radiologi", no_permintaan, "status", "Selesai")
    frappe.db.commit()
    return doc.name
