# PRD-002: SIMRS Khanza Frappe Modular Monolith — Fase 2
## Rawat Inap, Penunjang Medis (Lab & Radiologi), Diet Gizi, & Asesmen RME Dinamis

Dokumen Persyaratan Produk (PRD) ini mendefinisikan kelanjutan porting SIMRS Khanza dari Java Swing ke **Frappe Modular Monolith (`khanza_rs`)** untuk **Fase 2**. Fase ini berfokus pada digitalisasi pelayanan rawat inap, penunjang klinis (Laboratorium & Radiologi), integrasi makanan dapur gizi, serta otomasi ratusan formulir Asesmen Rekam Medis Elektronik (RME) menggunakan arsitektur JSON dinamis.

---

## 1. Lingkup Pengerjaan & Prioritas Fase 2

Fase 2 berfokus pada integrasi pelayanan klinis penunjang dan rawat inap dengan SatuSehat FHIR resource level lanjutan:

| Modul (Bounded Context) | DocType Utama | Integrasi SatuSehat FHIR | Keterangan |
|---|---|---|---|
| **Rawat Inap** (`rawat_inap`) | `Rawat Inap Pasien`, `Mutasi Kamar`, `Tindakan Rawat Inap` | `Encounter` (Ranap), `Location` (Bed/Bangsal) | Manajemen siklus inap pasien, pemindahan bangsal, dan tindakan medis ranap. |
| **Penunjang Medis** (`penunjang_medis`) | `Permintaan Lab`, `Hasil Lab`, `Permintaan Radiologi`, `Hasil Radiologi` | `DiagnosticReport`, `Observation` (Lab/Rad) | Pemesanan dan pengisian hasil penunjang medis terintegrasi. |
| **Diet Gizi** (`rawat_inap`) | `Diet Gizi Pasien` | - (Operasional Lokal) | Sinkronisasi instruksi diet dari dokter ranap ke dapur gizi. |
| **RME Spesifik** (`rawat_jalan`/`rawat_inap`) | `Asesmen RME Spesifik` | `ClinicalImpression`, `Condition` (Kustom) | Template engine dinamis berbasis JSON untuk ratusan form spesialis. |

---

## 2. Batas Domain & Prinsip Modular Monolith (Fase 2)

