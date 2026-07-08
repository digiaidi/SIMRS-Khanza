# Rekomendasi Revamp Arsitektur SIMRS Khanza

Berdasarkan *pain point* yang telah diidentifikasi (arsitektur *2-tier*, *UI/Database tightly coupled*, *bridging* yang rentan, dan struktur *monolith*), merombak (rewrite) SIMRS Khanza dari awal (**Big Bang Rewrite**) sangat **TIDAK DISARANKAN** karena risiko kegagalan bisnis yang sangat tinggi. Sistem ini sudah memiliki ratusan fitur yang berjalan stabil untuk operasional.

Pendekatan yang paling aman dan modern adalah **Evolusi Bertahap (Strangler Fig Pattern)**. Berikut adalah opsi *revamp* arsitektural yang direkomendasikan:

## 1. Implementasi API Gateway & Middleware untuk Bridging
Alih-alih membiarkan ratusan komputer klien (*desktop app*) menembak API BPJS dan SatuSehat secara langsung, letakkan sebuah lapisan *Middleware* di tengah-tengah.
*   **Cara Kerja:** Klien Khanza hanya bertugas menyimpan data ke database lokal. Sebuah layanan *Middleware* (bisa menggunakan *Node.js/Effect TS*, Java Springboot, atau *Mirth Connect*) berjalan di *background server*. Middleware inilah yang akan bertugas mengambil data tersebut, mengatur antrean (Queue), mengekstrak ke format FHIR, dan melakukan *request* HTTP secara terpusat.
*   **Keuntungan:** 
    *   Satu sumber manajemen Token (tidak ada *race condition*).
    *   Terdapat mekanisme *Rate Limiting* dan *Retry* otomatis jika server Kemenkes/BPJS *down*.
    *   Aplikasi kasir/pendaftaran tidak akan *hang/freeze* menunggu respons jaringan luar.

## 2. Pola Arsitektur Event-Driven (Transactional Outbox)
Ini berhubungan dengan poin pertama. Untuk memisahkan logika utama dari proses *bridging*, gunakan pola **Transactional Outbox**.
*   **Cara Kerja:** Saat dokter mengklik "Simpan Diagnosa", Khanza tidak memanggil API eksternal, melainkan hanya menyimpan data ke tabel `diagnosa` DAN ke sebuah tabel baru bernama `outbox_events` dalam satu transaksi (*atomic commit*).
*   **Keuntungan:** *Event Relay Service* (mirip seperti yang ada di arsitektur `SpacetimePOC3`) akan mendeteksi isi tabel `outbox_events` ini dan memprosesnya secara _Asynchronous_ ke BPJS/SatuSehat. Konsep ini menjamin 100% pengiriman tanpa takut data hilang (*zero data loss*).

## 3. Pemisahan Beban Database (CQRS / Data Lakehouse)
Laporan (*Reporting*) di Khanza sangat banyak dan berat. Mengeksekusi kueri agregasi di database operasional (`sik.sql`) pada jam sibuk akan melumpuhkan sistem.
*   **Cara Kerja:** 
    *   Gunakan mekanisme **Database Replication** (Master-Slave). Aplikasi desktop Khanza (*Read/Write*) diarahkan ke *Master*, sedangkan seluruh permintaan cetak laporan/PDF diarahkan ke database *Slave* (*Read Only*).
    *   **Tingkat Lanjut:** Terapkan konsep *Data Lakehouse* (seperti menggunakan `DuckDB` dan `SQLMesh`). Data dari MySQL ditarik setiap 5 menit ke layer *Bronze/Silver/Gold* untuk kebutuhan Dashboard analitik yang sangat cepat, tanpa membebani database utama.

## 4. Modernisasi Frontend Bertahap (Decoupling)
Jangan menulis ulang aplikasi Desktop *Java Swing* untuk petugas input data, karena kecepatan ketik (*data entry*) pada aplikasi *desktop native* sangat disukai petugas kasir/farmasi.
*   **Fokus Revamp:** Buat *Backend API* baru (*REST/GraphQL*) yang membaca database MySQL Khanza. Gunakan API ini untuk membangun antarmuka web/mobile khusus untuk **Pasien** (Aplikasi Mobile JKN/RS), **Manajemen** (*Dashboard* Eksekutif), dan **Dokter** (*E-Rekam Medis via Tablet*).
*   **Hasil:** Aplikasi *desktop* Java tetap melayani *back-office* dan administrasi berat, sementara *front-office* dan *touchpoint* eksternal menggunakan teknologi web modern (*React/Vue/Expo*).

## 5. Arsitektur Berbasis Plugin untuk Kustomisasi
Untuk mengatasi masalah "Update Hell" (ketika RS mengubah *source code* Khanza lalu kesulitan meng-*update* versi terbaru dari pusat):
*   **Pendekatan:** Jangan sentuh *Core* Khanza. Jika ada fitur unik dari RS (misalnya aturan diskon khusus, atau notifikasi WhatsApp otomatis), tangkap perubahan data dari database (via *Trigger* atau *Binlog/Debezium*) lalu proses di layanan kecil eksternal (*Microservice*).
*   **Hasil:** Instalasi `.jar` utama SIMRS Khanza tetap bersih (*vanilla*) sehingga RS selalu bisa mengunduh dan menimpa dengan pembaruan rilis terbaru Kemenkes/BPJS dari *repository* pusat tanpa bentrok kode.

---

### Kesimpulan Strategi
Revamp terbaik untuk SIMRS Khanza saat ini **bukanlah menulis ulang aplikasinya**, melainkan **membangun Ekosistem Middleware di sekelilingnya**. Biarkan aplikasi *Java Desktop* dan skema database MySQL bertindak sebagai *Legacy Core* yang solid, sementara beban integrasi API, *reporting* analitik, dan *mobile app* ditangani oleh layanan-layanan *Microservices* modern yang membaca dan menulis ke database yang sama.
