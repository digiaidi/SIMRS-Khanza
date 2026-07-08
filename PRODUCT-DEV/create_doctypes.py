# PRODUCT-DEV/create_doctypes.py
# Generator script to programmatically construct all remaining Fase 1 DocTypes
# matching PRD-001 schemas.

import os
import json

base_path = "/Users/user/OPREK2/simrs-khanza/PRODUCT-DEV/khanza_rs_scaffold/khanza_rs"

doctypes_to_create = {
    # ------------------------------------------------------------------------
    # Modul: rawat_jalan
    # ------------------------------------------------------------------------
    "rawat_jalan": [
        {
            "name": "Pemeriksaan Rawat Jalan",
            "autoname": "hash",
            "document_type": "Transaction",
            "icon": "fa fa-stethoscope",
            "fields": [
                {"fieldname": "no_rawat", "fieldtype": "Data", "label": "No. Rawat", "reqd": 1, "in_list_view": 1},
                {"fieldname": "nm_pasien", "fieldtype": "Data", "label": "Nama Pasien"},
                {"fieldname": "tgl_perawatan", "fieldtype": "Date", "label": "Tanggal Perawatan", "reqd": 1, "in_list_view": 1},
                {"fieldname": "jam_rawat", "fieldtype": "Time", "label": "Jam Rawat", "reqd": 1},
                {"fieldname": "kd_dokter", "fieldtype": "Data", "label": "Kode Dokter", "reqd": 1},
                {"fieldname": "nm_dokter", "fieldtype": "Data", "label": "Nama Dokter"},
                {"fieldname": "nip_perawat", "fieldtype": "Data", "label": "NIP Perawat"},
                {"fieldname": "keluhan", "fieldtype": "Text", "label": "Subjective (Keluhan)"},
                {"fieldname": "pemeriksaan", "fieldtype": "Text", "label": "Objective (Pemeriksaan)"},
                {"fieldname": "penilaian", "fieldtype": "Text", "label": "Assessment (Penilaian)"},
                {"fieldname": "rtl", "fieldtype": "Text", "label": "Plan (RTL)"},
                {"fieldname": "suhu_tubuh", "fieldtype": "Float", "label": "Suhu Tubuh (°C)"},
                {"fieldname": "tensi", "fieldtype": "Data", "label": "Tensi (TD)"},
                {"fieldname": "nadi", "fieldtype": "Float", "label": "Nadi (per menit)"},
                {"fieldname": "respirasi", "fieldtype": "Float", "label": "Respirasi (per menit)"},
                {"fieldname": "tinggi", "fieldtype": "Float", "label": "Tinggi Badan (cm)"},
                {"fieldname": "berat", "fieldtype": "Float", "label": "Berat Badan (kg)"},
                {"fieldname": "spo2", "fieldtype": "Float", "label": "SpO2 (%)"},
                {"fieldname": "gcs", "fieldtype": "Data", "label": "GCS"},
                {"fieldname": "kesadaran", "fieldtype": "Select", "label": "Kesadaran", "options": "Compos Mentis\nSomnolen\nSopor\nKoma", "reqd": 1}
            ]
        },
        {
            "name": "Diagnosa Pasien",
            "autoname": "hash",
            "document_type": "Transaction",
            "icon": "fa fa-heartbeat",
            "fields": [
                {"fieldname": "no_rawat", "fieldtype": "Data", "label": "No. Rawat", "reqd": 1, "in_list_view": 1},
                {"fieldname": "kd_penyakit", "fieldtype": "Data", "label": "Kode Penyakit (ICD-10)", "reqd": 1, "in_list_view": 1},
                {"fieldname": "nm_penyakit", "fieldtype": "Data", "label": "Nama Penyakit"},
                {"fieldname": "status", "fieldtype": "Select", "label": "Status", "options": "Ralan\nRanap", "reqd": 1},
                {"fieldname": "prioritas", "fieldtype": "Int", "label": "Prioritas (1=Primer)", "reqd": 1}
            ]
        },
        {
            "name": "Tindakan Rawat Jalan",
            "autoname": "hash",
            "document_type": "Transaction",
            "icon": "fa fa-scissors",
            "fields": [
                {"fieldname": "no_rawat", "fieldtype": "Data", "label": "No. Rawat", "reqd": 1, "in_list_view": 1},
                {"fieldname": "kd_jenis_prw", "fieldtype": "Data", "label": "Kode Tindakan", "reqd": 1, "in_list_view": 1},
                {"fieldname": "nm_perawatan", "fieldtype": "Data", "label": "Nama Tindakan"},
                {"fieldname": "tgl_perawatan", "fieldtype": "Date", "label": "Tanggal Tindakan", "reqd": 1},
                {"fieldname": "jam_rawat", "fieldtype": "Time", "label": "Jam Tindakan", "reqd": 1},
                {"fieldname": "kd_dokter", "fieldtype": "Data", "label": "Kode Dokter", "reqd": 1},
                {"fieldname": "biaya_rawat", "fieldtype": "Currency", "label": "Biaya Tindakan", "reqd": 1},
                {"fieldname": "material", "fieldtype": "Currency", "label": "Biaya Material"},
                {"fieldname": "bhp", "fieldtype": "Currency", "label": "Biaya BHP"}
            ]
        }
    ],
    # ------------------------------------------------------------------------
    # Modul: farmasi
    # ------------------------------------------------------------------------
    "farmasi": [
        {
            "name": "Obat",
            "autoname": "field:kode_brng",
            "document_type": "Master",
            "icon": "fa fa-flask",
            "fields": [
                {"fieldname": "kode_brng", "fieldtype": "Data", "label": "Kode Barang", "reqd": 1, "unique": 1, "in_list_view": 1},
                {"fieldname": "nama_brng", "fieldtype": "Data", "label": "Nama Obat / BHP", "reqd": 1, "in_list_view": 1},
                {"fieldname": "kode_sat", "fieldtype": "Data", "label": "Satuan", "reqd": 1},
                {"fieldname": "letak_barang", "fieldtype": "Data", "label": "Letak/Rak"},
                {"fieldname": "dapiyang", "fieldtype": "Currency", "label": "Harga Dasar"},
                {"fieldname": "ralan", "fieldtype": "Currency", "label": "Harga Ralan"},
                {"fieldname": "kelas1", "fieldtype": "Currency", "label": "Harga Kelas 1"},
                {"fieldname": "kelas2", "fieldtype": "Currency", "label": "Harga Kelas 2"},
                {"fieldname": "kelas3", "fieldtype": "Currency", "label": "Harga Kelas 3"},
                {"fieldname": "utama", "fieldtype": "Currency", "label": "Harga Utama"},
                {"fieldname": "vip", "fieldtype": "Currency", "label": "Harga VIP"},
                {"fieldname": "stok_minimum", "fieldtype": "Float", "label": "Stok Minimum"},
                {"fieldname": "jenis", "fieldtype": "Data", "label": "Jenis Barang", "options": "Obat\nBHP\nAlkes"},
                {"fieldname": "status", "fieldtype": "Select", "label": "Status", "options": "1\n0", "default": "1"}
            ]
        },
        {
            "name": "Resep Obat Item",
            "autoname": "hash",
            "document_type": "Data",
            "istable": 1, # Child Table!
            "icon": "fa fa-list",
            "fields": [
                {"fieldname": "kode_brng", "fieldtype": "Link", "label": "Obat", "options": "Obat", "reqd": 1, "in_list_view": 1},
                {"fetch_from": "kode_brng.nama_brng", "fieldname": "nama_brng", "fieldtype": "Data", "label": "Nama Obat", "read_only": 1},
                {"fieldname": "jml", "fieldtype": "Float", "label": "Jumlah", "reqd": 1, "in_list_view": 1},
                {"fieldname": "aturan_pakai", "fieldtype": "Data", "label": "Aturan Pakai", "in_list_view": 1},
                {"fetch_from": "kode_brng.ralan", "fieldname": "harga", "fieldtype": "Currency", "label": "Harga Satuan", "read_only": 1},
                {"fieldname": "subtotal", "fieldtype": "Currency", "label": "Subtotal"}
            ]
        },
        {
            "name": "Resep Obat",
            "autoname": "field:no_resep",
            "document_type": "Transaction",
            "icon": "fa fa-file-text",
            "fields": [
                {"fieldname": "no_resep", "fieldtype": "Data", "label": "No. Resep", "reqd": 1, "unique": 1, "in_list_view": 1},
                {"fieldname": "no_rawat", "fieldtype": "Data", "label": "No. Rawat", "reqd": 1, "in_list_view": 1},
                {"fieldname": "nm_pasien", "fieldtype": "Data", "label": "Nama Pasien"},
                {"fieldname": "kd_dokter", "fieldtype": "Data", "label": "Kode Dokter"},
                {"fieldname": "nm_dokter", "fieldtype": "Data", "label": "Nama Dokter"},
                {"fieldname": "tgl_peresepan", "fieldtype": "Date", "label": "Tanggal Resep", "reqd": 1},
                {"fieldname": "jam", "fieldtype": "Time", "label": "Jam Resep", "reqd": 1},
                {"fieldname": "status", "fieldtype": "Select", "label": "Status", "options": "Belum Terlayani\nTerlayani\nBatal", "default": "Belum Terlayani", "in_list_view": 1},
                {"fieldname": "items", "fieldtype": "Table", "label": "Daftar Obat", "options": "Resep Obat Item"}
            ]
        }
    ],
    # ------------------------------------------------------------------------
    # Modul: keuangan
    # ------------------------------------------------------------------------
    "keuangan": [
        {
            "name": "Billing Item",
            "autoname": "hash",
            "document_type": "Data",
            "istable": 1, # Child Table!
            "icon": "fa fa-list",
            "fields": [
                {"fieldname": "nama", "fieldtype": "Data", "label": "Nama Item", "reqd": 1, "in_list_view": 1},
                {"fieldname": "jenis", "fieldtype": "Select", "label": "Jenis", "options": "Registrasi\nTindakan\nObat\nLab\nRadiologi", "reqd": 1, "in_list_view": 1},
                {"fieldname": "biaya", "fieldtype": "Currency", "label": "Biaya Satuan", "reqd": 1, "in_list_view": 1},
                {"fieldname": "jumlah", "fieldtype": "Float", "label": "Jumlah", "reqd": 1, "in_list_view": 1},
                {"fieldname": "subtotal", "fieldtype": "Currency", "label": "Subtotal"}
            ]
        },
        {
            "name": "Billing Pasien",
            "autoname": "field:no_nota",
            "document_type": "Transaction",
            "icon": "fa fa-money",
            "fields": [
                {"fieldname": "no_nota", "fieldtype": "Data", "label": "No. Nota", "reqd": 1, "unique": 1, "in_list_view": 1},
                {"fieldname": "no_rawat", "fieldtype": "Data", "label": "No. Rawat", "reqd": 1, "in_list_view": 1},
                {"fieldname": "nm_pasien", "fieldtype": "Data", "label": "Nama Pasien"},
                {"fieldname": "tanggal", "fieldtype": "Date", "label": "Tanggal Nota", "reqd": 1},
                {"fieldname": "cara_bayar", "fieldtype": "Data", "label": "Cara Bayar"},
                {"fieldname": "total_registrasi", "fieldtype": "Currency", "label": "Total Registrasi"},
                {"fieldname": "total_tindakan", "fieldtype": "Currency", "label": "Total Tindakan"},
                {"fieldname": "total_obat", "fieldtype": "Currency", "label": "Total Obat"},
                {"fieldname": "total_lab", "fieldtype": "Currency", "label": "Total Lab"},
                {"fieldname": "total_radiologi", "fieldtype": "Currency", "label": "Total Radiologi"},
                {"fieldname": "grand_total", "fieldtype": "Currency", "label": "Grand Total"},
                {"fieldname": "diskon", "fieldtype": "Currency", "label": "Diskon"},
                {"fieldname": "dibayar", "fieldtype": "Currency", "label": "Dibayar"},
                {"fieldname": "sisa", "fieldtype": "Currency", "label": "Sisa Tagihan"},
                {"fieldname": "status", "fieldtype": "Select", "label": "Status", "options": "Belum Lunas\nLunas\nPiutang", "default": "Belum Lunas", "in_list_view": 1},
                {"fieldname": "items", "fieldtype": "Table", "label": "Rincian Biaya", "options": "Billing Item"}
            ]
        }
    ]
}

