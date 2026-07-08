# ATR-005: Strategi Value Added Services Payment Gateway & Auto-Reconciliation di Atas Khanza Legacy

## Status
**Accepted as Strategic Product Direction** (Payung value creation untuk layanan finansial di atas SIMRS Khanza legacy)

## Konteks & Latar Belakang (Context)
Khanza adalah aplikasi legacy yang tetap menjadi *system of record* operasional rumah sakit. Strategi modernisasi tidak dilakukan dengan mengganti Khanza secara besar-besaran, melainkan dengan membangun **aplikasi satelit** yang menambahkan kemampuan baru di sekitar sistem legacy tersebut.

Setelah aplikasi satelit `khanza-satusehat-sync` dibangun untuk domain compliance SATUSEHAT, domain berikutnya yang memiliki dampak bisnis paling langsung adalah **Payment System dan Auto-Reconciliation**.

Masalah pada sistem pembayaran legacy:
1. **Integrasi perbankan point-to-point:** bridging bank di Khanza masih tersebar dan spesifik per bank, misalnya integrasi Mandiri, BJB, Bank Jateng, atau Bank Papua.
2. **Opsi pembayaran pasien terbatas:** QRIS, Virtual Account, e-wallet, dan kanal pembayaran modern belum menjadi flow native yang seragam.
3. **Risiko salah input nominal:** kasir masih dapat mengetik nominal secara manual pada EDC atau kanal pembayaran lain, sehingga terjadi risiko selisih pembayaran.
4. **Rekonsiliasi manual:** proses tutup kasir dan pencocokan mutasi/struk masih memakan waktu dan rawan selisih.
5. **Webhook tidak cocok langsung ke desktop:** Khanza berbasis Java Swing/desktop, sehingga notifikasi pembayaran dari bank/payment aggregator membutuhkan service backend satelit yang selalu hidup.

## Keputusan Arsitektural (Decision)
Kita menetapkan Payment Gateway & Auto-Reconciliation sebagai **Value Added Services** utama di atas SIMRS Khanza legacy.

ATR ini menjadi payung strategi produk dan bisnis. Detail implementasi teknis QRIS MVP dijabarkan pada:

```text
ATR/ATR-008-Hyperswitch-QRIS-Payment-System.md
```

Keputusan utama:

1. **Bangun aplikasi satelit payment, bukan menanam semua logic ke Khanza**
   Khanza tetap menjadi sumber tagihan dan status operasional. Payment orchestration, webhook, idempotency, dan reconciliation dipindahkan ke service satelit.

2. **Adopsi Hyperswitch sebagai payment orchestration layer**
   Kanal pembayaran modern tidak diintegrasikan satu per satu langsung ke Khanza. Hyperswitch dipakai sebagai routing/orchestration layer, sedangkan Bimasakti menjadi connector/payment aggregator awal untuk QRIS.

3. **QRIS menjadi MVP pertama**
   QRIS dipilih sebagai fase awal karena dampak bisnisnya cepat terlihat, cocok untuk rawat jalan, tidak membutuhkan perangkat fisik EDC, dan dapat diuji end-to-end dengan mock/sandbox.

4. **Webhook receiver menjadi fondasi auto-reconciliation**
   Status pembayaran tidak diproses oleh desktop Khanza secara langsung. Webhook diterima oleh service satelit, diverifikasi, dicatat ke audit log, lalu diproses ke reconciliation job.

5. **Auto-reconciliation harus memakai state machine dan audit trail**
   Payment success tidak boleh langsung menjadi SQL update tanpa kontrol. Implementasi wajib memiliki payment request table, payment event table, reconciliation job, retry, DLQ, idempotency key, dan audit log.

6. **EDC/ECR, Virtual Account, refund, dan settlement menjadi fase lanjutan**
   Omnichannel tetap menjadi tujuan, tetapi tidak dikerjakan sekaligus dalam MVP. Roadmap dibuat bertahap agar risiko produksi terkendali.

## Target Value Added Services

### 1. CarePay QRIS
Pembayaran QRIS dinamis berdasarkan tagihan Khanza.

Value:
- Nominal terkunci dari billing.
- Pasien cukup scan QR.
- Kasir tidak mengetik nominal.
- Status pembayaran dapat masuk otomatis.

### 2. Auto-Reconciliation
Webhook `PAID` dari payment gateway memperbarui status pembayaran secara otomatis melalui reconciliation job.

Value:
- Tutup kasir lebih cepat.
- Selisih pembayaran lebih mudah dilacak.
- Finance memiliki audit trail pembayaran.

### 3. Settlement Dashboard
Dashboard untuk finance melihat pembayaran harian, status pending, paid, expired, failed, settlement, dan selisih.

Value:
- Mengurangi rekonsiliasi manual.
- Mempercepat audit internal.
- Membantu klaim dan pelaporan kas.

