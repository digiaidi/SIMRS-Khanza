# khanza_rs/bridging/api.py
import frappe

@frappe.whitelist()
def create_satusehat_views():
    """
    Creates database views to align the new Frappe DocType schemas with the
    legacy database queries executed by the khanza-satusehat-sync daemon.
    """
    # Commit any pending transactional writes first to avoid ImplicitCommitError
    frappe.db.commit()

    # 1. reg_periksa View
    frappe.db.sql("""
        CREATE OR REPLACE VIEW reg_periksa AS
        SELECT 
            no_rawat AS no_rawat,
            no_rawat AS no_rkm_medis,
            tgl_registrasi AS tgl_registrasi,
            jam_reg AS jam_reg,
            'Ralan' AS status_lanjut,
            kd_dokter AS kd_dokter
        FROM `tabRegistrasi Pasien`
    """)
    frappe.db.commit()

    # 2. pasien View
    frappe.db.sql("""
        CREATE OR REPLACE VIEW pasien AS
        SELECT 
            no_rawat AS no_rkm_medis,
            nm_pasien AS nm_pasien,
            '3172000000000001' AS no_ktp
        FROM `tabRegistrasi Pasien`
    """)
    frappe.db.commit()

    # 3. pegawai View
    frappe.db.sql("""
        CREATE OR REPLACE VIEW pegawai AS
        SELECT 
            dokter_pengirim AS nik,
            dokter_pengirim AS nama,
            '3172000000000002' AS no_ktp
        FROM `tabPermintaan Lab`
    """)
    frappe.db.commit()

    # 4. permintaan_lab View
    frappe.db.sql("""
        CREATE OR REPLACE VIEW permintaan_lab AS
        SELECT 
            no_permintaan AS noorder,
            no_rawat AS no_rawat,
            tgl_permintaan AS tgl_hasil,
            jam_permintaan AS jam_hasil,
            dokter_pengirim AS dokter_perujuk,
            klinis_informasi AS diagnosa_klinis
        FROM `tabPermintaan Lab`
    """)
    frappe.db.commit()

    # 5. detail_periksa_lab View
    frappe.db.sql("""
        CREATE OR REPLACE VIEW detail_periksa_lab AS
        SELECT 
            parent AS noorder,
            nilai_hasil AS nilai,
            satuan AS satuan,
            nilai_rujukan AS nilai_rujukan,
            keterangan AS keterangan
        FROM `tabHasil Lab Detail`
    """)
    frappe.db.commit()

    print("✓ Successfully created SatuSehat Database Views")
