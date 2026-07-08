# ATR-009: Porting SIMRS Khanza ke Frappe.io — Arsitektur Modular Monolith

* **Status**: PROPOSED
* **Tanggal**: 2026-07-08
* **Pengarang**: AI Coding Assistant (Antigravity) & User
* **Referensi**: [REVIEW-Porting-SIMRS-Khanza-to-Frappe-Modular-Monolith.md](../PRODUCT-DEV/REVIEW-Porting-SIMRS-Khanza-to-Frappe-Modular-Monolith.md)

---

## 1. Konteks & Latar Belakang (Context & Background)

SIMRS Khanza adalah sistem informasi manajemen rumah sakit *open-source* berbasis **Java Swing Desktop (2-Tier)** yang digunakan oleh ribuan fasilitas kesehatan di Indonesia. Aplikasi ini menangani seluruh aspek operasional RS mulai dari pendaftaran pasien, rawat jalan/inap, farmasi, laboratorium, radiologi, billing, kepegawaian, hingga integrasi pemerintah (BPJS V-Claim, SatuSehat FHIR, Mobile JKN).

Dengan **1.629 file Java**, **1.161 tabel database**, dan *God Class* seperti `frmUtama.java` (2.4 MB), arsitektur eksisting telah mencapai batas pemeliharaan (*maintenance ceiling*). Setiap klien desktop terhubung langsung ke MySQL (`sik.sql`) tanpa middleware, menyebabkan masalah skalabilitas, keamanan, dan ketidakmampuan akses via web/mobile.

Proyek ini mengadopsi pola dan *pattern* yang telah divalidasi di `~/OPREK3/alchemy-effect/ERPNext_modular_monolith` (proyek `exam_hub`) untuk membangun versi Frappe.io dari SIMRS Khanza dengan arsitektur **Modular Monolith** yang ketat.

---

## 2. Keputusan Arsitektur (Architectural Decisions)

### Keputusan 1: Satu Frappe App dengan 8 Module Def (Bounded Context)

Seluruh domain bisnis rumah sakit di-*port* ke dalam **satu Frappe App** bernama `khanza_rs` yang terbagi menjadi **8 Module Def** terisolasi:

1. **`pasien_core`** — Master Pasien, Pendaftaran, Registrasi, Poliklinik, Bangsal, Kamar
2. **`rawat_jalan`** — Pemeriksaan Dokter, SOAP, DPJP, Tindakan Rawat Jalan
3. **`rawat_inap`** — Kamar Inap, Rawat Inap, Diet, Tranfusi Darah
4. **`farmasi`** — Inventory Obat/BHP, Resep, Apotek, Pembelian, Penjualan, Stok Opname
5. **`penunjang_medis`** — Laboratorium (PK, PA, MB), Radiologi, IGD, Operasi
6. **`keuangan`** — Billing, Kasir, Jurnal, Piutang, Hutang, Jasa Medis, Laba Rugi
7. **`kepegawaian`** — Dokter, Perawat/Petugas, Jadwal, Absensi, Penggajian, K3RS, SKP
8. **`bridging`** — BPJS V-Claim/PCare, SatuSehat, Mobile JKN, INACBG, Sisrute

* **Alasan:** 31 folder `src/` di Khanza terlalu granular jika dipertahankan 1:1 sebagai Module Def. Konsolidasi ke 8 modul memberikan batas domain yang cukup ketat untuk mencegah *spaghetti*, namun cukup lebar agar tidak *over-modularize* di tahap awal.
* **Konsekuensi:** Jika di masa depan suatu modul membesar (misal `farmasi` menjadi sangat kompleks), Module Def bisa di-split tanpa mengubah modul lain, karena komunikasi sudah melalui `api.py`.

---

### Keputusan 2: Interface Contract (`api.py`) untuk Komunikasi Lintas Modul

Setiap Module Def wajib memiliki file **`api.py`** sebagai gerbang resmi. Modul luar **dilarang keras** melakukan `frappe.get_doc()`, `frappe.db.get_value()`, atau SQL query langsung ke DocType internal modul lain.

* **Penerapan:**
  - `rawat_jalan` mengambil data pasien via `pasien_core.api.get_pasien_info(no_rkm_medis)`
  - `keuangan` mengambil tarif tindakan via `rawat_jalan.api.get_tarif_tindakan(kd_jenis_prw)`
  - `bridging` mengambil data SEP via `pasien_core.api.get_data_pasien_bpjs(no_peserta)`

* **Anti-Pattern yang Dicegah:**
  ```python
  # ❌ DILARANG (Tight Coupling ala Khanza Java)
  frappe.db.sql("SELECT * FROM `tabPasien` JOIN `tabRegistrasi Pasien` ...")  

  # ✅ BENAR (Interface Contract)
  from khanza_rs.pasien_core.api import get_pasien_info
  pasien = get_pasien_info(no_rkm_medis)
  ```

