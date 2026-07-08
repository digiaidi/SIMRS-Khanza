# ATR-001: Implementasi Middleware Antrean Omnichannel & Aplikasi Pasien

## Status
**Proposed** (Prioritas Eksekusi Utama - Quick Win)

## Konteks & Latar Belakang (Context)
Saat ini, proses pendaftaran pasien di SIMRS Khanza sangat bergantung pada kehadiran fisik pasien di loket pendaftaran atau mesin anjungan lokal. Hal ini sering memicu antrean panjang di pagi hari yang sangat merusak reputasi (Brand) Rumah Sakit. Di sisi lain, Kemenkes dan BPJS menuntut RS untuk mengakomodasi antrean *online* melalui aplikasi Mobile JKN secara *real-time*.

## Keputusan Arsitektural (Decision)
Kita memutuskan untuk **TIDAK mengubah / memodifikasi inti aplikasi Java Swing SIMRS Khanza** untuk membangun fitur Mobile App. Sebagai gantinya, kita akan:
1. Membangun sebuah **Middleware / API Gateway Terpisah** (misalnya menggunakan *Node.js* atau *Effect TS*).
2. Middleware ini akan terhubung langsung ke *database* MySQL Khanza secara aman untuk menarik data (Jadwal Dokter, Kuota Poli, dan Data Pasien).
3. Middleware bertugas menyinkronkan data *slot* antrean secara *real-time* dengan *cloud* BPJS (Mobile JKN).
4. Middleware ini akan menyediakan *REST API / GraphQL* yang dapat dikonsumsi oleh **Aplikasi Mobile Pasien RS (Frontend baru berbasis React Native/Web)**.

## Konsekuensi (Consequences)
* **Positif (+):** RS memiliki aplikasi pendaftaran mandiri yang canggih tanpa merusak kestabilan operasional *back-office* Khanza. Beban loket menurun drastis, pasien senang (Brand naik), dan RS bisa mengambil DP pembayaran (*Virtual Account*) di awal (Income naik).
* **Negatif (-):** Membutuhkan *resource* tambahan berupa tim *developer* (untuk mendevelop API Middleware dan Frontend Mobile App), serta server *hosting/cloud* baru khusus untuk menampung *traffic* dari publik (agar tidak langsung menyerang IP lokal RS).
