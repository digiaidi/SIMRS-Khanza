# ATR-002: Transisi Bridging V-Claim BPJS ke Layer Middleware Relay

## Status
**Proposed** (Prioritas Eksekusi Kedua - Proteksi Pendapatan)

## Konteks & Latar Belakang (Context)
Aplikasi klien SIMRS Khanza (Java Swing) mengeksekusi integrasi *bridging* V-Claim BPJS dan enkripsi AES secara *synchronous* (sinkron) tepat ketika pengguna menekan tombol "Simpan". Karena setiap komputer kasir menangani token BPJS-nya masing-masing, hal ini sering menyebabkan kegagalan autentikasi (*race condition* token), layar *freeze* karena *timeout* jaringan, serta risiko hilangnya data klaim pendapatan (INA-CBG) saat terjadi gangguan di pihak eksternal.

## Keputusan Arsitektural (Decision)
Kita akan mengubah mekanisme komunikasi *direct-to-BPJS* menjadi **Event-Driven Architecture dengan Transactional Outbox Pattern**.
1. Klien Khanza tidak lagi memanggil API BPJS via HTTP secara langsung.
2. Setiap transaksi penerbitan SEP atau Klaim Kasir hanya akan dicatat ke dalam satu tabel lokal khusus (`outbox_events`).
3. Membangun sebuah daemon/layanan **Relay Service (Middleware)** yang akan berjalan di server belakang layar, memantau tabel `outbox` tersebut.
4. Relay Service ini yang akan mengurus pembuatan Token BPJS (secara terpusat/Tunggal), mengenkripsi *payload*, lalu mem-*push* ke V-Claim BPJS. Jika BPJS *down*, layanan ini akan otomatis mengulang (*Auto-Retry*) di kemudian waktu.

## Konsekuensi (Consequences)
* **Positif (+):** *Zero data loss*. Tidak akan ada uang klaim yang hilang/kadaluarsa karena *error* komputer. Aplikasi kasir dan pendaftaran akan berjalan secepat kilat (karena hanya menyimpan ke database lokal tanpa perlu menunggu HTTP *Response* BPJS). Manajemen token menjadi terpusat (*thread-safe*).
* **Negatif (-):** Memerlukan intervensi tingkat lanjut untuk memodifikasi fungsi *trigger* pada database MySQL Khanza atau sedikit mengedit kode `.jar` agar data ter-*insert* ke tabel `outbox`. Pengguna tidak akan langsung mendapat notifikasi gagal/berhasil dari BPJS secara instan di layar PC mereka, melainkan *status* proses (*Pending, Success, Failed*) yang bisa dicek di menu antrean klaim.