---

### Keputusan 3: Denormalisasi Terkontrol untuk Data Lintas Domain

Data yang sering dibutuhkan lintas modul (seperti nama pasien, nama dokter, nama poli) **disalin/di-denormalisasi** ke DocType pemanggil menggunakan mekanisme `fetch_from` Frappe, bukan dijoin dari tabel master saat runtime.

* **Penerapan:**
  - DocType `Pemeriksaan Rawat Jalan` menyimpan `no_rkm_medis` (Data), `nama_pasien` (Data, fetch_from), `nama_poli` (Data, fetch_from).
  - Saat dokumen disimpan, Frappe secara otomatis menyalin nama dari master. Modul `rawat_jalan` **tidak perlu JOIN** ke tabel `tabPasien` milik `pasien_core` saat menampilkan daftar pemeriksaan.

* **Keuntungan:**
  - Mengeliminasi *read contention* pada tabel master saat jam sibuk RS (ratusan periksa konkuren)
  - Data historis tetap akurat meskipun master berubah di kemudian hari (misal pasien ganti nama)

---

### Keputusan 4: Event-Driven Communication via `hooks.py`

Proses bisnis yang bersifat *downstream* (tindakan → billing, pemberian obat → jurnal, rawat inap → diet harian) menggunakan mekanisme **event hook** di `hooks.py`, bukan *hard import* langsung.

* **Penerapan:**
  ```python
  # khanza_rs/hooks.py
  doc_events = {
      "Pemeriksaan Rawat Jalan": {
          "on_submit": "khanza_rs.keuangan.api.create_billing_rawat_jalan",
      },
      "Pemberian Obat": {
          "on_submit": "khanza_rs.keuangan.api.create_jurnal_pemberian_obat",
      },
      "Registrasi Pasien": {
          "on_submit": "khanza_rs.bridging.api.auto_cek_eligibilitas_bpjs",
      }
  }
  ```

* **Keuntungan:**
  - Modul `rawat_jalan` tidak tahu dan tidak peduli tentang modul `keuangan`
  - Jika modul `bridging` belum siap, cukup komentari baris di `hooks.py` tanpa mengubah kode domain klinis
  - Memungkinkan penambahan *subscriber* baru tanpa mengubah *publisher*

---

### Keputusan 5: Update `khanza-satusehat-sync` Aligned ke Backend Frappe Modular Monolith

Layanan middleware `khanza-satusehat-sync` (Effect TS) dan Hyperswitch/CarePay (Payment Gateway) **tetap dipertahankan sebagai Effect TS** — tidak di-rewrite ke Python. Namun, `khanza-satusehat-sync` akan **di-update agar aligned dengan backend Frappe `khanza_rs` yang baru**, bukan lagi membaca langsung dari tabel `sik.sql` legacy.

* **Alasan:**
  - `khanza-satusehat-sync` sudah menangani konkurensi tinggi (Effect TS Fibers), retry otomatis, dan mapping FHIR R4 yang sangat kompleks — kelebihan ini dipertahankan
  - Yang perlu berubah adalah **data source**: dari raw SQL query ke tabel `sik.sql` menjadi query ke **Frappe DocType tables** (`tabPasien`, `tabRegistrasi Pasien`, `tabPemeriksaan Rawat Jalan`, dll.) atau **Frappe REST API**
  - Hyperswitch tetap comply SNAP BI, tidak perlu perubahan

* **Strategi Update `khanza-satusehat-sync`:**

  | Sync Job | Query Lama (`sik.sql`) | Query Baru (Frappe `khanza_rs`) |
  |----------|----------------------|-------------------------------|
  | `SyncEncounter` | `reg_periksa JOIN pasien JOIN pegawai JOIN poliklinik` | `tabRegistrasi Pasien` (denormalisasi: nm_pasien, nm_poli, nm_dokter sudah embedded) |
  | `SyncObservationTTV` | `pemeriksaan_ralan JOIN reg_periksa JOIN pasien` | `tabPemeriksaan Rawat Jalan` (suhu, tensi, nadi, respirasi langsung tersedia) |
  | `SyncClinical (Condition)` | `diagnosa_pasien JOIN penyakit JOIN reg_periksa` | `tabDiagnosa Pasien` (kd_penyakit, nm_penyakit denormalisasi) |
  | `SyncClinical (Procedure)` | `rawat_jl_dr JOIN jns_perawatan` | `tabTindakan Rawat Jalan` (nm_perawatan denormalisasi) |
  | `SyncPharmacy` | `resep_obat JOIN resep_dokter JOIN satu_sehat_mapping_obat` | `tabResep Obat` + `tabResep Obat Item` |
  | `SyncDiagnostic` | `permintaan_lab JOIN periksa_lab` | `tabPermintaan Lab` + `tabHasil Lab` (Fase 2) |

