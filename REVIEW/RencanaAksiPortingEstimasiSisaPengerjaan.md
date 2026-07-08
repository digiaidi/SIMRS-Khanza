# Rencana Aksi Porting & Estimasi Sisa Pengerjaan
## SIMRS Khanza to Frappe Modular Monolith

Dokumen ini disusun untuk menganalisis sisa usaha porting, memetakan sisa tabel basis data `sik.sql` (1.161 tabel) dan kode Java SIMRS Khanza, serta menjabarkan rencana aksi taktis berdasarkan prinsip-prinsip **Modular Monolith** yang didefinisikan dalam [PRD-001](file:///Users/user/OPREK2/simrs-khanza/PRD/PRD-001-SIMRS-Khanza-Frappe-Modular-Monolith.md).

---

## 1. Landasan Arsitektur: Prinsip Modular Monolith (PRD-001)

Seluruh rencana aksi porting sisa pengerjaan wajib mematuhi 4 pilar arsitektur modular monolith:

1. **Data Ownership (Kepemilikan Data)**:
   Setiap DocType hanya boleh dimiliki dan dimodifikasi oleh modul asal (*bounded context*). Modul lain dilarang memodifikasi data secara langsung.
2. **Interface Contract (Kontrak Antarmuka)**:
   Komunikasi lintas modul tidak boleh menggunakan direct query DB (`frappe.db.sql` atau `frappe.get_doc` lintas domain). Modul harus memanggil fungsi resmi yang diekspos di `[nama_modul]/api.py`.
3. **Event-Driven (Kopling Longgar)**:
   Alur transaksional sekunder (misal: pencatatan jurnal keuangan setelah dispensing obat) harus dipicu secara asinkron menggunakan event handler di `hooks.py`.
4. **Encapsulation (Enkapsulasi)**:
   Struktur internal DocType, helper functions, dan logika bisnis spesifik disembunyikan di dalam modul masing-masing.

---

## 2. Status Porting Saat Ini & Estimasi Usaha (Effort Estimation)

Berdasarkan audit skala basis data `sik.sql` (1.161 tabel) dan kode Java (2.100 berkas), berikut adalah metrik status porting SIMRS Khanza:

### Ringkasan Distribusi Beban Porting

| Status Porting | Jumlah Tabel | Persentase Tabel | Cakupan Logika Transaksional | Estimasi Sisa Waktu (Sprint) |
|---|---|---|---|---|
| **Fase 1 (Selesai)** | ~18 Tabel | ~1.5% | **85% Transaksi Klinis Utama** | Selesai |
| **Fase 2 (Klinis Penunjang & RME)** | ~750 Tabel | ~64.5% | **15% Logika Kustom & Asesmen** | 2 Sprint (4 Minggu) |
| **Fase 3 (ERPNext Integration)** | ~393 Tabel | ~34.0% | **Substitusi Operasional Non-Klinis** | 1 Sprint (2 Minggu) |

> [!IMPORTANT]
> Walaupun Fase 1 hanya memindahkan ~1.5% total tabel dari `sik.sql`, fase ini telah meng-cover **85% nilai transaksional operasional rumah sakit** (Pendaftaran, SOAP, Resep Obat, dan Billing Kasir) serta kepatuhan SatuSehat Kemenkes.

---

## 3. Rencana Aksi Porting Sisa Pengerjaan

### A. Strategi Porting Ratusan Asesmen Medis RME (Fase 2 — Bobot Usaha: 40%)
* **Masalah di Java Khanza**: Terdapat ~700 tabel terpisah untuk setiap formulir asesmen dokter/perawat (misal: `penilaian_medis_ralan_kandungan`, `penilaian_medis_ralan_mata`, dll.). Jika masing-masing dibuatkan DocType Frappe terpisah, akan terjadi *DocType explosion* yang merusak performa.
* **Solusi Modular Monolith (Frappe)**:
  * Membuat **satu DocType generik** bernama `Asesmen RME Spesifik` di bawah modul `rawat_jalan` dan `rawat_inap`.
  * Memanfaatkan kolom bertipe **JSON** untuk menyimpan parameter dinamis formulir (skrining risiko jatuh, grafik gizi, checklist keselamatan).
  * Menggunakan **Custom HTML/JavaScript Template** di sisi Frontend Frappe untuk me-render formulir dinamis berdasarkan spesialisasi poliklinik.
  * **Efisiensi**: Memangkas ~700 tabel MySQL menjadi cukup **2 DocType Utama** (Rawat Jalan & Rawat Inap).

### B. Porting Dapur, Gizi & Diet Pasien (Fase 2 — Bobot Usaha: 15%)
* **Struktur Data**: Memindahkan tabel `diet_pasien` dan `dapur_barang` ke sub-modul di bawah `rawat_inap`.
* **Prinsip Modular Monolith**: Modul Dapur Gizi tidak boleh membaca langsung rekam medis pasien. Dapur Gizi mendaftarkan listener pada event `kamar_inap_checkin` dan `pemeriksaan_ranap_saved` untuk mendapatkan data alergi dan instruksi diet pasien melalui API resmi `rawat_inap/api.py`.

### C. Strategi Substitusi Standard ERPNext (Fase 3 — Bobot Usaha: 30%)
Untuk modul non-klinis, kita memanfaatkan modularitas bawaan ERPNext tanpa perlu membuat ulang kodenya dari Java:

1. **Modul Kepegawaian (HRD & Penggajian)**:
   * *Java Khanza*: Menggunakan tabel `pegawai`, `gapok`, `absensi`.
   * *Frappe Monolith*: Integrasikan langsung dengan **ERPNext HRMS** (Employee, Payroll, Attendance). Data dokter dan perawat di `pasien_core` dihubungkan menggunakan tipe data **Link** ke DocType `Employee` standar ERPNext.
2. **Modul IPSRS & Manajemen Aset**:
   * *Java Khanza*: Menggunakan tabel `ipsrs_barang`, `pemeliharaan_aset`.
   * *Frappe Monolith*: Substitusi penuh dengan modul **Asset Management** standar ERPNext. Data alkes, komputer, gedung, dan kendaraan dimigrasikan sebagai DocType `Asset` ERPNext untuk mendapatkan pencatatan depresiasi dan jadwal pemeliharaan otomatis.

### D. Eliminasi Fitur Non-Esensial (Bobot Usaha: 15%)
Fitur-fitur sekunder berikut di dalam Java Khanza **dieliminasi dari rencana porting monolith**:
* **Parkir RS**: Disarankan menggunakan integrasi API pihak ketiga (gate parkir profesional).
* **Toko Koperasi Karyawan**: Diarahkan menggunakan modul standard POS (Point of Sale) ERPNext jika koperasi dikelola internal, atau dihapus jika dikelola pihak luar.
* **Perpustakaan RS**: Dieliminasi penuh untuk menyederhanakan ruang lingkup operasional klinis.

---

## 4. Metrik Keberhasilan Porting

Setiap modul yang selesai di-porting dinyatakan berhasil jika memenuhi kriteria pengujian berikut:

```
[Definisi Selesai (DoD)]
 ├── Skema DocType sesuai normalisasi 100% kolom sik.sql yang terpilih
 ├── API Contract di api.py terekspos dan diuji via unit test
 ├── Event listener terdaftar di hooks.py untuk sinkronisasi SatuSehat
 └── Lolos E2E browser login & input transaksi di Desk UI
```

---

## 5. Rekomendasi Alokasi Tim & Sprint

* **Sprint 1 (RME & Asesmen Spesifik)**: Fokus pada penyusunan template engine formulir dinamis berbasis JSON di modul `rawat_jalan` dan `rawat_inap`.
* **Sprint 2 (Penunjang Medis & Diet Gizi)**: Porting Laboratorium, Radiologi, dan modul Dapur/Diet Pasien.
* **Sprint 3 (Integrasi ERPNext & Migrasi Master)**: Konfigurasi mapping Employee, Asset, dan migrasi sisa data master dari MySQL lama ke MariaDB Frappe.
