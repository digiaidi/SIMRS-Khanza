# Cek List Porting SIMRS Khanza ke Frappe Modular Monolith

Dokumen ini melacak kemajuan porting struktur database dan kapabilitas dari SIMRS Khanza Java Desktop (`sik.sql`) ke backend **Frappe Modular Monolith (`khanza_rs`)**.

---

## 1. Pemetaan Tabel Utama (Fase 1)

| No | Tabel Asli MySQL (`sik.sql`) | Nama DocType Baru (Frappe) | Modul (Bounded Context) | Status Porting | Keterangan |
|----|----------------------------|----------------------------|-------------------------|----------------|------------|
| 1  | `pasien` | `Pasien` | Pasien Core | 🟢 **COMPLETED** | Struktur kolom & enum dipetakan penuh |
| 2  | `reg_periksa` | `Registrasi Pasien` | Pasien Core | 🟢 **COMPLETED** | Berelasi ke Pasien & Poliklinik via Link |
| 3  | `poliklinik` | `Poliklinik` | Pasien Core | 🟢 **COMPLETED** | Master data klinik & biaya reg |
| 4  | `pemeriksaan_ralan` | `Pemeriksaan Rawat Jalan` | Rawat Jalan | 🟡 **IN PROGRESS** | Menyimpan TTV & SOAP Dokter |
| 5  | `diagnosa_pasien` | `Diagnosa Pasien` | Rawat Jalan | 🟡 **IN PROGRESS** | Tabel ICD-10 untuk diagnosa penyakit |
| 6  | `rawat_jl_dr` / `rawat_jl_pr` | `Tindakan Rawat Jalan` | Rawat Jalan | 🟡 **IN PROGRESS** | Layanan tindakan medis ralan |
| 7  | `databarang` | `Obat` | Farmasi | 🟡 **IN PROGRESS** | Master data obat, alkes, & inventaris |
| 8  | `resep_obat` / `resep_dokter` | `Resep Obat` | Farmasi | 🟡 **IN PROGRESS** | Transaksi resep & item obat |
| 9  | `nota_jalan` | `Billing Pasien` | Keuangan | 🟡 **IN PROGRESS** | Akumulator tagihan & kasir ralan |

---

## 2. Rincian Pemetaan Kolom (Presisi 100%)

### A. DocType: `Pasien` (Tabel asal: `pasien`)
Berikut adalah pemetaan kolom secara presisi dari skema MySQL asli ke tipe data Frappe DocType:

* **Tipe Penamaan (Naming):** `field:no_rkm_medis` (Menggunakan no rekam medis asli)

| Kolom Asli (`sik.sql`) | Fieldname Frappe | Tipe Data Frappe | Opsi / Enum / Keterangan | Status |
|-----------------------|------------------|------------------|--------------------------|--------|
| `no_rkm_medis` | `no_rkm_medis` | Data (Unique) | Primary Key (15 karakter) | 🟢 |
| `nm_pasien` | `nm_pasien` | Data (Required) | Nama pasien (40 karakter) | 🟢 |
| `no_ktp` | `no_ktp` | Data (Unique) | NIK untuk bridging SatuSehat | 🟢 |
| `jk` | `jk` | Select | `L` (Laki-laki), `P` (Perempuan) | 🟢 |
| `tmp_lahir` | `tmp_lahir` | Data | Tempat lahir | 🟢 |
| `tgl_lahir` | `tgl_lahir` | Date | Tanggal lahir | 🟢 |
| `nm_ibu` | `nm_ibu` | Data | Nama ibu kandung | 🟢 |
| `alamat` | `alamat` | Small Text | Alamat tinggal | 🟢 |
| `gol_darah` | `gol_darah` | Select | `-`, `A`, `B`, `AB`, `O` | 🟢 |
| `pekerjaan` | `pekerjaan` | Data | Pekerjaan pasien | 🟢 |
| `stts_nikah` | `stts_nikah` | Select | `BELUM MENIKAH`, `MENIKAH`, `JANDA`, `DUDHA`, `JOMBLO` | 🟢 |
| `agama` | `agama` | Data | Agama | 🟢 |
| `tgl_daftar` | `tgl_daftar` | Date | Tanggal registrasi pertama | 🟢 |
| `no_tlp` | `no_tlp` | Data | No telepon | 🟢 |
| `pnd` | `pnd` | Select | `TS`, `TK`, `SD`, `SMP`, `SMA`, `D1`, `D2`, `D3`, `D4`, `S1`, `S2`, `S3`, `-` | 🟢 |
| `no_peserta` | `no_peserta` | Data | Nomor BPJS Kesehatan | 🟢 |

---

### B. DocType: `Registrasi Pasien` (Tabel asal: `reg_periksa`)
* **Tipe Penamaan (Naming):** `field:no_rawat` (Format: `YYYY/MM/DD/XXXXXX`)

| Kolom Asli (`sik.sql`) | Fieldname Frappe | Tipe Data Frappe | Opsi / Link / Keterangan | Status |
|-----------------------|------------------|------------------|--------------------------|--------|
| `no_rawat` | `no_rawat` | Data (Unique) | Format nomor rawat transaksi | 🟢 |
| `no_rkm_medis` | `no_rkm_medis` | Link | Relasi ke DocType `Pasien` | 🟢 |
| `nm_pasien` | `nm_pasien` | Data (Read Only) | Auto fetch dari `no_rkm_medis.nm_pasien` | 🟢 |
| `tgl_registrasi` | `tgl_registrasi` | Date | Tanggal berobat | 🟢 |
| `jam_reg` | `jam_reg` | Time | Jam registrasi | 🟢 |
| `kd_poli` | `kd_poli` | Link | Relasi ke DocType `Poliklinik` | 🟢 |
| `nm_poli` | `nm_poli` | Data (Read Only) | Auto fetch dari `kd_poli.nm_poli` | 🟢 |
| `kd_dokter` | `kd_dokter` | Data | Kode dokter penanggung jawab | 🟢 |
| `nm_dokter` | `nm_dokter` | Data | Nama dokter | 🟢 |
| `p_jawab` | `p_jawab` | Select | `Umum`, `BPJS`, `Asuransi` | 🟢 |
| `biaya_reg` | `biaya_reg` | Currency | Auto fetch dari `kd_poli.registrasi` | 🟢 |
| `stts` | `stts` | Select | `Belum` (belum dilayani), `Sudah`, `Batal`, `Dirujuk` | 🟢 |
| `status_lanjut` | `status_lanjut` | Select | `Ralan` (Rawat Jalan), `Ranap` (Rawat Inap) | 🟢 |

---

## 3. Langkah Pelacakan & Rencana Aksi Selanjutnya
- [x] Inisialisasi 8 Bounded Context Module Def
- [x] Struktur berkas dan logika `api.py` contract interface
- [x] Porting DocType `Pasien` (JSON + Python Class)
- [x] Porting DocType `Poliklinik` (JSON + Python Class)
- [x] Porting DocType `Registrasi Pasien` (JSON + Python Class)
- [ ] Push update DocType ke server `wsladvan2`
- [ ] Lakukan migrasi database (`bench migrate`) di server
- [ ] Verifikasi penampakan form DocType di browser Desk UI
- [ ] Lanjutkan porting Modul `rawat_jalan` (`pemeriksaan_ralan`)
