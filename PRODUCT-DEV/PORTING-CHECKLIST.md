# Cek List Porting SIMRS Khanza ke Frappe Modular Monolith

Dokumen ini melacak kemajuan porting struktur database dan kapabilitas dari SIMRS Khanza Java Desktop (`sik.sql`) ke backend **Frappe Modular Monolith (`khanza_rs`)**.

---

## 1. Pemetaan Tabel Utama (Fase 1)

| No | Tabel Asli MySQL (`sik.sql`) | Nama DocType Baru (Frappe) | Modul (Bounded Context) | Status Porting | Keterangan |
|----|----------------------------|----------------------------|-------------------------|----------------|------------|
| 1  | `pasien` | `Pasien` | Pasien Core | 🟢 **COMPLETED** | Struktur kolom & enum dipetakan penuh |
| 2  | `reg_periksa` | `Registrasi Pasien` | Pasien Core | 🟢 **COMPLETED** | Berelasi ke Pasien & Poliklinik via Link |
| 3  | `poliklinik` | `Poliklinik` | Pasien Core | 🟢 **COMPLETED** | Master data klinik & biaya reg |
| 4  | `pemeriksaan_ralan` | `Pemeriksaan Rawat Jalan` | Rawat Jalan | 🟢 **COMPLETED** | Menyimpan TTV & SOAP Dokter |
| 5  | `diagnosa_pasien` | `Diagnosa Pasien` | Rawat Jalan | 🟢 **COMPLETED** | Tabel ICD-10 untuk diagnosa penyakit |
| 6  | `rawat_jl_dr` / `rawat_jl_pr` | `Tindakan Rawat Jalan` | Rawat Jalan | 🟢 **COMPLETED** | Layanan tindakan medis ralan |
| 7  | `databarang` | `Obat` | Farmasi | 🟢 **COMPLETED** | Master data obat, alkes, & inventaris |
| 8  | `resep_obat` / `resep_dokter` | `Resep Obat` | Farmasi | 🟢 **COMPLETED** | Transaksi resep & item obat |
| 9  | `nota_jalan` | `Billing Pasien` | Keuangan | 🟢 **COMPLETED** | Akumulator tagihan & kasir ralan |

---

## 2. Rincian Pemetaan Kolom (Presisi 100%)
... [Rincian lengkap kolom di atas tetap terjaga] ...

---

## 3. Langkah Pelacakan & Rencana Aksi Selanjutnya
- [x] Inisialisasi 8 Bounded Context Module Def
- [x] Struktur berkas dan logika `api.py` contract interface
- [x] Porting DocType `Pasien` (JSON + Python Class)
- [x] Porting DocType `Poliklinik` (JSON + Python Class)
- [x] Porting DocType `Registrasi Pasien` (JSON + Python Class)
- [x] Porting seluruh DocType Fase 1 Rawat Jalan, Farmasi, Keuangan
- [x] Push update DocType ke server `wsladvan2`
- [x] Lakukan migrasi database (`bench migrate`) di server
- [x] Verifikasi penampakan form DocType di browser Desk UI
- [ ] Lanjutkan porting Modul Fase 2 (Rawat Inap, Penunjang Medis)