* **Keuntungan Update ke Frappe Backend:**
  - **Query lebih sederhana**: Frappe DocType sudah menerapkan denormalisasi terkontrol, sehingga JOIN berkurang drastis. Contoh: `SyncEncounter` yang tadinya butuh 4 JOIN (`reg_periksa JOIN pasien JOIN pegawai JOIN poliklinik`) menjadi cukup query 1 tabel `tabRegistrasi Pasien` karena `nm_pasien`, `nm_poli`, `nm_dokter` sudah di-embed via `fetch_from`.
  - **Data consistency**: Frappe auto audit trail memastikan data yang di-sync ke SatuSehat selalu traceable.
  - **Dual-mode**: Selama transisi, `khanza-satusehat-sync` bisa menjalankan **dual data source** — query Frappe untuk data baru, fallback ke `sik.sql` untuk data legacy yang belum dimigrasikan.

* **Penerapan — 2 Opsi Akses Data:**

  ```
  Opsi A: Direct SQL ke Frappe MariaDB (Performant)
  ─────────────────────────────────────────────────
  khanza-satusehat-sync (Effect TS)
       │
       ▼ SQL query ke Frappe MariaDB
  ┌─────────────────────────────────────┐
  │ Frappe MariaDB                      │
  │  tabRegistrasi Pasien  (Encounter)  │
  │  tabPemeriksaan Rawat Jalan (TTV)   │
  │  tabDiagnosa Pasien    (Condition)  │
  │  tabResep Obat         (Medication) │
  └─────────────────────────────────────┘

  Opsi B: Frappe REST API (Decoupled, future-proof)
  ──────────────────────────────────────────────────
  khanza-satusehat-sync (Effect TS)
       │
       ▼ HTTP GET /api/resource/Registrasi Pasien
  ┌─────────────────────────────────────┐
  │ Frappe Gunicorn (khanza_rs)         │
  │  bridging/api.py → pasien_core/api  │
  └─────────────────────────────────────┘
  ```

  **Rekomendasi:** Mulai dengan **Opsi A** (Direct SQL) untuk performa tinggi dan migrasi minimal pada `khanza-satusehat-sync`. Migrasi ke **Opsi B** (REST API) secara bertahap setelah Frappe backend stabil.

* **Fase Update `khanza-satusehat-sync`:**
  - **Fase 1:** Update query `SyncEncounter`, `SyncObservationTTV`, `SyncClinical`, `SyncPharmacy` → target Frappe DocType tables
  - **Fase 2:** Update query `SyncDiagnostic`, `SyncImaging` → setelah modul `penunjang_medis` siap
  - **Fase 3:** Update query `SyncVaccine`, `SyncQuestionnaire`, `SyncAllergy`, `SyncCarePlan` → setelah modul extended siap

---

### Keputusan 6: Prioritas Modul Aligned dengan SatuSehat FHIR Compliance

Urutan pembangunan modul **WAJIB mengikuti dependency chain SatuSehat FHIR**, karena SatuSehat adalah mandat regulasi Kemenkes yang harus diprioritaskan. Berdasarkan analisis **13 sync job** di `khanza-satusehat-sync` (Effect TS daemon), berikut adalah dependency chain FHIR resource → tabel Khanza → Module Def:

```
SatuSehat FHIR Resource Chain:

[1] Encounter ──────► reg_periksa, pasien, pegawai, poliklinik
                      ► pasien_core (WAJIB Fase 1)
    │
    ▼
[2] Condition ──────► diagnosa_pasien, penyakit
[2] Procedure ──────► rawat_jl_dr, rawat_jl_pr, jns_perawatan
[2] Observation TTV ► pemeriksaan_ralan, pemeriksaan_ranap
[2] ClinicalImpression ► pemeriksaan_ralan (assessment)
                      ► rawat_jalan, rawat_inap (WAJIB Fase 1)
    │
    ▼
[3] MedicationRequest ► resep_obat, resep_dokter
[3] MedicationDispense ► detail_pemberian_obat
[3] MedicationStatement ► resep_obat + dispensing
                      ► farmasi (WAJIB Fase 1)
    │
    ▼
[4] ServiceRequest ──► permintaan_lab, permintaan_radiologi
[4] Specimen ────────► periksa_lab (specimen)
[4] Observation Lab ─► detail_periksa_lab
[4] DiagnosticReport ► periksa_radiologi
                      ► penunjang_medis (Fase 2)
    │
    ▼
[5] AllergyIntolerance ► data alergi pasien
[5] CarePlan ──────────► rencana keperawatan
[5] Composition ───────► resume medis
[5] EpisodeOfCare ─────► rawat inap episode
                      ► rawat_inap + rekam_medis (Fase 2)
    │
    ▼
[6] Immunization ──────► data vaksinasi
[6] QuestionnaireResponse ► skrining, asesmen
                      ► penunjang_medis (Fase 3)
```