Sesuai dengan prinsip arsitektur di [PRD-001](file:///Users/user/OPREK2/simrs-khanza/PRD/PRD-001-SIMRS-Khanza-Frappe-Modular-Monolith.md), interaksi antar-modul di Fase 2 diatur secara ketat:

* **Pemesanan Penunjang**: Modul `rawat_jalan` / `rawat_inap` membuat pesanan di `Permintaan Lab` menggunakan API kontrak `penunjang_medis/api.py`. Modul klinis dilarang menulis langsung ke tabel `Hasil Lab`.
* **Ketersediaan Kamar**: Modul pendaftaran/registrasi di `pasien_core` mengecek ketersediaan bed kosong di rawat inap melalui API kontrak `rawat_inap/api.py`.
* **Diet Gizi Asinkron**: Ketika ada pasien check-in rawat inap atau terjadi perubahan diet oleh dokter, modul `rawat_inap` menerbitkan event `rawat_inap.patient_diet_updated`. Modul Dapur Gizi mendengarkan (*subscribe*) event tersebut untuk memperbarui jadwal menu makanan secara otomatis.

---

## 3. Spesifikasi Detail Skema Data (DocType Design)

### 3.1 Modul: Rawat Inap (`rawat_inap`)

#### 3.1.1 DocType: `Rawat Inap Pasien` (Sesi Rawat Inap)
Memetakan tabel `kamar_inap` di `sik.sql`. Menyimpan sesi inap pasien dari masuk hingga keluar.

| Field | Type | Deskripsi |
|-------|------|-----------|
| `no_rawat` | Link → `Registrasi Pasien` | ID Registrasi berobat |
| `tgl_masuk` | Date | Tanggal masuk rawat inap |
| `jam_masuk` | Time | Jam masuk rawat inap |
| `kd_kamar` | Link → `Kamar` | Referensi kamar tempat pasien dirawat |
| `tarif_kamar` | Currency | Biaya per hari (di-fetch dari Kamar) |
| `diagnosa_awal` | Data | Diagnosa masuk (ICD-10) |
| `tgl_keluar` | Date | Tanggal keluar rawat inap (null jika masih inap) |
| `jam_keluar` | Time | Jam keluar rawat inap |
| `stts_pulang` | Select | `Sembuh` \| `Membaik` \| `Rujuk` \| `Meninggal` \| `APS` (Atas Permintaan Sendiri) |
| `total_hari` | Read Only (Int) | Kalkulasi otomatis dari tgl_masuk ke tgl_keluar |

#### 3.1.2 DocType: `Mutasi Kamar` (Pindah Kamar/Ruangan)
Memetakan riwayat perpindahan kamar pasien selama masa perawatan inap.

| Field | Type | Deskripsi |
|-------|------|-----------|
| `no_rawat` | Link → `Rawat Inap Pasien` | Referensi sesi inap aktif |
| `kamar_lama` | Link → `Kamar` | Kamar asal |
| `kamar_baru` | Link → `Kamar` | Kamar tujuan |
| `tgl_pindah` | Date | Tanggal perpindahan |
| `jam_pindah` | Time | Jam perpindahan |
| `biaya_kamar_lama` | Currency | Tarif akumulasi kamar lama yang harus dibayar |

---

### 3.2 Modul: Penunjang Medis (`penunjang_medis`)

#### 3.2.1 DocType: `Permintaan Lab`
Memetakan tabel `permintaan_lab`. Diisi oleh dokter pengirim.

| Field | Type | Deskripsi |
|-------|------|-----------|
| `no_permintaan` | Data (Primary) | Nomor transaksi permintaan (Auto) |
| `no_rawat` | Data | ID Registrasi pasien |
| `tgl_permintaan` | Date | Tanggal permintaan dibuat |
| `jam_permintaan` | Time | Jam permintaan dibuat |
| `dokter_pengirim` | Data | Nama/ID Dokter pengirim |
| `klinis_informasi` | Small Text | Catatan klinis/indikasi pemeriksaan |
| `status` | Select | `Pending` \| `Diproses` \| `Selesai` |

#### 3.2.2 DocType: `Hasil Lab`
Memetakan pemeriksaan hasil laboratorium. **SatuSehat: DiagnosticReport & Observation**.

| Field | Type | Deskripsi |
|-------|------|-----------|
| `no_hasil` | Data (Primary) | Nomor hasil pemeriksaan (Auto) |
| `no_permintaan` | Link → `Permintaan Lab` | Hubungan ke order asal |
| `tgl_periksa` | Date | Tanggal pemeriksaan sampel |
| `jam_periksa` | Time | Jam pemeriksaan sampel |
| `petugas_lab` | Data | NIP/Nama analis lab |
| `status_hasil` | Select | `Final` \| `Amended` \| `Preliminary` |
| `detail_hasil` | Table (Child) | Rincian parameter uji lab (Link ke `Hasil Lab Detail`) |

#### 3.2.3 Child Table: `Hasil Lab Detail`

| Field | Type | Deskripsi |
|-------|------|-----------|
| `nama_pemeriksaan` | Data | Nama parameter uji (misal: "Hemoglobin") |
| `nilai_hasil` | Data | Nilai hasil pengujian (misal: "13.2") |
| `satuan` | Data | Satuan ukur (misal: "g/dL") |
| `nilai_rujukan` | Data | Nilai normal/rujukan (misal: "12.0 - 16.0") |
| `keterangan` | Data | Keterangan tambahan (misal: "Normal") |

---

### 3.3 RME Dinamis: `Asesmen RME Spesifik` (`rawat_jalan` / `rawat_inap`)

Untuk mencegah ledakan ratusan DocType formulir spesialisasi klinis dari Java Khanza, kita menggunakan **Dynamic Document Schema** dengan format data **JSON**:

| Field | Type | Deskripsi |
|-------|------|-----------|
| `no_rawat` | Data | ID Registrasi |
| `tipe_asesmen` | Select | `Anak` \| `Kandungan` \| `Mata` \| `THT` \| `Jiwa` \| `Gigi` \| `Fisioterapi` |
| `tgl_asesmen` | Date | Tanggal asesmen |
| `pemeriksa` | Data | Nama Dokter/Perawat pemeriksa |
| `data_dinamis` | Code (JSON) | Menyimpan seluruh pasangan key-value kustom untuk formulir spesifik |

**Contoh payload simpan pada `data_dinamis` untuk `tipe_asesmen: Kandungan`:**
```json
{
  "hpht": "2026-01-15",
  "hpl": "2026-10-22",
  "gravida": 2,
  "partus": 1,
  "abortus": 0,
  "tinggi_fundus": "28 cm",
  "djj": "140x/menit",
  "posisi_janin": "Kepala/Presentasi U"
}
```
*Frontend Rendering:* Template HTML dinamis di Frappe Page/Form akan membaca schema JSON di atas dan me-render form input kustom secara dinamis sesuai pilihan `tipe_asesmen`.

---

## 4. Rencana Kerja & Prioritas Integrasi (Fase 2)

### Sprint 1: Rawat Inap & Bed Management (Kamar)
* Buat DocType `Rawat Inap Pasien` dan `Mutasi Kamar`.
* Implementasikan logic validasi di `rawat_inap/api.py` untuk mengunci status Kamar/Bed menjadi **Terisi** jika pasien check-in, dan melepaskannya kembali (**Kosong**) saat pasien check-out/pulang.

### Sprint 2: Penunjang Medis (Lab & Rad)
* Buat DocType `Permintaan Lab`, `Hasil Lab`, dan `Hasil Lab Detail`.
* Buat DocType serupa untuk Radiologi (`Permintaan Radiologi`, `Hasil Radiologi`).
* Hubungkan event `hasil_lab_saved` ke modul `bridging` untuk log SatuSehat FHIR DiagnosticReport.

### Sprint 3: RME Dinamis & Dapur Gizi
* Bangun JSON parser dan form renderer untuk `Asesmen RME Spesifik`.
* Implementasikan DocType `Diet Gizi Pasien` dan pasang hooks event sinkronisasi data diet ke Dapur Gizi secara asinkron.
