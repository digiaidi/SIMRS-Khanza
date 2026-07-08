# PRD-001: Porting SIMRS Khanza ke Frappe.io — Modular Monolith

**Proyek:** `khanza_rs` — Sistem Informasi Manajemen Rumah Sakit  
**Framework:** Frappe.io (Modular Monolith)  
**Target Deployment:** wsladvan2 (`ssh wsladvan2`)  
**Status:** Draft / Proposal  
**Versi:** 1.0  
**Tanggal:** 8 Juli 2026

---

## Daftar Isi

1. [Ringkasan Eksekutif](#1-ringkasan-eksekutif)
2. [Latar Belakang & Motivasi](#2-latar-belakang--motivasi)
3. [Arsitektur Aplikasi & Batas Domain](#3-arsitektur-aplikasi--batas-domain)
4. [Spesifikasi Fungsional — Fase 1](#4-spesifikasi-fungsional--fase-1)
5. [Implementasi Teknikal Modular Monolith](#5-implementasi-teknikal-modular-monolith)
6. [Struktur Data (DocType Design) — Fase 1](#6-struktur-data-doctype-design--fase-1)
7. [Alur Kerja Utama (User Flow)](#7-alur-kerja-utama-user-flow)
8. [Kebutuhan Non-Fungsional](#8-kebutuhan-non-fungsional)
9. [Deployment Plan — wsladvan2](#9-deployment-plan--wsladvan2)
10. [Fase & Milestone](#10-fase--milestone)
11. [Risiko & Mitigasi](#11-risiko--mitigasi)

---

## 1. Ringkasan Eksekutif

Dokumen ini mendefinisikan kebutuhan untuk mem-*port* **SIMRS Khanza** dari arsitektur Java Swing Desktop (2-Tier) menjadi aplikasi web berbasis **Frappe Framework** dengan pendekatan **Modular Monolith**. Porting dilakukan secara bertahap (*phased*) dimulai dari domain **Pasien Core**, **Farmasi**, dan **Keuangan** sebagai Fase 1.

Aplikasi Frappe App bernama **`khanza_rs`** akan dibangun dengan **8 Module Def** terisolasi yang memetakan 31 modul source Khanza ke dalam bounded context yang ketat, dengan **prioritas modul aligned dengan SatuSehat FHIR compliance**. Pattern diadopsi dari proyek `exam_hub` (`ERPNext_modular_monolith`):

- **Data Ownership** — Setiap modul memiliki datanya sendiri
- **Interface Contract** — Komunikasi via `api.py`, bukan direct query
- **Event-Driven** — Loose coupling via `hooks.py`
- **Encapsulation** — Sembunyikan detail internal

---

## 2. Latar Belakang & Motivasi

### Mengapa Porting ke Frappe?

SIMRS Khanza eksisting memiliki keterbatasan arsitektural yang fundamental:

| Masalah | Dampak | Solusi Frappe |
|---------|--------|---------------|
| Java Swing Desktop (2-Tier) | Tidak bisa akses via web/mobile | Web-based, browser access |
| God Class 2.4 MB (`frmUtama.java`) | Perubahan berisiko merusak semua | Module Def terisolasi |
| SQL JOIN bebas lintas 1.161 tabel | Tight coupling, sulit maintain | Interface Contract `api.py` |
| Direct JDBC dari setiap PC | Database overload jam sibuk | 3-Tier via Gunicorn |
| Manual `.jar` distribution | Update Hell | `bench update && bench migrate` |
| Menu-level permission | Tidak granular | Role-Based Permission per record |
| Tidak ada audit trail | Sulit lacak perubahan | Auto Version History |

### Mengapa Modular Monolith, Bukan Microservices?

1. **Tim kecil** — Microservices membutuhkan DevOps matang yang belum tersedia
2. **Satu database** — RS perlu integritas data transaksional yang kuat (ACID)
3. **Kecepatan development** — Frappe menyediakan ORM, UI, API, dan permission out-of-the-box
4. **Migrasi di masa depan** — Jika modul perlu di-scale out, ubah `api.py` dari local call ke HTTP call

---

## 3. Arsitektur Aplikasi & Batas Domain (Bounded Context)

### 3.1 Frappe App

Satu Frappe App bernama **`khanza_rs`** yang diinstal pada bench di wsladvan2.

### 3.2 Module Def (8 Modul)

```
khanza_rs/
├── hooks.py                             # Pusat konfigurasi event & fixture
├── khanza_rs/
│   ├── pasien_core/                     # 🔵 Modul 1: Master Pasien & Registrasi
│   │   ├── __init__.py
│   │   ├── api.py                       # Interface Contract
│   │   └── doctype/
│   │       ├── pasien/                  # DocType: Master Pasien
│   │       ├── registrasi_pasien/       # DocType: Registrasi / Pendaftaran
│   │       ├── poliklinik/              # DocType: Master Poliklinik
│   │       ├── bangsal/                 # DocType: Master Bangsal
│   │       ├── kamar/                   # DocType: Master Kamar
│   │       ├── kamar_bed/               # Child Table: Bed dalam Kamar
│   │       ├── dokter/                  # DocType: Master Dokter (data ownership pasien_core)
│   │       └── cara_bayar/              # DocType: Jenis Pembayaran (Umum/BPJS/Asuransi)
│   │
│   ├── rawat_jalan/                     # 🟢 Modul 2: Rawat Jalan
│   │   ├── __init__.py
│   │   ├── api.py
│   │   └── doctype/
│   │       ├── pemeriksaan_rawat_jalan/ # DocType: Pemeriksaan Dokter
│   │       ├── tindakan_rawat_jalan/    # DocType: Tindakan/Prosedur
│   │       ├── diagnosa_pasien/         # DocType: Diagnosa ICD-10
│   │       └── rujukan/                 # DocType: Rujukan Keluar/Masuk
│   │
│   ├── rawat_inap/                      # 🟡 Modul 3: Rawat Inap
│   │   ├── __init__.py
│   │   ├── api.py
│   │   └── doctype/
│   │       ├── rawat_inap_pasien/       # DocType: Sesi Rawat Inap
│   │       ├── tindakan_rawat_inap/     # DocType: Tindakan Ranap
│   │       └── mutasi_kamar/            # DocType: Pindah Kamar
│   │
│   ├── farmasi/                         # 🟠 Modul 4: Farmasi & Inventory Obat
│   │   ├── __init__.py
│   │   ├── api.py
│   │   └── doctype/
│   │       ├── obat/                    # DocType: Master Obat/BHP
│   │       ├── resep_obat/              # DocType: Resep
│   │       ├── resep_obat_item/         # Child Table: Item Resep
│   │       ├── pemberian_obat/          # DocType: Dispensing
│   │       ├── stok_obat/               # DocType: Stok per Gudang/Depo
│   │       └── pembelian_obat/          # DocType: Purchase Order Obat
│   │
│   ├── penunjang_medis/                 # 🔴 Modul 5: Lab, Radiologi, IGD
│   │   ├── __init__.py
│   │   ├── api.py
│   │   └── doctype/
│   │       ├── permintaan_lab/          # DocType: Order Lab
│   │       ├── hasil_lab/               # DocType: Hasil Pemeriksaan Lab
│   │       ├── permintaan_radiologi/    # DocType: Order Radiologi
│   │       └── hasil_radiologi/         # DocType: Hasil Radiologi
│   │
│   ├── keuangan/                        # 🟣 Modul 6: Billing & Keuangan
│   │   ├── __init__.py
│   │   ├── api.py
│   │   └── doctype/
│   │       ├── billing_pasien/          # DocType: Nota/Tagihan Pasien
│   │       ├── billing_item/            # Child Table: Item Tagihan
│   │       ├── pembayaran_pasien/       # DocType: Payment/Kasir
│   │       ├── tarif_tindakan/          # DocType: Master Tarif
│   │       └── jasa_medis/              # DocType: Kalkulasi Jasa Dokter/Perawat
│   │
│   ├── kepegawaian/                     # ⚫ Modul 7: SDM
│   │   ├── __init__.py
│   │   ├── api.py
│   │   └── doctype/
│   │       ├── jadwal_dokter/           # DocType: Jadwal Praktik
│   │       └── jadwal_petugas/          # DocType: Shift Perawat/Petugas
│   │
│   └── bridging/                        # 🔶 Modul 8: Integrasi Eksternal
│       ├── __init__.py
│       ├── api.py
│       └── doctype/
│           ├── sep_bpjs/                # DocType: Surat Elegibilitas Peserta
│           ├── mapping_poli_bpjs/       # DocType: Mapping Poli Khanza ↔ BPJS
│           └── satusehat_log/           # DocType: Log Pengiriman SatuSehat
```

### 3.3 Batas Domain & Aturan Interaksi

```
┌─────────────────────────────────────────────────────────────────────┐
│                          khanza_rs                                   │
│                                                                       │
│  ┌──────────────┐   api.py    ┌──────────────────┐                    │
│  │ pasien_core  │ ◄──────────►│   rawat_jalan    │                    │
│  │ (Master)     │             │   (Periksa)      │                    │
│  └──────┬───────┘             └────────┬─────────┘                    │
│         │                              │                              │
│    api.py (get_pasien)            hooks.py (on_submit)                │
│         │                              │                              │
│  ┌──────▼───────┐             ┌────────▼─────────┐                    │
│  │   farmasi    │             │   rawat_inap     │                    │
│  │  (Obat)      │             │   (Bangsal)      │                    │
│  └──────┬───────┘             └────────┬─────────┘                    │
│         │                              │                              │
│    hooks.py                       hooks.py                            │
│    (on_submit)                    (on_submit)                         │
│         │                              │                              │
│  ┌──────▼──────────────────────────────▼─────────┐  ┌──────────────┐ │
│  │              keuangan                          │  │  bridging    │ │
│  │     (Billing, Kasir, Jurnal)                   │  │ (BPJS/SS)   │ │
│  └────────────────────────────────────────────────┘  └──────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 4. Spesifikasi Fungsional — Fase 1

Fase 1 fokus pada **4 modul** yang aligned dengan SatuSehat FHIR mandatory resources: **`pasien_core`**, **`rawat_jalan`**, **`farmasi`**, dan **`keuangan`**.

> **SatuSehat Alignment:** Fase 1 harus cover tabel-tabel yang diquery oleh `khanza-satusehat-sync` untuk 5 FHIR resource wajib: **Encounter** (`reg_periksa`, `pasien`, `pegawai`, `poliklinik`) → **Condition** (`diagnosa_pasien`) → **Procedure** (`rawat_jl_dr`) → **Observation TTV** (`pemeriksaan_ralan`) → **MedicationRequest** (`resep_obat`, `resep_dokter`).

### 4.1 Master Pasien & Registrasi — Modul `pasien_core`

#### 4.1.1 DocType: `Pasien`

Menyimpan data master pasien. Memetakan tabel `pasien` di `sik.sql`.

| Field | Type | Deskripsi |
|-------|------|-----------|
| `no_rkm_medis` | Data (Primary) | Nomor Rekam Medis (auto-generate) |
| `nm_pasien` | Data | Nama lengkap pasien |
| `no_ktp` | Data | NIK KTP (16 digit) |
| `jk` | Select | `L` \| `P` (Laki-laki / Perempuan) |
| `tmp_lahir` | Data | Tempat lahir |
| `tgl_lahir` | Date | Tanggal lahir |
| `nm_ibu` | Data | Nama ibu kandung |
| `alamat` | Small Text | Alamat lengkap |
| `gol_darah` | Select | `A` \| `B` \| `AB` \| `O` \| `-` |
| `pekerjaan` | Data | Pekerjaan |
| `stts_nikah` | Select | `BELUM MENIKAH` \| `MENIKAH` \| `JANDA` \| `DUDUK` |
| `agama` | Select | Islam, Kristen, Katolik, Hindu, Budha, Konghucu |
| `tgl_daftar` | Date | Tanggal pertama kali daftar |
| `no_tlp` | Data | Nomor telepon |
| `umur` | Data (Read Only) | Dihitung otomatis dari `tgl_lahir` |
| `pnd` | Select | Pendidikan terakhir |
| `keluarga` | Select | Hubungan penanggung jawab |
| `namakeluarga` | Data | Nama penanggung jawab |
| `no_peserta` | Data | Nomor BPJS (jika ada) |
| `kd_prop` | Data | Kode Provinsi |
| `kd_kab` | Data | Kode Kabupaten |
| `kd_kec` | Data | Kode Kecamatan |
| `kd_kel` | Data | Kode Kelurahan |
| `email` | Data | Email pasien |

**Validasi Backend:**
- `no_rkm_medis` harus unik dan auto-generate format `000001`, `000002`, dst.
- `no_ktp` harus 16 digit numerik
- `tgl_lahir` tidak boleh di masa depan

#### 4.1.2 DocType: `Poliklinik`

| Field | Type | Deskripsi |
|-------|------|-----------|
| `kd_poli` | Data (Primary) | Kode poli (3-5 karakter) |
| `nm_poli` | Data | Nama poliklinik |
| `registrasi` | Currency | Biaya registrasi |
| `registrasilama` | Currency | Biaya registrasi pasien lama |
| `status` | Select | `1` (Aktif) \| `0` (Non-Aktif) |

#### 4.1.3 DocType: `Bangsal`

| Field | Type | Deskripsi |
|-------|------|-----------|
| `kd_bangsal` | Data (Primary) | Kode bangsal |
| `nm_bangsal` | Data | Nama bangsal |
| `status` | Select | `1` (Aktif) \| `0` (Non-Aktif) |

#### 4.1.4 DocType: `Kamar`

| Field | Type | Deskripsi |
|-------|------|-----------|
| `kd_kamar` | Data (Primary) | Kode kamar |
| `kd_bangsal` | Data | Referensi ke Bangsal (Data, bukan Link lintas modul) |
| `nm_bangsal` | Data | Nama bangsal (denormalisasi) |
| `trf_kamar` | Currency | Tarif kamar per hari |
| `status` | Select | `KOSONG` \| `ISI` \| `HENTI` |
| `kelas` | Select | `Kelas 1` \| `Kelas 2` \| `Kelas 3` \| `VIP` \| `VVIP` |

#### 4.1.5 DocType: `Registrasi Pasien`

Satu record per kunjungan pasien. Memetakan tabel `reg_periksa` di `sik.sql`.

| Field | Type | Deskripsi |
|-------|------|-----------|
| `no_rawat` | Data (Primary) | Nomor rawat (auto-generate: `2026/07/08/000001`) |
| `no_rkm_medis` | Data | ID Pasien (Data, bukan Link lintas modul!) |
| `nm_pasien` | Data | Nama pasien (denormalisasi, fetch_from) |
| `tgl_registrasi` | Date | Tanggal kunjungan |
| `jam_reg` | Time | Jam registrasi |
| `kd_poli` | Link → `Poliklinik` | Poli tujuan (intra-modul, diperbolehkan) |
| `nm_poli` | Data | Nama poli (denormalisasi) |
| `kd_dokter` | Data | ID Dokter |
| `nm_dokter` | Data | Nama dokter (denormalisasi) |
| `p_jawab` | Select | `Umum` \| `BPJS` \| `Asuransi` |
| `no_peserta_bpjs` | Data | No BPJS (jika p_jawab = BPJS) |
| `almt_pj` | Small Text | Alamat penanggung jawab |
| `stts` | Select | `Belum` \| `Sudah` \| `Batal` |
| `status_lanjut` | Select | `Ralan` \| `Ranap` |
| `biaya_reg` | Currency | Biaya registrasi |

---

### 4.2 Farmasi — Modul `farmasi` (Fase 1 — Simplified)

#### 4.2.1 DocType: `Obat`

Master obat/barang habis pakai. Memetakan tabel `databarang`.

| Field | Type | Deskripsi |
|-------|------|-----------|
| `kode_brng` | Data (Primary) | Kode barang farmasi |
| `nama_brng` | Data | Nama obat/BHP |
| `kode_sat` | Data | Satuan (Tablet, Ampul, Botol, dll.) |
| `letak_barang` | Data | Lokasi penyimpanan |
| `dapiyang` | Currency | Harga dasar/beli |
| `ralan` | Currency | Harga jual rawat jalan |
| `kelas1` | Currency | Harga jual kelas 1 |
| `kelas2` | Currency | Harga jual kelas 2 |
| `kelas3` | Currency | Harga jual kelas 3 |
| `utama` | Currency | Harga jual utama |
| `vip` | Currency | Harga jual VIP |
| `stok_minimum` | Float | Stok minimum alert |
| `jenis` | Data | Jenis barang (Obat, BHP, Alkes) |
| `status` | Select | `1` (Aktif) \| `0` (Non-Aktif) |

#### 4.2.2 DocType: `Resep Obat`

| Field | Type | Deskripsi |
|-------|------|-----------|
| `no_resep` | Data (Primary) | Nomor resep (auto-generate) |
| `no_rawat` | Data | ID Registrasi (Data, bukan Link lintas modul!) |
| `nm_pasien` | Data | Nama pasien (denormalisasi) |
| `kd_dokter` | Data | ID Dokter peresep |
| `nm_dokter` | Data | Nama dokter (denormalisasi) |
| `tgl_peresepan` | Date | Tanggal resep |
| `jam` | Time | Jam peresepan |
| `status` | Select | `Belum Terlayani` \| `Terlayani` \| `Batal` |
| `items` | Table (Child) | Link ke `Resep Obat Item` |

#### 4.2.3 Child Table: `Resep Obat Item`

| Field | Type | Deskripsi |
|-------|------|-----------|
| `kode_brng` | Link → `Obat` | Referensi obat (intra-modul) |
| `nama_brng` | Data | Nama obat (fetch_from) |
| `jml` | Float | Jumlah |
| `aturan_pakai` | Data | Aturan pakai (3x1, 2x1, dll.) |
| `harga` | Currency | Harga satuan |
| `subtotal` | Currency | Harga × jumlah |

---

### 4.3 Rawat Jalan — Modul `rawat_jalan` (Fase 1 — SatuSehat Critical)

> **SatuSehat:** Modul ini menyediakan data untuk FHIR Condition (ICD-10), Procedure, Observation TTV, dan ClinicalImpression.

#### 4.3.1 DocType: `Pemeriksaan Rawat Jalan`

Memetakan tabel `pemeriksaan_ralan` di `sik.sql`. Satu record per pemeriksaan dokter.

| Field | Type | Deskripsi |
|-------|------|-----------|
| `no_rawat` | Data | ID Registrasi (Data, bukan Link lintas modul!) |
| `nm_pasien` | Data | Nama pasien (denormalisasi) |
| `tgl_perawatan` | Date | Tanggal perawatan |
| `jam_rawat` | Time | Jam pemeriksaan |
| `kd_dokter` | Data | ID Dokter pemeriksa |
| `nm_dokter` | Data | Nama dokter (denormalisasi) |
| `nip_perawat` | Data | ID Perawat |
| `keluhan` | Text | Subjective (keluhan pasien) |
| `pemeriksaan` | Text | Objective (hasil pemeriksaan fisik) |
| `penilaian` | Text | Assessment (penilaian dokter) |
| `rtl` | Text | Plan (rencana tindak lanjut) |
| `suhu_tubuh` | Float | Suhu tubuh (°C) — **SatuSehat: Observation TTV** |
| `tensi` | Data | Tekanan darah (misal "120/80") — **SatuSehat: Observation TTV** |
| `nadi` | Float | Denyut nadi (per menit) — **SatuSehat: Observation TTV** |
| `respirasi` | Float | Respirasi (per menit) — **SatuSehat: Observation TTV** |
| `tinggi` | Float | Tinggi badan (cm) |
| `berat` | Float | Berat badan (kg) |
| `spo2` | Float | SpO2 (%) |
| `gcs` | Data | Glasgow Coma Scale |
| `kesadaran` | Select | Compos Mentis / Somnolen / Sopor / Koma |

#### 4.3.2 DocType: `Diagnosa Pasien`

Memetakan tabel `diagnosa_pasien`. **SatuSehat: FHIR Condition (ICD-10)**.

| Field | Type | Deskripsi |
|-------|------|-----------|
| `no_rawat` | Data | ID Registrasi |
| `kd_penyakit` | Data | Kode ICD-10 |
| `nm_penyakit` | Data | Nama penyakit (denormalisasi) |
| `status` | Select | `Ralan` \| `Ranap` |
| `prioritas` | Int | Urutan diagnosa (1 = primer) |

#### 4.3.3 DocType: `Tindakan Rawat Jalan`

Memetakan tabel `rawat_jl_dr` / `rawat_jl_pr`. **SatuSehat: FHIR Procedure**.

| Field | Type | Deskripsi |
|-------|------|-----------|
| `no_rawat` | Data | ID Registrasi |
| `kd_jenis_prw` | Data | Kode tindakan |
| `nm_perawatan` | Data | Nama tindakan (denormalisasi) |
| `tgl_perawatan` | Date | Tanggal tindakan |
| `jam_rawat` | Time | Jam tindakan |
| `kd_dokter` | Data | ID Dokter pelaksana |
| `biaya_rawat` | Currency | Biaya tindakan |
| `material` | Currency | Biaya material |
| `bhp` | Currency | Biaya BHP |

---

### 4.4 Keuangan — Modul `keuangan` (Fase 1 — Billing Rawat Jalan)

#### 4.4.1 DocType: `Billing Pasien`

Nota tagihan per kunjungan. Memetakan tabel `nota_jalan` / `nota_inap`.

| Field | Type | Deskripsi |
|-------|------|-----------|
| `no_nota` | Data (Primary) | Nomor nota (auto-generate) |
| `no_rawat` | Data | ID Registrasi (Data, bukan Link!) |
| `nm_pasien` | Data | Nama pasien (denormalisasi) |
| `tanggal` | Date | Tanggal nota |
| `cara_bayar` | Data | Jenis pembayaran |
| `total_registrasi` | Currency | Biaya registrasi |
| `total_tindakan` | Currency | Total biaya tindakan |
| `total_obat` | Currency | Total biaya obat |
| `total_lab` | Currency | Total biaya lab |
| `total_radiologi` | Currency | Total biaya radiologi |
| `grand_total` | Currency | Total keseluruhan |
| `diskon` | Currency | Diskon (jika ada) |
| `dibayar` | Currency | Jumlah yang dibayar |
| `sisa` | Currency | Sisa hutang |
| `status` | Select | `Belum Lunas` \| `Lunas` \| `Piutang` |
| `items` | Table (Child) | Link ke `Billing Item` |

---

## 5. Implementasi Teknikal Modular Monolith (Frappe Specific)

### 5.1 Interface Contract API per Modul

#### `pasien_core/api.py` — Gerbang Resmi Master Pasien

```python
# khanza_rs/pasien_core/api.py

import frappe

def get_pasien_info(no_rkm_medis):
    """
    Contract: Mengembalikan info pasien untuk modul lain.
    Output: dict { no_rkm_medis, nm_pasien, no_ktp, jk, tgl_lahir, alamat, no_peserta }
    Modul lain DILARANG query langsung ke DocType Pasien.
    """
    pasien = frappe.get_doc("Pasien", no_rkm_medis)
    return {
        "no_rkm_medis": pasien.no_rkm_medis,
        "nm_pasien": pasien.nm_pasien,
        "no_ktp": pasien.no_ktp,
        "jk": pasien.jk,
        "tgl_lahir": str(pasien.tgl_lahir),
        "alamat": pasien.alamat,
        "no_peserta": pasien.no_peserta,
        "gol_darah": pasien.gol_darah
    }


def get_registrasi_aktif(no_rkm_medis):
    """
    Contract: Mengembalikan daftar registrasi aktif pasien.
    """
    regs = frappe.get_all("Registrasi Pasien", 
        filters={"no_rkm_medis": no_rkm_medis, "stts": "Belum"},
        fields=["no_rawat", "tgl_registrasi", "kd_poli", "nm_poli", "kd_dokter", "nm_dokter"]
    )
    return regs


def cari_pasien(keyword):
    """
    Contract: Pencarian pasien berdasarkan nama, no_rkm_medis, atau no_ktp.
    """
    return frappe.get_all("Pasien",
        filters=[
            ["Pasien", "nm_pasien", "like", f"%{keyword}%"],
        ],
        or_filters=[
            ["Pasien", "no_rkm_medis", "like", f"%{keyword}%"],
            ["Pasien", "no_ktp", "like", f"%{keyword}%"],
        ],
        fields=["no_rkm_medis", "nm_pasien", "no_ktp", "jk", "tgl_lahir", "alamat"],
        limit_page_length=50
    )
```

#### `keuangan/api.py` — Gerbang Resmi Billing

```python
# khanza_rs/keuangan/api.py

import frappe
from khanza_rs.pasien_core.api import get_pasien_info

def create_billing_rawat_jalan(doc, method):
    """
    Contract: Dipanggil via hooks.py saat Registrasi Pasien di-submit.
    Membuat nota billing awal dengan biaya registrasi.
    """
    billing = frappe.new_doc("Billing Pasien")
    billing.no_rawat = doc.no_rawat
    billing.nm_pasien = doc.nm_pasien
    billing.tanggal = doc.tgl_registrasi
    billing.cara_bayar = doc.p_jawab
    billing.total_registrasi = doc.biaya_reg
    billing.grand_total = doc.biaya_reg
    billing.status = "Belum Lunas"
    billing.insert(ignore_permissions=True)
    return billing.name


def tambah_item_billing(no_rawat, jenis, keterangan, jumlah, harga):
    """
    Contract: Menambah item ke billing pasien yang sudah ada.
    Dipanggil oleh modul farmasi (setelah pemberian obat) atau 
    modul rawat_jalan (setelah tindakan).
    """
    billing = frappe.get_doc("Billing Pasien", {"no_rawat": no_rawat})
    billing.append("items", {
        "jenis": jenis,
        "keterangan": keterangan,
        "jumlah": jumlah,
        "harga_satuan": harga,
        "subtotal": jumlah * harga
    })
    # Recalculate totals
    billing.grand_total = sum(item.subtotal for item in billing.items) + billing.total_registrasi
    billing.save(ignore_permissions=True)
```

### 5.2 Komunikasi Berbasis Event (`hooks.py`)

```python
# khanza_rs/hooks.py

app_name = "khanza_rs"
app_title = "SIMRS Khanza"
app_publisher = "Your Organization"
app_description = "Sistem Informasi Manajemen Rumah Sakit — Modular Monolith (Ported from Khanza Java)"

# === EVENT-DRIVEN COMMUNICATION ===
doc_events = {
    # Saat registrasi di-submit → buat billing awal
    "Registrasi Pasien": {
        "on_submit": "khanza_rs.keuangan.api.create_billing_rawat_jalan",
    },
    # Saat resep obat di-submit → tambahkan ke billing
    "Resep Obat": {
        "on_submit": "khanza_rs.keuangan.api.add_resep_to_billing",
    },
    # Saat pembayaran selesai → update status registrasi
    "Pembayaran Pasien": {
        "on_submit": "khanza_rs.pasien_core.api.update_status_registrasi_lunas",
    }
}

# === FIXTURES ===
fixtures = [
    {"dt": "Cara Bayar", "filters": [["module", "=", "Pasien Core"]]},
    {"dt": "Poliklinik", "filters": [["module", "=", "Pasien Core"]]},
]

# === SCHEDULED JOBS (future) ===
# scheduler_events = {
#     "cron": {
#         "0 */4 * * *": [  # Setiap 4 jam
#             "khanza_rs.bridging.api.sync_satusehat_encounters"
#         ]
#     }
# }
```

### 5.3 Larangan Teknis (Anti-Patterns)

| ❌ DILARANG | ✅ YANG BENAR |
|-------------|--------------|
| `frappe.db.sql("SELECT * FROM tabPasien JOIN ...")` di modul keuangan | Panggil `pasien_core.api.get_pasien_info()` |
| `frappe.get_doc("Pasien", no_rkm)` di modul farmasi | Panggil `pasien_core.api.get_pasien_info()` |
| `frappe.set_value("Billing Pasien", ...)` di modul farmasi | Panggil `keuangan.api.tambah_item_billing()` |
| Link Field `registrasi` → `Registrasi Pasien` di Billing | Gunakan field type `Data` menyimpan no_rawat |

---

## 6. Struktur Data (DocType Design) — Fase 1

### 6.1 Diagram Relasi (Intra-Modul & Inter-Modul)

```
┌──────────────── Pasien Core ──────────────────┐
│                                                │
│  Pasien ──► Registrasi Pasien                  │
│                 │                              │
│             Poliklinik                         │
│             Bangsal ──► Kamar                  │
│             Cara Bayar                         │
└────────────────────────────────────────────────┘
         │ (api.py: get_pasien_info)
         ▼
┌────────────── Farmasi ────────────────────────┐
│                                                │
│  Obat                                          │
│  Resep Obat ──► Resep Obat Item               │
│  Pemberian Obat                                │
│  Stok Obat                                     │
└────────────────────────────────────────────────┘
         │ (hooks.py: on_submit event)
         ▼
┌────────────── Keuangan ───────────────────────┐
│                                                │
│  Billing Pasien ──► Billing Item               │
│  Pembayaran Pasien                             │
│  Tarif Tindakan                                │
│  Jasa Medis                                    │
└────────────────────────────────────────────────┘
```

---

## 7. Alur Kerja Utama (User Flow)

### 7.1 Flow Pendaftaran Pasien Baru

```
1. Petugas loket membuka Desk → Pasien Core Workspace
   └─ Klik "Pasien Baru"
   └─ Isi data: Nama, NIK, TTL, Alamat, No BPJS (opsional)
   └─ Submit → Pasien tersimpan, no_rkm_medis auto-generate
   
2. Petugas loket membuat Registrasi Pasien
   └─ Pilih pasien (autocomplete by nama/no_rkm/no_ktp)
   └─ Pilih Poli tujuan, Dokter, Cara Bayar
   └─ Submit → status "Belum"
   └─ hooks.py memicu keuangan.api.create_billing_rawat_jalan()
   └─ Billing Pasien otomatis terbuat dengan biaya registrasi
```

### 7.2 Flow Pemeriksaan & Peresepan (Fase 2, illustrative)

```
1. Dokter membuka Desk → Rawat Jalan Workspace
   └─ Melihat daftar pasien yang sudah daftar hari ini
   └─ Klik pasien → Buka Pemeriksaan Rawat Jalan
   
2. Dokter mengisi SOAP (Subjective, Objective, Assessment, Plan)
   └─ Input diagnosa (ICD-10), tindakan, resep
   └─ Submit Pemeriksaan
   
3. Dokter membuat Resep Obat
   └─ Pilih obat, jumlah, aturan pakai
   └─ Submit Resep
   └─ hooks.py memicu keuangan.api.add_resep_to_billing()
   └─ Billing Pasien ter-update dengan biaya obat
   
4. Kasir melihat Billing Pasien
   └─ Grand total sudah terhitung (registrasi + tindakan + obat)
   └─ Kasir input pembayaran → Submit
   └─ hooks.py memicu pasien_core.api.update_status_registrasi_lunas()
```

---

## 8. Kebutuhan Non-Fungsional

### 8.1 Performa & Skalabilitas

| Requirement | Target | Strategi |
|-------------|--------|----------|
| **Registrasi per hari** | 500+ pasien | MariaDB index pada `(tgl_registrasi, kd_poli, stts)` |
| **Response time form** | < 2 detik | Denormalisasi data, avoid cross-module JOIN |
| **Concurrent users** | 50+ simultan | Gunicorn workers, Redis cache |

### 8.2 Keamanan

| Aspek | Implementasi |
|-------|-------------|
| **Akses data pasien** | Role: Registrasi (CRUD Pasien, Registrasi), Dokter (Read Pasien, CRUD Pemeriksaan), Kasir (Read Billing, CRUD Pembayaran) |
| **Audit trail** | Frappe auto Version History pada semua DocType |
| **Data sensitivity** | NIK dan No BPJS hanya visible bagi role tertentu |

### 8.3 UI/UX

| Aspek | Detail |
|-------|--------|
| **Workspace** | 1 Workspace per Module Def (Pasien Core, Farmasi, Keuangan, dll.) |
| **List View** | Pasien: cari by nama/no_rkm/NIK. Registrasi: filter by tanggal, poli, status |
| **Print Format** | Kartu pasien, nota billing, resep obat |

---

## 9. Deployment Plan — wsladvan2

### 9.1 Environment Overview

| Parameter | Value |
|-----------|-------|
| **Host** | wsladvan2 (via `ssh wsladvan2`) |
| **OS** | Debian GNU/Linux 13 (trixie) |
| **RAM** | 7.6 GB |
| **Bench Path** | `/home/budiwiyono/ERPNext-main-live/frappe-bench` |
| **Default Site** | `erpnext.localhost` |
| **Existing Apps** | `frappe`, `erpnext`, `rawatin_backend`, `rawatin_bridge` |

### 9.2 Deployment Steps

```bash
# 1. Masuk ke environment
ssh wsladvan2
cd ~/ERPNext-main-live/frappe-bench

# 2. Buat Custom App
bench new-app khanza_rs
#   - App Title: SIMRS Khanza
#   - App Description: Sistem Informasi Manajemen Rumah Sakit — Modular Monolith
#   - App Publisher: [Your Organization]

# 3. Install App ke site
bench --site erpnext.localhost install-app khanza_rs

# 4. Buat 8 Module Def
for module in "Pasien Core" "Rawat Jalan" "Rawat Inap" "Farmasi" "Penunjang Medis" "Keuangan" "Kepegawaian" "Bridging"; do
  bench --site erpnext.localhost execute \
    "frappe.get_doc({'doctype':'Module Def','module_name':'$module','app_name':'khanza_rs'}).insert()"
done

# 5. Buat DocTypes (via Desk UI atau JSON export)
# — Lihat Section 4 untuk spesifikasi field

# 6. Migrate database
bench --site erpnext.localhost migrate

# 7. Build frontend assets
bench build --app khanza_rs

# 8. Restart
bench restart
```

### 9.3 Strategi Site

| Opsi | Deskripsi | Rekomendasi |
|------|-----------|-------------|
| **A. Site Existing** | Install `khanza_rs` di `erpnext.localhost` | ✅ Untuk development & testing awal |
| **B. Site Baru** | `bench new-site khanza.localhost` | Untuk production / isolasi penuh |

**Rekomendasi:** Mulai dengan **Opsi A** (install di `erpnext.localhost`). Migrasi ke site terpisah saat masuk production.

---

## 10. Fase & Milestone

### Fase 1: Foundation + SatuSehat Mandatory Resources (Minggu 1-6)

**SatuSehat Coverage:** Encounter, Condition, Procedure, Observation TTV, MedicationRequest/Dispense

- [ ] `bench new-app khanza_rs` di wsladvan2
- [ ] Buat 8 Module Def
- [ ] Buat DocType `pasien_core`: Pasien, Registrasi Pasien, Poliklinik, Bangsal, Kamar, Cara Bayar
- [ ] Buat DocType `rawat_jalan`: Pemeriksaan Rawat Jalan, Diagnosa Pasien, Tindakan Rawat Jalan
- [ ] Buat DocType `farmasi`: Obat, Resep Obat, Resep Obat Item, Pemberian Obat
- [ ] Buat DocType `keuangan`: Billing Pasien, Billing Item, Pembayaran Pasien, Tarif Tindakan
- [ ] Implementasi `api.py` untuk semua 4 modul
- [ ] Implementasi `hooks.py` event wiring
- [ ] Workspace: Loket Pendaftaran, Poliklinik Dokter, Farmasi, Kasir
- [ ] Test: full SatuSehat flow: daftar → periksa (TTV + diagnosa) → resep → billing

### Fase 2: SatuSehat Diagnostic & Inpatient (Minggu 7-14)

**SatuSehat Coverage:** ServiceRequest, Specimen, Observation Lab, DiagnosticReport, EpisodeOfCare, AllergyIntolerance, CarePlan

- [ ] Buat DocType `penunjang_medis`: Permintaan Lab, Hasil Lab, Permintaan Radiologi, Hasil Radiologi
- [ ] Buat DocType `rawat_inap`: Rawat Inap Pasien, Mutasi Kamar, Tindakan Rawat Inap
- [ ] Workspace untuk Lab, Radiologi, Bangsal
- [ ] Integration test: full flow rawat inap + lab + radiologi → billing

### Fase 3: SDM, Bridging & SatuSehat Extended (Minggu 15-22)

**SatuSehat Coverage:** Immunization, QuestionnaireResponse

- [ ] Buat DocType `kepegawaian`: Jadwal Dokter, Jadwal Petugas
- [ ] Buat DocType `bridging`: SEP BPJS, Mapping Poli, SatuSehat Log
- [ ] Integrasi API middleware (khanza-satusehat-sync, Hyperswitch)
- [ ] Jasa Medis otomatis

### Fase 4: Go-Live Preparation (Minggu 20+)

- [ ] Script migrasi data dari `sik.sql`
- [ ] Security audit & hardening
- [ ] Print Format: Kartu Pasien, Nota, Resep
- [ ] Training user RS
- [ ] UAT di RS pilot

---

## 11. Risiko & Mitigasi

| # | Risiko | Dampak | Probabilitas | Mitigasi |
|---|--------|--------|-------------|----------|
| 1 | **Feature parity gap** — Khanza punya 1.629 file | Kritis | Tinggi | Prioritas fitur by frekuensi pakai, bukan semua |
| 2 | **Data migration failure** — 1.161 tabel | Kritis | Sedang | Script migrasi per fase, backup berlapis |
| 3 | **User resistance** — Staf RS terbiasa Java | Tinggi | Tinggi | Training intensif, transisi bertahap |
| 4 | **Cross-module coupling creep** | Sedang | Tinggi | Code review: tidak ada direct import lintas modul kecuali via api.py |
| 5 | **Bridging complexity** — BPJS/SatuSehat 486 file | Tinggi | Tinggi | Tetap pakai middleware existing |
| 6 | **Frappe version compatibility** — ERPNext updates | Sedang | Sedang | Pin Frappe version, test sebelum upgrade |

---

## Appendix A: Mapping Tabel `sik.sql` → DocType Frappe (Fase 1)

| Tabel `sik.sql` | DocType Frappe | Module Def |
|------------------|--------------|------------|
| `pasien` | `Pasien` | pasien_core |
| `reg_periksa` | `Registrasi Pasien` | pasien_core |
| `poliklinik` | `Poliklinik` | pasien_core |
| `bangsal` | `Bangsal` | pasien_core |
| `kamar` | `Kamar` | pasien_core |
| `penjab` | `Cara Bayar` | pasien_core |
| `databarang` | `Obat` | farmasi |
| `resep_obat` | `Resep Obat` | farmasi |
| `resep_dokter` | `Resep Obat Item` | farmasi |
| `nota_jalan` | `Billing Pasien` | keuangan |
| `detail_nota_jalan` | `Billing Item` | keuangan |
| `akun_bayar` | `Pembayaran Pasien` | keuangan |
| `jns_perawatan` | `Tarif Tindakan` | keuangan |

## Appendix B: Glossary

| Term | Definisi |
|------|----------|
| **Module Def** | Definisi modul logis di Frappe yang memisahkan bounded context |
| **DocType** | Entitas data di Frappe (setara tabel + UI + controller) |
| **Interface Contract** | Fungsi API publik di `api.py` yang menjadi satu-satunya cara komunikasi lintas modul |
| **hooks.py** | File konfigurasi event routing di Frappe App |
| **Denormalisasi** | Menyalin data dari modul lain agar tidak perlu JOIN saat runtime |
| **no_rawat** | Nomor unik per kunjungan pasien (format: `YYYY/MM/DD/NNNNNN`) |
| **no_rkm_medis** | Nomor rekam medis unik per pasien |
| **BPJS** | Badan Penyelenggara Jaminan Sosial — asuransi kesehatan nasional |
| **SatuSehat** | Platform interoperabilitas kesehatan nasional Kemenkes (FHIR R4) |
| **SEP** | Surat Elegibilitas Peserta BPJS |
