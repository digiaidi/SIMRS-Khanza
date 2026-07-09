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

    # 14. Helper Radiologi Views & Tables
    frappe.db.sql("""
        CREATE OR REPLACE VIEW jns_perawatan_radiologi AS
        SELECT 
            'RAD001' AS kd_jenis_prw,
            'Pemeriksaan Radiologi' AS nm_perawatan
    """)
    frappe.db.commit()

    frappe.db.sql("""
        CREATE OR REPLACE VIEW periksa_radiologi AS
        SELECT 
            pr.no_rawat AS no_rawat,
            'RAD001' AS kd_jenis_prw,
            hr.tgl_periksa AS tgl_periksa,
            hr.jam_periksa AS jam,
            hr.dokter_radiolog AS kd_dokter,
            pr.dokter_pengirim AS dokter_perujuk
        FROM `tabHasil Radiologi` hr
        INNER JOIN `tabPermintaan Radiologi` pr ON hr.no_permintaan = pr.no_permintaan
    """)
    frappe.db.commit()

    frappe.db.sql("""
        CREATE OR REPLACE VIEW permintaan_pemeriksaan_radiologi AS
        SELECT 
            no_permintaan AS noorder,
            'RAD001' AS kd_jenis_prw
        FROM `tabPermintaan Radiologi`
    """)
    frappe.db.commit()

    # 15. Create satusehat_review_queue table
    frappe.db.sql("""
        CREATE TABLE IF NOT EXISTS satusehat_review_queue (
            id INT AUTO_INCREMENT PRIMARY KEY,
            no_rawat VARCHAR(50) NOT NULL,
            no_rkm_medis VARCHAR(50),
            resource_type VARCHAR(50) NOT NULL,
            risk_level VARCHAR(20) NOT NULL,
            status VARCHAR(20) NOT NULL,
            nm_pasien VARCHAR(100),
            tgl_registrasi VARCHAR(50),
            nm_dokter VARCHAR(100),
            icd_code VARCHAR(50),
            icd_display VARCHAR(200),
            kfa_code VARCHAR(50),
            drug_name VARCHAR(200),
            quantity DECIMAL(10,2),
            estimated_cost DECIMAL(15,2),
            exam_type VARCHAR(100),
            fhir_payload_json LONGTEXT NOT NULL,
            fhir_endpoint VARCHAR(100) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            reviewed_at TIMESTAMP NULL,
            reviewed_by VARCHAR(100),
            review_note VARCHAR(255),
            satusehat_id VARCHAR(100),
            send_error TEXT
        )
    """)
    frappe.db.commit()

    # 16. Create all SatuSehat mapping/UUID lookup tables if not exists
    mapping_tables = [
        "CREATE TABLE IF NOT EXISTS satu_sehat_encounter (no_rawat VARCHAR(50) PRIMARY KEY, id_encounter VARCHAR(100) NOT NULL)",
        "CREATE TABLE IF NOT EXISTS satu_sehat_episodeofcare (no_rawat VARCHAR(50) PRIMARY KEY, id_encounter VARCHAR(100) NOT NULL)",
        "CREATE TABLE IF NOT EXISTS satu_sehat_servicerequest_radiologi (noorder VARCHAR(50), kd_jenis_prw VARCHAR(50), id_servicerequest VARCHAR(100), PRIMARY KEY(noorder, kd_jenis_prw))",
        "CREATE TABLE IF NOT EXISTS satu_sehat_imagingstudy (no_rawat VARCHAR(50), kd_jenis_prw VARCHAR(50), tgl_periksa DATE, jam TIME, id_imagingstudy VARCHAR(100))",
        "CREATE TABLE IF NOT EXISTS satu_sehat_medication (kode_brng VARCHAR(50) PRIMARY KEY, id_medication VARCHAR(100))",
        "CREATE TABLE IF NOT EXISTS satu_sehat_mapping_obat (kode_brng VARCHAR(50) PRIMARY KEY, obat_code VARCHAR(50), obat_display VARCHAR(200))",
        "CREATE TABLE IF NOT EXISTS satu_sehat_mapping_lokasi_ralan (kd_poli VARCHAR(50) PRIMARY KEY, id_lokasi_satusehat VARCHAR(100))",
        "CREATE TABLE IF NOT EXISTS satu_sehat_condition (no_rawat VARCHAR(50), kd_penyakit VARCHAR(50), id_condition VARCHAR(100), PRIMARY KEY(no_rawat, kd_penyakit))",
        "CREATE TABLE IF NOT EXISTS satu_sehat_procedure (no_rawat VARCHAR(50), kode VARCHAR(50), id_procedure VARCHAR(100), PRIMARY KEY(no_rawat, kode))",
        "CREATE TABLE IF NOT EXISTS satu_sehat_clinicalimpression (no_rawat VARCHAR(50) PRIMARY KEY, id_clinicalimpression VARCHAR(100))",
        "CREATE TABLE IF NOT EXISTS satu_sehat_observation (no_rawat VARCHAR(50) PRIMARY KEY, id_observation VARCHAR(100))",
        "CREATE TABLE IF NOT EXISTS satu_sehat_medicationrequest (no_resep VARCHAR(50) PRIMARY KEY, id_medicationrequest VARCHAR(100))",
        "CREATE TABLE IF NOT EXISTS satu_sehat_medicationdispense (no_resep VARCHAR(50) PRIMARY KEY, id_medicationdispense VARCHAR(100))",
        "CREATE TABLE IF NOT EXISTS satu_sehat_allergyintolerance (no_rkm_medis VARCHAR(50) PRIMARY KEY, id_allergyintolerance VARCHAR(100))",
        "CREATE TABLE IF NOT EXISTS satu_sehat_immunization (no_rawat VARCHAR(50) PRIMARY KEY, id_immunization VARCHAR(100))",
        "CREATE TABLE IF NOT EXISTS satu_sehat_medicationstatement (no_rawat VARCHAR(50) PRIMARY KEY, id_medicationstatement VARCHAR(100))",
        "CREATE TABLE IF NOT EXISTS satu_sehat_careplan (no_rawat VARCHAR(50) PRIMARY KEY, id_careplan VARCHAR(100))",
        "CREATE TABLE IF NOT EXISTS satu_sehat_questionresponse_telaah_farmasi (no_resep VARCHAR(50) PRIMARY KEY, id_questionresponse VARCHAR(100))",
        "CREATE TABLE IF NOT EXISTS satu_sehat_composition (no_rawat VARCHAR(50) PRIMARY KEY, id_composition VARCHAR(100))",
        "CREATE TABLE IF NOT EXISTS satu_sehat_servicerequest_lab (noorder VARCHAR(50), kd_jenis_prw VARCHAR(50), id_servicerequest VARCHAR(100), PRIMARY KEY(noorder, kd_jenis_prw))",
        "CREATE TABLE IF NOT EXISTS satu_sehat_specimen_lab (noorder VARCHAR(50), kd_jenis_prw VARCHAR(50), id_specimen VARCHAR(100), PRIMARY KEY(noorder, kd_jenis_prw))",
        "CREATE TABLE IF NOT EXISTS satu_sehat_observation_lab (noorder VARCHAR(50), kd_jenis_prw VARCHAR(50), id_observation VARCHAR(100), PRIMARY KEY(noorder, kd_jenis_prw))",
        "CREATE TABLE IF NOT EXISTS satu_sehat_diagnosticreport_lab (noorder VARCHAR(50), kd_jenis_prw VARCHAR(50), id_diagnosticreport VARCHAR(100), PRIMARY KEY(noorder, kd_jenis_prw))"
    ]
    for ddl in mapping_tables:
        frappe.db.sql(ddl)
        frappe.db.commit()

    print("✓ Successfully created SatuSehat Database Views")


