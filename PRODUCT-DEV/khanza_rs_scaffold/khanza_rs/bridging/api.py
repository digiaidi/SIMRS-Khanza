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

    # 6. poliklinik View
    frappe.db.sql("""
        CREATE OR REPLACE VIEW poliklinik AS
        SELECT 
            kd_poli AS kd_poli,
            nm_poli AS nm_poli,
            'POLI_MOCK' AS id_ruangan_satusehat
        FROM `tabPoliklinik`
    """)
    frappe.db.commit()

    # 7. diagnosa_pasien View
    frappe.db.sql("""
        CREATE OR REPLACE VIEW diagnosa_pasien AS
        SELECT 
            no_rawat AS no_rawat,
            kd_penyakit AS kd_penyakit,
            'Utama' AS status
        FROM `tabDiagnosa Pasien`
    """)
    frappe.db.commit()

    # 8. penyakit View
    frappe.db.sql("""
        CREATE OR REPLACE VIEW penyakit AS
        SELECT 
            kd_penyakit AS kd_penyakit,
            nm_penyakit AS nm_penyakit,
            'ICD-10' AS system
        FROM `tabDiagnosa Pasien`
    """)
    frappe.db.commit()

    # 9. pemeriksaan_ralan View
    frappe.db.sql("""
        CREATE OR REPLACE VIEW pemeriksaan_ralan AS
        SELECT 
            no_rawat AS no_rawat,
            tgl_perawatan AS tgl_pemeriksaan,
            jam_rawat AS jam_pemeriksaan,
            suhu_tubuh AS suhu_tubuh,
            tensi AS tensi,
            nadi AS nadi,
            respirasi AS respirasi,
            berat AS berat,
            tinggi AS tinggi
        FROM `tabPemeriksaan Rawat Jalan`
    """)
    frappe.db.commit()

    # 10. resep_obat View
    frappe.db.sql("""
        CREATE OR REPLACE VIEW resep_obat AS
        SELECT 
            no_resep AS no_resep,
            no_rawat AS no_rawat,
            tgl_peresepan AS tgl_peresepan,
            jam AS jam_peresepan,
            tgl_peresepan AS tgl_delivery,
            jam AS jam_delivery
        FROM `tabResep Obat`
    """)
    frappe.db.commit()

    # 11. permintaan_radiologi View
    frappe.db.sql("""
        CREATE OR REPLACE VIEW permintaan_radiologi AS
        SELECT 
            no_permintaan AS noorder,
            no_rawat AS no_rawat,
            tgl_permintaan AS tgl_hasil,
            jam_permintaan AS jam_hasil,
            dokter_pengirim AS dokter_perujuk,
            klinis_informasi AS diagnosa_klinis
        FROM `tabPermintaan Radiologi`
    """)
    frappe.db.commit()

    # 12. hasil_radiologi View
    frappe.db.sql("""
        CREATE OR REPLACE VIEW hasil_radiologi AS
        SELECT 
            no_permintaan AS noorder,
            hasil AS hasil
        FROM `tabHasil Radiologi`
    """)
    frappe.db.commit()

    # 13. skrining_kanker_kolorektal View
    frappe.db.sql("""
        CREATE OR REPLACE VIEW skrining_kanker_kolorektal AS
        SELECT 
            no_rawat AS no_rawat,
            tgl_asesmen AS tanggal,
            pemeriksa AS NIP,
            'Dr. Budi Wiyono' AS Petugas,
            COALESCE(JSON_UNQUOTE(JSON_EXTRACT(data_dinamis, '$.polip_adenomatosa')), 'Tidak Ada') AS polip_adenomatosa,
            COALESCE(JSON_UNQUOTE(JSON_EXTRACT(data_dinamis, '$.bab_berdarah')), 'Tidak') AS bab_berdarah,
            COALESCE(JSON_UNQUOTE(JSON_EXTRACT(data_dinamis, '$.reseksi_kuratif')), 'Tidak') AS reseksi_kuratif
        FROM `tabAsesmen RME Spesifik`
        WHERE tipe_asesmen = 'Skrining Kanker Kolorektal'
    """)
    frappe.db.commit()

    print("✓ Successfully created SatuSehat Database Views")
