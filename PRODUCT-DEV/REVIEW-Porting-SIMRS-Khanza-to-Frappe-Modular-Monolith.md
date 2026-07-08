# REVIEW: Porting SIMRS Khanza ke Frappe.io — Modular Monolith Architecture

**Tanggal:** 8 Juli 2026  
**Penulis:** AI Coding Assistant (Antigravity) & User  
**Status:** Final Review  
**Referensi Arsitektur:** `~/OPREK3/alchemy-effect/ERPNext_modular_monolith`

---

## Daftar Isi

1. [Ringkasan Eksekutif](#1-ringkasan-eksekutif)
2. [Profil Arsitektur SIMRS Khanza Eksisting](#2-profil-arsitektur-simrs-khanza-eksisting)
3. [Gap Analysis: Java Swing vs Frappe Modular Monolith](#3-gap-analysis-java-swing-vs-frappe-modular-monolith)
4. [Domain Mapping: 31 Modul Khanza → 8 Frappe Module Def](#4-domain-mapping-31-modul-khanza--8-frappe-module-def)
5. [Strategi Migrasi 1.161 Tabel Database](#5-strategi-migrasi-1161-tabel-database)
6. [Strategi Bridging (486 File Integrasi Eksternal)](#6-strategi-bridging-486-file-integrasi-eksternal)
7. [Rekomendasi Fase Porting](#7-rekomendasi-fase-porting)
8. [Risk Matrix & Mitigasi](#8-risk-matrix--mitigasi)
9. [Rekomendasi Strategis Akhir](#9-rekomendasi-strategis-akhir)

---

## 1. Ringkasan Eksekutif

SIMRS Khanza adalah Sistem Informasi Manajemen Rumah Sakit *open-source* yang sangat populer di Indonesia, dengan ribuan instalasi di Rumah Sakit, Klinik, dan Puskesmas. Namun, arsitektur dasarnya — **Java Swing Desktop 2-Tier** — telah mencapai batas skalabilitas:

- **Ketergantungan Desktop:** Setiap komputer klien menjalankan aplikasi Java GUI yang terhubung langsung ke MySQL. Pembaruan memerlukan distribusi file `.jar` ke seluruh komputer RS.
- **Monolith Raksasa:** File `frmUtama.java` berukuran **2.4 MB** (single God Class), menunjukkan *spaghetti code* yang sangat sulit di-maintain.
- **Tidak Web-Accessible:** Tidak dapat diakses melalui browser, tidak mendukung mobile, dan tidak mendukung *multi-site* secara native.

**Rekomendasi utama:** Porting SIMRS Khanza ke **Frappe.io Framework** menggunakan arsitektur **Modular Monolith** yang telah divalidasi melalui proyek `exam_hub` di `ERPNext_modular_monolith`. Pendekatan ini menawarkan:

- **Web-Based:** Akses via browser dari mana saja
- **Modular:** Domain bisnis terisolasi ketat, mudah di-maintain
- **Built-in ERP:** Frappe/ERPNext sudah menyediakan *accounting*, *HR*, dan *inventory* sebagai fondasi
- **API-First:** REST API bawaan untuk setiap DocType
- **Multi-Tenant:** Satu bench, banyak site

---

## 2. Profil Arsitektur SIMRS Khanza Eksisting

### 2.1 Statistik Kode Sumber

| Metrik | Nilai | Catatan |
|--------|-------|---------|
| **Total File Java** | 1.629 | Di `src/` |
| **Total Modul/Package** | 31 folder | Lihat Section 4 |
| **Total Tabel Database** | 1.161 | Di `sik.sql` (~13 MB dump) |
| **File Terbesar** | `RMRiwayatPerawatan.java` (3.3 MB) | Single class, ribuan baris |
| **God Class Utama** | `frmUtama.java` (2.4 MB) | Menu utama + semua navigasi |
| **Bridging Files** | 486 file | Integrasi BPJS, SatuSehat, dll. |
| **Sub-Aplikasi** | 20+ folder root | Antrian, Anjungan, SatuSehat Service, dll. |

### 2.2 Arsitektur 2-Tier

```
┌─────────────────────────────────────────────────────────────────┐
│                    KLIEN DESKTOP (Java Swing)                   │
│  ┌─────────────────┐  ┌──────────────┐  ┌─────────────────┐    │
│  │ DlgPasien.java  │  │ DlgReg.java  │  │ DlgKasir*.java  │    │
│  │ (Pendaftaran)   │  │ (Registrasi) │  │ (Kasir/Billing) │    │
│  └────────┬────────┘  └──────┬───────┘  └────────┬────────┘    │
│           │                  │                    │             │
│           ▼ JDBC             ▼ JDBC               ▼ JDBC       │
└───────────┼──────────────────┼────────────────────┼─────────────┘
            │                  │                    │
┌───────────▼──────────────────▼────────────────────▼─────────────┐
│                    MySQL DATABASE (sik.sql)                      │
│           1.161 tabel, koneksi langsung tanpa middleware         │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Kelemahan Kritis Arsitektur Eksisting

| # | Kelemahan | Dampak |
|---|-----------|--------|
| 1 | **God Class** — `frmUtama.java` 2.4 MB | Perubahan kecil berisiko merusak seluruh aplikasi |
| 2 | **Direct JDBC** — Setiap PC koneksi langsung ke DB | Database overload saat jam sibuk, rentan SQL injection |
| 3 | **Tight Coupling** — SQL JOIN bebas lintas domain | Perubahan struktur tabel berdampak ke puluhan file |
| 4 | **No API Layer** — Tidak ada REST/HTTP endpoint | Tidak bisa diintegrasikan oleh sistem luar |
| 5 | **Desktop Only** — Java Swing GUI | Tidak bisa diakses dari mobile/tablet/web |
| 6 | **Update Hell** — Distribusi `.jar` manual | Pembaruan harus ke setiap PC klien |
| 7 | **No Audit Trail** — Logging minimal | Sulit melacak siapa mengubah apa |
| 8 | **No Permission System** — Hak akses di level menu | Tidak ada *role-based permission* per record |

---

## 3. Gap Analysis: Java Swing vs Frappe Modular Monolith

| Dimensi | SIMRS Khanza (Java Swing) | Frappe Modular Monolith (Target) |
|---------|---------------------------|----------------------------------|
| **Arsitektur** | 2-Tier Desktop, JDBC langsung | 3-Tier Web: Browser → Gunicorn → MariaDB |
| **UI** | Java Swing Forms (`.form` files) | Frappe Desk (Web UI, Auto-generated Forms) |
| **Database** | MySQL, tabel flat, SQL manual | MariaDB, DocType-driven schema, ORM |
| **Modularitas** | Package Java (loose, no enforcement) | Module Def (ketat, per bounded context) |
| **API** | Tidak ada | REST API otomatis per DocType + `api.py` custom |
| **Komunikasi Antar-Modul** | Import Java langsung, SQL JOIN bebas | Interface Contract (`api.py`) + Event (`hooks.py`) |
| **Permission** | Menu-level di `admin` table | Role-Based Permission Manager (per DocType, per record) |
| **Workflow** | Hardcoded di Java | Frappe Workflow Engine (deklaratif) |
| **Reporting** | HTML templates hardcoded | Report Builder + Script Report + Print Format |
| **Deployment** | Manual `.jar` distribution | `bench update`, `bench migrate` |
| **Multi-Site** | Tidak didukung | Native multi-tenancy |

### Gap Severity Matrix

```
Kritis ████████████ Arsitektur (2-Tier → 3-Tier Web)
Kritis ████████████ Data Model (1.161 flat tables → DocType)
Tinggi ████████░░░░ UI (Swing → Web Forms)
Tinggi ████████░░░░ Bridging BPJS/SatuSehat (Java → Python)
Sedang ██████░░░░░░ Reporting (HTML → Print Format)
Rendah ████░░░░░░░░ Permission System (Menu → RBAC)
```

---

## 4. Domain Mapping: 31 Modul Khanza → 8 Frappe Module Def

### 4.1 Pemetaan Modul

Berdasarkan analisis 31 folder `src/` di SIMRS Khanza, kami merekomendasikan konsolidasi menjadi **8 Module Def** yang mengikuti prinsip *Bounded Context*:

| # | Module Def Frappe | Folder Khanza yang Dipetakan | DocType Estimasi | Prioritas |
|---|-------------------|------------------------------|------------------|-----------|
| 🔵 1 | **`pasien_core`** | `simrskhanza` (DlgPasien, DlgReg, DlgBangsal, DlgPoli, DlgKamar) | ~30 DocType | **Fase 1** |
| 🟢 2 | **`rawat_jalan`** | `simrskhanza` (DlgRawatJalan, DlgDpjp), `rekammedis` (RM*Ralan*) | ~50 DocType | Fase 2 |
| 🟡 3 | **`rawat_inap`** | `simrskhanza` (DlgKamarInap, DlgRawatInap), `rekammedis` (RM*Ranap*), `dapur`, `tranfusidarah` | ~60 DocType | Fase 2 |
| 🟠 4 | **`farmasi`** | `inventory` (semua Dlg*Obat*, Dlg*Resep*), `permintaan` | ~40 DocType | **Fase 1** |
| 🔴 5 | **`penunjang_medis`** | `simrskhanza` (DlgPeriksaLab*, DlgPeriksaRadiologi), `rekammedis` (RM*Lab*, RM*Radiologi*) | ~30 DocType | Fase 2 |
| 🟣 6 | **`keuangan`** | `keuangan` (semua Dlg*, Keuangan*) | ~80 DocType | **Fase 1** |
| ⚫ 7 | **`kepegawaian`** | `kepegawaian` (DlgDokter, DlgPetugas, SKP*, K3RS*) | ~40 DocType | Fase 3 |
| 🔶 8 | **`bridging`** | `bridging` (BPJS*, SatuSehat*, PCare*, Inhealth*) | ~20 DocType | Fase 3 |

**Modul yang tidak dipetakan langsung** (di-absorb ke modul terdekat atau ditunda):
- `laporan` → Diserap ke masing-masing modul via Frappe Report
- `informasi`, `grafikanalisa` → Diserap ke Frappe Dashboard per modul
- `ipsrs` → Dapat menggunakan ERPNext Asset Maintenance
- `toko` → Dapat menggunakan ERPNext Selling
- `perpustakaan`, `parkir`, `ziscsr` → Prioritas rendah / modul mandiri terpisah
- `surat` → Frappe Print Format + Letter Head
- `setting`, `fungsi`, `restore` → Utilitas internal, diserap ke `pasien_core`
- `smsservice`, `smsui`, `smsobj`, `smsimage` → Frappe Notification Engine
- `viabarcode` → Frappe Barcode Field
- `widget`, `picture`, `48x48` → Aset UI, tidak perlu migrasi
- `pcraicra` → Diserap ke `bridging`

### 4.2 Aturan Interaksi Antar-Modul (Bounded Context Rules)

```
┌───────────────────────────────────────────────────────────────────────┐
│                          khanza_rs (App)                              │
│                                                                       │
│  ┌──────────────┐   api.py    ┌──────────────┐                        │
│  │ pasien_core  │ ◄─────────► │  rawat_jalan │                        │
│  │ (Master)     │             │  (Periksa)   │                        │
│  └──────┬───────┘             └──────┬───────┘                        │
│         │                            │                                │
│    api.py                       api.py                                │
│         │                            │                                │
│  ┌──────▼───────┐             ┌──────▼───────┐     ┌──────────────┐  │
│  │   farmasi    │             │  rawat_inap  │     │ kepegawaian  │  │
│  │ (Obat/Resep) │             │  (Bangsal)   │     │ (SDM)        │  │
│  └──────┬───────┘             └──────┬───────┘     └──────────────┘  │
│         │                            │                                │
│    hooks.py (on_submit)         hooks.py (on_submit)                  │
│         │                            │                                │
│  ┌──────▼────────────────────────────▼───────┐     ┌──────────────┐  │
│  │              keuangan                      │     │  bridging    │  │
│  │     (Billing, Kasir, Jurnal)               │     │ (BPJS/SS)   │  │
│  └────────────────────────────────────────────┘     └──────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

**Aturan Kritis:**

| Dari → Ke | Mekanisme | Contoh |
|-----------|-----------|--------|
| rawat_jalan → pasien_core | `api.py` (sync call) | Ambil data pasien untuk pemeriksaan |
| rawat_jalan → farmasi | `api.py` (sync call) | Cek stok obat saat peresepan |
| rawat_jalan → keuangan | `hooks.py` (event on_submit) | Picu billing saat pemeriksaan selesai |
| rawat_inap → keuangan | `hooks.py` (event on_submit) | Picu billing harian kamar |
| farmasi → keuangan | `hooks.py` (event on_submit) | Picu jurnal saat pemberian obat |
| keuangan → bridging | `api.py` (sync call) | Kirim data klaim BPJS |
| pasien_core → rawat_jalan | **DILARANG** direct call | pasien_core bersifat pasif |

---

## 5. Strategi Migrasi 1.161 Tabel Database

### 5.1 Klasifikasi Tabel

Dari 1.161 tabel di `sik.sql`, kami mengklasifikasikan ke dalam 4 kategori:

| Kategori | Estimasi Tabel | Strategi | Contoh |
|----------|---------------|----------|--------|
| **A. Master Data** | ~150 tabel | Buat DocType Frappe, migrasi data | `pasien`, `dokter`, `petugas`, `bangsal`, `poliklinik`, `kamar` |
| **B. Transaksi Inti** | ~300 tabel | Buat DocType Frappe, migrasi data selektif | `reg_periksa`, `rawat_jl_dr`, `nota_jalan`, `detail_pemberian_obat` |
| **C. Bridging/Mapping** | ~200 tabel | Port ke `bridging` module atau middleware | `bridging_sep`, `satusehat_mapping_*`, `maping_poli_bpjs` |
| **D. Laporan/Konfigurasi** | ~500 tabel | Absorb ke Frappe Report/Setting, banyak yang obsolete | `akun_*`, `template_*`, `setting_*`, laporan-laporan |

### 5.2 Pendekatan: Phased Porting, Bukan Big-Bang

> **REKOMENDASI:** Jangan migrasi semua 1.161 tabel sekaligus. Lakukan per bounded context sesuai fase porting.

**Fase 1 (pasien_core + keuangan + farmasi):**
- Buat ~100 DocType baru di Frappe yang memetakan tabel-tabel inti
- Data lama tetap di `sik.sql`, diakses via middleware existing jika perlu
- Data baru masuk ke Frappe MariaDB

**Fase 2 (rawat_jalan + rawat_inap + penunjang_medis):**
- Buat ~140 DocType tambahan
- Mulai migrasi data rekam medis secara bertahap

**Fase 3 (kepegawaian + bridging):**
- Leverage ERPNext HR Module untuk kepegawaian
- Bridging BPJS/SatuSehat bisa tetap di middleware Effect TS atau di-port ke Frappe Server Script

### 5.3 ERPNext DocType yang Bisa Di-Leverage

Frappe/ERPNext sudah menyediakan banyak DocType bawaan yang sesuai dengan domain RS:

| Domain Khanza | ERPNext DocType Existing | Keterangan |
|---------------|-------------------------|------------|
| Keuangan (COA) | Chart of Accounts, Journal Entry, Payment Entry | Sangat mature |
| Inventory Obat | Item, Stock Entry, Purchase Order, Stock Ledger | Perlu kustomisasi untuk farmasi |
| Kepegawaian | Employee, Attendance, Leave, Payroll | Perlu kustomisasi untuk shift RS |
| Aset/IPSRS | Asset, Asset Maintenance | Sudah tersedia |
| Supplier/Vendor | Supplier, Purchase Invoice | Sudah tersedia |

---

## 6. Strategi Bridging (486 File Integrasi Eksternal)

### 6.1 Inventaris Integrasi Eksisting

| Sistem Eksternal | File Khanza | Kompleksitas | Rekomendasi |
|------------------|-------------|-------------|-------------|
| **BPJS V-Claim (SEP, Rujukan, Monitoring)** | ~120 file | Sangat Tinggi | Tetap di middleware Effect TS / port ke Frappe Server Script |
| **BPJS PCare** | ~50 file | Tinggi | Port ke Frappe Server Script |
| **SatuSehat (FHIR R4)** | ~60 file | Sangat Tinggi | **Tetap di `khanza-satusehat-sync` (Effect TS)** — sudah ada |
| **Mobile JKN** | ~10 file | Sedang | Port ke Frappe API |
| **INACBG / SmartKlaim** | ~10 file | Sedang | Port ke Frappe Server Script |
| **Inhealth** | ~30 file | Tinggi | Port bertahap |
| **Sisrute** | ~20 file | Sedang | Port ke Frappe API |
| **Bank (BRI, Mandiri, BJB, Papua)** | ~20 file | Sedang | Reuse Hyperswitch/CarePay |
| **DICOM (Orthanc)** | ~5 file | Rendah | Port ke Frappe API |
| **Dukcapil** | ~5 file | Rendah | Port ke Frappe API |
| **Lab Instrument (MEDQLAB, SOFTMEDIX, LICA)** | ~15 file | Tinggi | Port bertahap |

### 6.2 Rekomendasi Arsitektur Bridging

```
┌──────────────────────────────────────────────────────────┐
│                  Frappe (khanza_rs)                        │
│  ┌──────────────────────────────────────────────────┐     │
│  │ bridging Module Def                               │     │
│  │  ├── bridging_bpjs/api.py    (VClaim, PCare)     │     │
│  │  ├── bridging_satusehat/api.py (delegation)      │     │
│  │  └── bridging_payment/api.py (QRIS, VA)          │     │
│  └──────────────────┬───────────────────────────────┘     │
└─────────────────────┼─────────────────────────────────────┘
                      │ REST API / Event
┌─────────────────────▼─────────────────────────────────────┐
│            MIDDLEWARE LAYER (Existing)                      │
│  ┌─────────────────────┐  ┌────────────────────────────┐  │
│  │ khanza-satusehat-   │  │ Hyperswitch / CarePay ECR  │  │
│  │ sync (Effect TS)    │  │ (Payment Gateway)          │  │
│  └──────────┬──────────┘  └─────────────┬──────────────┘  │
└─────────────┼───────────────────────────┼─────────────────┘
              │                           │
    ┌─────────▼──────┐        ┌──────────▼──────────┐
    │   Kemenkes     │        │  Bimasakti / Bank   │
    │   SatuSehat    │        │  (SNAP BI)          │
    └────────────────┘        └─────────────────────┘
```

**Prinsip:** Frappe `bridging` module bertindak sebagai *orchestrator* yang mendelegasikan ke middleware existing untuk operasi kompleks (SatuSehat FHIR, Payment) dan menangani sendiri untuk operasi sederhana (PCare lookup, Sisrute referensi).

---

## 7. Rekomendasi Fase Porting

### Fase 1: Foundation + SatuSehat Mandatory Resources (Bulan 1-3)

**Target:** Pasien bisa didaftarkan, diperiksa (SOAP + TTV), di-diagnosa (ICD-10), diberi resep, dan di-billing via web Frappe. Data langsung compatible dengan `khanza-satusehat-sync` untuk 5 FHIR resource wajib.

> **SatuSehat Alignment:** Berdasarkan analisis 13 sync job di `khanza-satusehat-sync`, Encounter → Condition → Procedure → Observation TTV → MedicationRequest semuanya bergantung pada tabel-tabel di 4 modul ini.

| Item | Detail | SatuSehat FHIR Resource |
|------|--------|------------------------|
| **Module Def** | `pasien_core`, `rawat_jalan`, `farmasi`, `keuangan` | — |
| **DocType Kunci** | Pasien, Registrasi, Poliklinik, Pemeriksaan Rawat Jalan, Diagnosa Pasien, Tindakan, Resep Obat, Billing | Encounter, Condition, Procedure, Observation TTV, MedicationRequest, MedicationDispense |
| **Deployment** | `bench new-app khanza_rs` di wsladvan2 | — |
| **Outcome** | Full clinical workflow: daftar → periksa (SOAP+TTV) → diagnosa → resep → billing | 5/13 FHIR resources covered |

### Fase 2: SatuSehat Diagnostic & Inpatient (Bulan 4-8)

**Target:** Lab, Radiologi, dan Rawat Inap ter-cover. SatuSehat diagnostic chain lengkap.

| Item | Detail | SatuSehat FHIR Resource |
|------|--------|------------------------|
| **Module Def** | `penunjang_medis`, `rawat_inap` | — |
| **DocType Kunci** | Permintaan Lab, Hasil Lab, Permintaan Radiologi, Hasil Radiologi, Rawat Inap Pasien, Mutasi Kamar | ServiceRequest, Specimen, Observation Lab, DiagnosticReport, EpisodeOfCare, AllergyIntolerance, CarePlan |
| **Outcome** | Workflow klinis end-to-end termasuk ranap, lab, radiologi | 12/13 FHIR resources covered |

### Fase 3: SDM, Bridging & SatuSehat Extended (Bulan 9-12)

**Target:** HR dan bridging BPJS terintegrasi. SatuSehat extended resources (Immunization, QuestionnaireResponse).

| Item | Detail | SatuSehat FHIR Resource |
|------|--------|------------------------|
| **Module Def** | `kepegawaian`, `bridging` | — |
| **DocType Kunci** | Jadwal Dokter, Jasa Medis, SEP BPJS, Mapping SatuSehat, SatuSehat Log | Immunization, QuestionnaireResponse |
| **Outcome** | Penggajian dokter otomatis, cetak SEP dari Frappe, 13/13 FHIR resources | Full SatuSehat coverage |

### Fase 4: Polish & Go-Live (Bulan 12+)

**Target:** Production-ready, data migrasi, training user.

| Item | Detail |
|------|--------|
| **Aktivitas** | Migrasi data dari `sik.sql`, training staf RS, UAT, security audit |
| **Outcome** | Go-live di satu RS pilot |

---

## 8. Risk Matrix & Mitigasi

| # | Risiko | Dampak | Probabilitas | Mitigasi |
|---|--------|--------|-------------|----------|
| 1 | **Feature Parity Gap** — Khanza punya 1.629 file, porting semua butuh tahun | Kritis | Tinggi | Prioritaskan fitur berdasarkan frekuensi penggunaan RS, bukan semua fitur |
| 2 | **Data Migration Failure** — 1.161 tabel dengan data bertahun-tahun | Kritis | Sedang | Script migrasi per fase, backup berlapis, jalankan parallel system |
| 3 | **User Resistance** — Staf RS terbiasa Java Swing, enggan pindah web | Tinggi | Tinggi | Training intensif, UI/UX Frappe yang familiar, transisi bertahap |
| 4 | **Frappe Learning Curve** — Tim dev harus belajar Python + Frappe | Tinggi | Sedang | Workshop Frappe, gunakan dokumentasi ERPNext_modular_monolith sebagai panduan |
| 5 | **Bridging Complexity** — 486 file integrasi BPJS/SatuSehat | Tinggi | Tinggi | Tetap pakai middleware existing (Effect TS), port bertahap |
| 6 | **Performance Regression** — Frappe ORM bisa lebih lambat dari raw SQL | Sedang | Sedang | Optimasi query, gunakan MariaDB indeks, server benchmark |
| 7 | **Regulatory Compliance** — Perubahan mendadak dari Kemenkes/BPJS | Sedang | Tinggi | Middleware layer memudahkan adaptasi tanpa ubah core |
| 8 | **Concurrent System** — Menjalankan Khanza lama & Frappe baru bersamaan | Sedang | Rendah | Database terpisah, sync via middleware jika perlu |

---

## 9. Rekomendasi Strategis Akhir

### ✅ DIREKOMENDASIKAN

1. **Porting Bertahap (Phased)** — Bukan big-bang rewrite. Mulai dari `pasien_core` sebagai proof-of-concept.
2. **Modular Monolith Pattern** — Adopsi penuh dari `ERPNext_modular_monolith`: Module Def, api.py, hooks.py, denormalisasi terkontrol.
3. **Leverage ERPNext** — Gunakan modul ERPNext existing (Accounting, HR, Asset) sebagai fondasi, custom module untuk domain healthcare spesifik.
4. **Pertahankan Middleware** — `khanza-satusehat-sync` (Effect TS), Hyperswitch (Payment) tetap berjalan. Frappe bertindak sebagai UI/orchestrator.
5. **Deploy di wsladvan2** — Gunakan bench existing yang sudah ada `frappe` + `erpnext`.

### ❌ TIDAK DIREKOMENDASIKAN

1. **Big-Bang Rewrite** — Menulis ulang semua 1.629 file Java sekaligus. Risiko terlalu tinggi.
2. **Microservices** — Over-engineering untuk tahap ini. Modular Monolith sudah cukup.
3. **Migrasi Data Sekaligus** — 1.161 tabel terlalu besar untuk satu kali migrasi.
4. **Membuang Middleware Existing** — `khanza-satusehat-sync` sudah berjalan baik, jangan di-rewrite ke Python.

### 📊 Perbandingan Opsi Arsitektur

| Opsi | Kelebihan | Kekurangan | Rekomendasi |
|------|-----------|------------|-------------|
| **A. Modular Monolith Frappe** | Cepat build, leverage ERPNext, satu database | Harus belajar Frappe | ✅ **DIPILIH** |
| **B. Microservices (Node.js/Go)** | Skalabel tinggi | Over-engineering, mahal | ❌ |
| **C. SPA + API (React + Express)** | UI modern | Harus bangun dari nol | ❌ |
| **D. Port ke Spring Boot (Java)** | Tim sudah familiar Java | Masih monolith, tanpa ERP | ❌ |

---

*Dokumen ini menjadi dasar pembuatan ATR-009 (Architecture Technical Review) dan PRD-001 (Product Requirement Document) untuk pelaksanaan porting SIMRS Khanza ke Frappe.io.*