@frappe.whitelist(allow_guest=True)
def get_satusehat_config():
    """
    Returns the singleton SatuSehat Settings configurations for client consumption.
    """
    try:
        doc = frappe.get_doc("SatuSehat Settings")
        return {
            "enabled": doc.enabled,
            "auth_url": doc.auth_url,
            "fhir_url": doc.fhir_url,
            "client_id": doc.client_id,
            "client_secret": doc.get_password("client_secret"),
            "org_id": doc.org_id
        }
    except Exception:
        # Fallback to sandbox mock if DocType settings record not populated yet
        return {
            "enabled": 1,
            "auth_url": "https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1",
            "fhir_url": "https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1",
            "client_id": "nE9q36mwQeGapnlviMgIljH5tZXd8QdtXyWRZdYLdRdqLNZX",
            "client_secret": "uYGNRDOBONmlfiMjjnUWzbwxRte1A6XaN9kkUgW9B4kYnEZ7tWcHDuAdM0fXEPi1",
            "org_id": "3dc73178-c7d8-46e1-9148-1e5946f7a278"
        }


@frappe.whitelist(allow_guest=True)
def publish_satusehat_event(no_rawat, resource_type):
    """
    Publish real-time sync signal to Redis queue.
    """
    try:
        import redis
        import json
        r = redis.Redis(host='127.0.0.1', port=11000, decode_responses=True)
        payload = {
            "no_rawat": no_rawat,
            "resource_type": resource_type,
            "timestamp": frappe.utils.now()
        }
        r.publish('satusehat_sync_channel', json.dumps(payload))
        return {"success": True, "message": "Event published successfully"}
    except Exception as e:
        frappe.log_error(f"SatuSehat Redis Publish Failed: {str(e)}", "SatuSehat Bridging")
        return {"success": False, "error": str(e)}


def publish_satusehat_event_encounter(doc, method=None):
    if doc.get("no_rawat"):
        publish_satusehat_event(doc.no_rawat, "Encounter")


def publish_satusehat_event_observation(doc, method=None):
    if doc.get("no_rawat"):
        publish_satusehat_event(doc.no_rawat, "Observation")


def publish_satusehat_event_medication(doc, method=None):
    if doc.get("no_rawat"):
        publish_satusehat_event(doc.no_rawat, "MedicationRequest")


