# Review Arsitektur & Codebase SIMRS Khanza

Selain dari integrasi pihak ketiga (SatuSehat & BPJS), terdapat beberapa area krusial dari arsitektur dan struktur *codebase* SIMRS Khanza yang menarik untuk dianalisis. Berikut adalah *review* mengenai desain sistem, pemeliharaan (*maintenance*), dan skalabilitasnya:

## 1. Arsitektur "2-Tier" (Client to Database Langsung)
Khanza secara fundamental menggunakan arsitektur **2-Tier Client-Server**. Tidak ada perantara berupa REST API atau *Backend Server*.
- **Cara Kerja:** Aplikasi *desktop* di setiap komputer klien (loket, perawat, apotek) langsung membuka koneksi JDBC (`koneksiDB.java`) ke *port* 3306 server MySQL utama.
- **Kelebihan:** Kecepatan akses data sangat tinggi pada jaringan lokal (LAN) yang stabil. Pemrograman dan pelacakan *bug* lebih mudah karena logika bisnis dan kueri SQL berada di satu tempat.
- **Kekurangan / Risiko:** 
  1. **Keamanan:** Database harus terbuka ke seluruh jaringan lokal, memperbesar risiko *security breach* jika LAN tidak disegmentasi dengan baik.
  2. **Skalabilitas Koneksi:** Database harus menangani ratusan koneksi JDBC yang *idle*. Pada RS skala besar (ribuan klien), ini bisa menyebabkan batas `max_connections` MySQL cepat habis.

## 2. Struktur Codebase & Pola MVC yang Bercampur (Tightly Coupled)
Melihat isi file `.java` (seperti `DlgPasien.java` beserta `.form`-nya), aplikasi dibangun menggunakan **Java Swing** dengan fasilitas NetBeans GUI Builder.
- **Pola Desain:** Tidak ada pemisahan yang ketat antara *Model*, *View*, dan *Controller* (MVC). Logika UI (tombol, *event listener*), validasi bisnis, dan *query* SQL (`SELECT`, `INSERT`, `UPDATE`) seringkali ditulis bercampur di dalam satu kelas yang sama.
- **Kekurangan:** Skrip menjadi sangat panjang (*God Object*) dan sangat rentan patah (*fragile*) jika ada perubahan kueri database. Membuat *Unit Test* otomatis (*Automated Testing*) hampir mustahil dilakukan pada pola seperti ini.

## 3. Database "Satu Untuk Semua" (Monolithic Database)
File `sik.sql` adalah sebuah mahakarya yang menampung ratusan (mungkin ribuan) tabel yang merepresentasikan seluruh modul rumah sakit (Pendaftaran, Lab, Gizi, Farmasi, Akuntansi, dsb).
- **Kelebihan:** Sangat mudah melakukan *query JOIN* antar departemen. Contohnya, tagihan (Kasir) dapat langsung membaca status rawat inap (Bangsal) dan daftar obat yang diambil (Farmasi) dalam satu *query*.
- **Kekurangan:** Rentan terjadi *Table Locking*. Jika sebuah laporan berat sedang diekstraksi dari tabel kunjungan, proses pendaftaran pasien baru bisa terhambat sesaat. Perbaikan skema database juga berisiko tinggi (*Breaking Changes*) terhadap seluruh sistem.

## 4. Ekosistem Forking (The "Customization" Trap)
Karena Khanza berlisensi gratis dan *open source*, banyak RS atau vendor pihak ketiga langsung memodifikasi *source code* inti (membuat *custom fork*) untuk memenuhi kebutuhan unik RS tersebut.
- **Dampak Negatif:** Ketika *repository* utama (`mas-elkhanza`) merilis pembaruan penting (misalnya *update* wajib format BPJS atau SatuSehat bulan depan), RS yang sudah melakukan modifikasi besar-besaran akan kesulitan melakukan *merge* (*Update Hell*), karena *source code* mereka sudah menyimpang terlalu jauh dari jalur utama.
- **Rekomendasi:** Diperlukan arsitektur berbasis *Plugin* atau *Microservices Middleware* (seperti Spacetime POC) agar RS bisa menambah logika tanpa menyentuh *core file* Khanza.

## Kesimpulan
SIMRS Khanza adalah sebuah sistem yang **Sangat Praktis, Kaya Fitur, dan Solid** untuk operasional harian Rumah Sakit, terutama di skala menengah ke bawah. Namun, gaya pemrograman *monolith* dekade 2010-an (*2-tier, tightly-coupled UI/Database*) membuatnya memiliki **batas atas skalabilitas**. Saat RS bertumbuh sangat besar (ratusan transaksi per menit), infrastruktur akan menuntut pergeseran ke arah Arsitektur *Microservices*, *API Gateway*, dan pemisahan antarmuka *Web/Mobile*.
