# ATR-003: Data Lakehouse untuk Dashboard Eksekutif & RCM

## Status
**Proposed** (Prioritas Eksekusi Ketiga - Optimasi Analitik)

## Konteks & Latar Belakang (Context)
Manajemen RS (Direksi, Keuangan) membutuhkan informasi *real-time* tentang profitabilitas pasien, kesesuaian antara biaya rill pengobatan vs tarif paket INA-CBG BPJS (*Revenue Cycle Management* / RCM). Saat ini, database tunggal Khanza (`sik.sql`) menangani seluruh beban kerja: *Read/Write* transaksi, rekam medis harian, hingga kalkulasi *query JOIN* besar-besaran untuk cetak laporan manajemen. Eksekusi laporan sering membuat database melambat (*table lock*).

## Keputusan Arsitektural (Decision)
Sistem analitik dan pelaporan yang berat akan **dipisahkan sepenuhnya dari database operasional**.
1. Menerapkan skema replikasi database (*Read Replica*) atau *Change Data Capture* (CDC menggunakan Debezium).
2. Data operasional MySQL akan disedot (diekstrak) secara berkala (misal: setiap 5 menit) ke dalam sistem **Data Lakehouse** (misalnya menggunakan format *Parquet* dengan eksekutor *DuckDB / SQLMesh*).
3. **Untuk data rekam medis berstandar Kemenkes (SatuSehat):** Kita akan mengadopsi standar **SQL-on-FHIR** menggunakan alat **`flatquack`**. Alat ini bertugas mengekstrak JSON FHIR (yang bersarang dan rumit) menjadi *flat tables* (Parquet/CSV) menggunakan DuckDB secara kilat, sehingga data medis siap dianalisis di *Lakehouse* tanpa perlu *parsing* manual.
4. Dasbor eksekutif berbasis web akan menembak langsung ke *Lakehouse* tersebut, bukan ke MySQL Khanza.

## Konsekuensi (Consequences)
* **Positif (+):** Performa operasional harian RS (Pendaftaran, Apotek, Rawat Inap) tidak akan pernah terganggu lagi meskipun ratusan laporan berat sedang di-*generate*. Direksi mendapatkan visualisasi data margin laba rugi (*loss/profit*) per tindakan medis secara cepat (*Analytical Speed*).
* **Negatif (-):** Data di dasbor manajemen mungkin mengalami keterlambatan (*delay*) beberapa menit (*Near Real-time* alih-alih *absolute real-time*). Membutuhkan infrastruktur server *storage* tambahan untuk menjalankan proses *pipeline* ETL (*Extract, Transform, Load*).

---

# Perdalam lagi ide ini, apakah ada sinergi dengan ~/OPREK/SpacetimePOC3/PRD/ADR-007-payment-integration.md ?

5:23 PM

Sinerginya **LUAR BIASA MASIF**! Anda benar-benar menangkap benang merah dari ekosistem yang sedang kita bangun ini.

Saya baru saja memperbarui **

![](vscode-file://vscode-app/Applications/Antigravity%20IDE.app/Contents/Resources/app/extensions/theme-symbols/src/icons/files/markdown.svg)

ATR-005-Payment-Gateway-Omnichannel.md** untuk memasukkan secara eksplisit integrasi dengan **SpacetimePOC3**.

Jika kita membedah `ADR-007-payment-integration.md` milik SpacetimePOC3, kita menemukan sebuah modul **Payment Gateway** yang sudah matang, berbasis **Effect TS**, dan yang paling penting: **Sudah memenuhi standar BI SNAP (Standard National API Payment)** via Bimasakti.

Berikut adalah pendalaman mengapa sinergi ini sangat _powerful_ jika kita pasangkan dengan Khanza:

### 1. Tidak Perlu Menulis Kode Kriptografi di Java (Plug & Play)

- **Masalah Khanza:** Mengimplementasikan standar BI SNAP (seperti _Asymmetric Auth RSA-SHA256_ dan _Symmetric Payload Signature_) langsung di dalam Java Swing Khanza sangatlah rumit dan berisiko tinggi.
- **Sinergi SpacetimePOC3:** Modul `BimasaktiSignature.ts` dan `PaymentGateway.ts` di SpacetimePOC3 sudah menangani semua kerumitan kriptografi ini secara _native_. Kita cukup men- _deploy_ _server_ SpacetimePOC3 (Bun HTTP API di _port_ 4100) berdampingan dengan server Khanza.

### 2. Fitur "Simulation Ledger" Menyelamatkan Uji Coba RS

- Di ADR-007 SpacetimePOC3, terdapat fitur `Simulation Ledger` dan `MockPaymentGatewayLive`.
- Artinya, saat tim IT Rumah Sakit melakukan demonstrasi ke Direksi atau melatih petugas Kasir, mereka bisa menggunakan "Uang Mainan" / Simulasi. Sistem akan merespons kode QRIS menjadi _Pending_, lalu otomatis berubah menjadi _Paid_ dalam 10 detik. Ini sangat mustahil dilakukan jika memprogram API perbankan konvensional langsung di Khanza.

### 3. Penyelamat Sistem "Auto-Reconciliation" (Webhook)

- Seperti yang dibahas sebelumnya, aplikasi _desktop_ Khanza tidak bisa menerima "Tendangan Balik" (_Webhook_) dari Bank.
- Sinerginya: File `index.ts` milik SpacetimePOC3 memiliki _endpoint_ `/webhooks/bimasakti/qris`. Saat pasien membayar dari rumah, Bimasakti akan menembak _endpoint_ Spacetime ini.
- Begitu Spacetime menerima sinyal pembayaran sukses, _Effect TS_ di Spacetime (yang punya _error handling_ sangat solid) akan mengeksekusi kueri `UPDATE tagihan SET status='PAID'` langsung menembus ke dalam _database_ `sik.sql` MySQL Khanza. Layar kasir akan otomatis berkedip _Lunas_!

**Kesimpulan:** Kita sama sekali **tidak perlu membangun ulang Payment Gateway untuk Khanza**. Kita cukup meminjam (_reuse_) arsitektur _Microservice_ Payment milik **SpacetimePOC3**, meletakkannya sebagai "Satpam Pembayaran" di depan pintu Khanza, dan membiarkan Spacetime yang mengurus semua urusan dengan Bank Indonesia dan Bimasakti!