* **Implikasi terhadap Prioritas Module Def:**
  - **Fase 1 (SatuSehat Mandatory Resources):** `pasien_core` → `rawat_jalan` → `farmasi` → `keuangan`
  - **Fase 2 (SatuSehat Diagnostic & Inpatient):** `penunjang_medis` → `rawat_inap`
  - **Fase 3 (SatuSehat Extended & Support):** `kepegawaian` → `bridging`

* **Tabel Khanza yang di-query oleh `khanza-satusehat-sync`:**

| Tabel `sik.sql` | FHIR Resource | Module Def Target |
|-----------------|---------------|-------------------|
| `reg_periksa` | Encounter | pasien_core |
| `pasien` | Patient (reference) | pasien_core |
| `pegawai` | Practitioner (reference) | pasien_core |
| `poliklinik` | Location (reference) | pasien_core |
| `pemeriksaan_ralan` | Observation TTV | rawat_jalan |
| `pemeriksaan_ranap` | Observation TTV | rawat_inap |
| `diagnosa_pasien` + `penyakit` | Condition (ICD-10) | rawat_jalan |
| `rawat_jl_dr` + `jns_perawatan` | Procedure | rawat_jalan |
| `resep_obat` + `resep_dokter` | MedicationRequest | farmasi |
| `detail_pemberian_obat` | MedicationDispense | farmasi |
| `permintaan_lab` + `periksa_lab` | ServiceRequest, Specimen, Observation, DiagnosticReport | penunjang_medis |
| `permintaan_radiologi` + `periksa_radiologi` | ServiceRequest, Observation, DiagnosticReport | penunjang_medis |
| `satu_sehat_mapping_*` | (mapping tables) | bridging |

---

## 3. Konsekuensi & Keuntungan (Consequences & Benefits)

### Positif (+)

* **SatuSehat Compliance-First:** Dengan mengikuti dependency chain FHIR, setiap fase porting langsung menghasilkan peningkatan compliance SatuSehat yang terukur. Fase 1 langsung cover Encounter + Condition + Procedure + Observation + Medication (5 resource wajib utama).
* **Web-Based & Multi-Platform:** Seluruh staf RS bisa mengakses SIMRS via browser dari PC, tablet, atau HP tanpa instalasi Java. Eliminasi *Update Hell* distribusi file `.jar`.
* **Modular & Maintainable:** Dengan 8 bounded context dan interface contract, perubahan di modul `farmasi` tidak akan merusak modul `keuangan`. Code review checklist: tidak ada direct import lintas modul kecuali via `api.py`.
* **Leverage ERPNext Ecosystem:** Modul Accounting (CoA, Journal Entry), HR (Employee, Attendance, Payroll), dan Asset Management sudah tersedia dan battle-tested. Tim hanya perlu membangun custom DocType untuk domain healthcare spesifik.
* **Built-in Security:** Frappe menyediakan Role-Based Permission Manager per DocType, per record, per field — jauh lebih granular dari menu-level permission di Khanza Java.
* **REST API Otomatis:** Setiap DocType langsung memiliki REST API (GET/POST/PUT/DELETE), memudahkan integrasi dengan sistem luar tanpa menulis endpoint manual.
* **Audit Trail:** Frappe secara otomatis mencatat setiap perubahan dokumen (Version History), siapa yang mengubah, kapan, dan field apa yang berubah.

### Negatif (-)

* **Learning Curve Frappe:** Tim developer harus mempelajari Frappe Framework (Python, Jinja, MariaDB, hooks system). Estimasi 2-4 minggu onboarding.
* **Feature Parity Gap:** Khanza memiliki 1.629 file Java dengan ribuan fitur spesifik RS Indonesia. Porting penuh membutuhkan waktu 12+ bulan. Selama transisi, dua sistem harus berjalan paralel.
* **Data Migration Risk:** 1.161 tabel dengan data bertahun-tahun memerlukan script migrasi yang cermat. Data korup atau hilang dapat menyebabkan masalah operasional RS.
* **Performance Profiling:** Frappe ORM bisa lebih lambat dari raw SQL untuk operasi bulk tertentu. Perlu benchmarking dan optimasi di area-area kritis (billing, lab results).