### 4. Prepaid Payment Link
Payment link untuk DP rawat inap, booking VIP, telemedicine, atau layanan tertentu sebelum pasien datang.

Value:
- Cashflow masuk lebih awal.
- Mengurangi antrean kasir.
- Meningkatkan pengalaman pasien.

### 5. EDC/ECR Integration
Fase lanjutan untuk mengunci nominal langsung ke mesin EDC melalui LAN/serial/ECR protocol.

Value:
- Menghilangkan salah input nominal EDC.
- Menutup celah financial leakage di loket.

## Roadmap Implementasi

### Fase 1 - QRIS MVP
- Jalankan Hyperswitch di environment WSLTP.
- Konfigurasi connector Bimasakti.
- Buat endpoint create QRIS dari billing Khanza.
- Simpan mapping `billing_id` ke `payment_id`.
- Return QR payload ke caller.
- Uji dengan billing mock dan connector mock/sandbox.

### Fase 2 - Webhook & Auto-Reconciliation
- Implement webhook receiver.
- Verifikasi signature.
- Simpan raw payment event.
- Jalankan state machine payment.
- Implement reconciliation job ke tabel Khanza target.
- Tambahkan retry dan DLQ.

### Fase 3 - Finance Dashboard
- Daftar transaksi QRIS.
- Filter by tanggal/kasir/poli/status.
- Retry reconciliation.
- Export settlement.
- Audit trail per payment.

### Fase 4 - Omnichannel Expansion
- Virtual Account.
- EDC/ECR.
- Refund/void.
- Settlement reconciliation.
- Multi-RS atau multi-facility configuration.

## Model Komersial

Payment System dapat dikemas sebagai produk **CarePay** di atas ekosistem Khanza:

1. **Setup fee**
   Biaya implementasi awal, mapping schema Khanza, konfigurasi connector, dan training kasir/finance.

2. **Managed service fee**
   Biaya bulanan untuk monitoring, support, update connector, dan maintenance dashboard.

3. **MDR / fee sharing**
   Jika model bisnis dan izin kerja sama mendukung, anak perusahaan fintech dapat mengambil margin dari transaksi QRIS/VA/EDC. Angka MDR harus divalidasi secara legal dan komersial sebelum dimasukkan ke proposal final.

4. **Premium finance analytics**
   Dashboard settlement, reconciliation aging, payment failure analysis, dan revenue leakage report dapat menjadi paket premium.

## Konsekuensi (Consequences)

### Positif
- **Direct income impact:** payment system menyentuh arus kas langsung, bukan hanya efisiensi teknis.
- **Zero nominal typo:** nominal pembayaran berasal dari tagihan Khanza.
- **Auto-reconciliation:** status lunas dapat diproses otomatis dari webhook.
- **Modernisasi tanpa rewrite:** Khanza legacy tetap berjalan, value baru ditambahkan lewat satelit.
- **Productizable:** solusi dapat dijual sebagai value added services untuk banyak RS pengguna Khanza.
- **Foundation fintech:** membuka jalan untuk QRIS, VA, EDC, payment link, settlement, dan revenue analytics.

### Negatif / Trade-off
- Ada service finansial baru yang harus dimonitor 24/7.
- Membutuhkan secret management dan audit trail yang matang.
- Integrasi ke schema billing Khanza harus divalidasi per instalasi RS.
- Otomasi pembayaran membutuhkan kontrol idempotency dan rollback policy.
- MDR/fee sharing harus divalidasi dengan aspek legal, perizinan, dan perjanjian aggregator.

## Risiko yang Harus Dikendalikan
1. **Duplicate payment**
   Harus dicegah dengan idempotency key per billing dan amount.

2. **Webhook palsu atau replay**
   Wajib memakai signature verification, timestamp check, dan event deduplication.

3. **Billing berubah setelah QRIS dibuat**
   Perlu policy expire/cancel/recreate QRIS.

4. **Reconciliation gagal**
   Status payment harus tetap tersimpan dan reconciliation masuk retry queue/DLQ.

5. **Schema Khanza berbeda antar RS**
   Perlu preflight checker dan adapter per instalasi.

## Hubungan dengan ATR Lain
- `ATR-008 Hyperswitch QRIS Payment System` menjabarkan implementasi teknis MVP QRIS di atas Hyperswitch dan Bimasakti.
- `ATR-007 Khanza SatuSehat Sync Satellite` membuktikan pola aplikasi satelit sudah berhasil diterapkan untuk domain SATUSEHAT.
- `ATR-003 Data Lakehouse Dashboard` dapat menjadi jalur analitik untuk settlement dan revenue dashboard.

## Rekomendasi
ATR-005 tetap dipertahankan sebagai **dokumen payung value creation** untuk Payment System di atas Khanza legacy. Implementasi harus dimulai sempit dari **QRIS dynamic payment + webhook paid + reconciliation ke billing mock**, lalu diperluas bertahap ke VA, EDC/ECR, refund, settlement, dan finance analytics.