def create_doctype(module, dt):
    # Prepare folder
    dt_folder_name = dt["name"].lower().replace(" ", "_")
    dt_dir = os.path.join(base_path, module, "doctype", dt_folder_name)
    os.makedirs(dt_dir, exist_ok=True)
    
    # JSON definition
    schema = {
        "actions": [],
        "allow_import": 1,
        "allow_rename": 1,
        "creation": "2026-07-08 12:00:00",
        "doctype": "DocType",
        "document_type": dt["document_type"],
        "engine": "InnoDB",
        "field_order": [f["fieldname"] for f in dt["fields"]],
        "fields": dt["fields"],
        "icon": dt["icon"],
        "idx": 1,
        "links": [],
        "modified": "2026-07-08 12:00:00",
        "modified_by": "Administrator",
        "module": module.replace("_", " ").title(),
        "name": dt["name"],
        "naming_rule": "By fieldname" if "field:" in dt["autoname"] else "Expression",
        "owner": "Administrator",
        "permissions": [
            {
                "create": 1,
                "delete": 1,
                "email": 1,
                "export": 1,
                "import": 1,
                "print": 1,
                "read": 1,
                "report": 1,
                "role": "System Manager",
                "share": 1,
                "write": 1
            }
        ],
        "quick_entry": 1,
        "sort_field": "creation",
        "sort_order": "DESC",
        "states": []
    }
    
    if dt.get("istable"):
        schema["istable"] = 1
        
    if "field:" in dt["autoname"]:
        schema["autoname"] = dt["autoname"]
    else:
        schema["autoname"] = "Format: " + dt["name"] + "-.#####"
        
    # Write files
    json_path = os.path.join(dt_dir, f"{dt_folder_name}.json")
    with open(json_path, "w") as f:
        json.dump(schema, f, indent=1)
        
    py_path = os.path.join(dt_dir, f"{dt_folder_name}.py")
    py_class_name = dt["name"].replace(" ", "")
    with open(py_path, "w") as f:
        f.write(f"import frappe\nfrom frappe.model.document import Document\n\nclass {py_class_name}(Document):\n    pass\n")
        
    init_path = os.path.join(dt_dir, "__init__.py")
    with open(init_path, "w") as f:
        f.write("")
        
    print(f"Created DocType: {dt['name']} inside {module}")

for module, dts in doctypes_to_create.items():
    for dt in dts:
        create_doctype(module, dt)
