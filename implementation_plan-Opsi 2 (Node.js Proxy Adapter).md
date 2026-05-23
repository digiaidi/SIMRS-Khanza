# Implementation Plan: Bimasakti Integration via Hyperswitch (Option 2 - Node.js Proxy)

Melanjutkan kesepakatan untuk menggunakan **Opsi 2 (Proxy/Adapter via Node.js)** terlebih dahulu untuk integrasi Bimasakti pada _environment_ lokal.

## User Review Required

> [!IMPORTANT]
> Pendekatan ini akan "membajak" konektor **Stripe** di dalam Hyperswitch dengan mengubah Base URL-nya ke Middleware kita. Ini adalah trik umum di Hyperswitch untuk membuat konektor kustom tanpa _compile_ Rust. Apakah Anda setuju kita menggunakan konektor "Stripe" sebagai wadah proksinya?

## Open Questions

1. Apakah _bimasakti_mock_ saat ini berjalan di port `3001` (karena script `server.js` di `scratch/bimasakti_mock` biasanya berjalan di port tersebut)?
2. Apakah SpacetimePOC3 akan kita jalankan secara lokal (via `bun run`) atau via Docker? (Asumsi saya: berjalan lokal di port `4100`).

## Proposed Changes

Kita akan menerapkan alur berikut:
`SpacetimePOC3 -> Hyperswitch API -> SpacetimePOC3 (Stripe Proxy) -> bimasakti_mock`

### 1. SpacetimePOC3 (Proxy Adapter)
Menambahkan rute translasi di dalam `SpacetimePOC3/payment/src/index.ts`.
* Rute baru: `POST /proxy/stripe/v1/payment_intents` (Mensimulasikan API Stripe).
* **Logic:** Rute ini akan menerima HTTP POST dari Hyperswitch, mengambil data jumlah pembayaran (`amount`), kemudian memanggil `bimasakti_mock` secara internal untuk mendapatkan string QRIS, dan mengembalikan balasan dalam format JSON yang dipahami oleh Hyperswitch API (meniru format _Payment Intent_ Stripe).

#### [MODIFY] [SpacetimePOC3/payment/src/index.ts](file:///Users/user/OPREK/SpacetimePOC3/payment/src/index.ts)
- Tambahkan logic interceptor `/proxy/stripe/*` di dalam handler `fetch()`.

### 2. Hyperswitch Configuration
Mengubah _Base URL_ konektor Stripe di Hyperswitch agar mengarah ke proxy kita.

#### [MODIFY] [hyperswitch-local/config/docker_compose.toml](file:///Users/user/OPREK2/simrs-khanza/hyperswitch-local/config/docker_compose.toml)
- Cari baris `stripe.base_url = "https://api.stripe.com/"`
- Ubah menjadi `stripe.base_url = "http://host.docker.internal:4100/proxy/stripe/"`
- _Restart_ kontainer `hyperswitch-server`.

### 3. Hyperswitch Control Center Setup
Kita perlu mendaftarkan konektor Stripe di akun *merchant* Hyperswitch lokal Anda melalui API HTTP (karena kita akan melakukan _bypass_ lewat skrip agar cepat).
* Membuat API Key (jika belum ada).
* Menambahkan konektor Stripe dengan kredensial sembarang (karena proxy kita tidak memvalidasinya).

### 4. Modifikasi SpacetimePOC3 (Merchant)
Mengubah cara SpacetimePOC3 membuat tagihan agar memanggil Hyperswitch API, bukan memanggil fungsi gateway Bimasakti langsung.

#### [MODIFY] [SpacetimePOC3/payment/src/services/PaymentGateway.ts](file:///Users/user/OPREK/SpacetimePOC3/payment/src/services/PaymentGateway.ts)
- Ubah implementasi fungsi `createQris` di dalam gateway agar memanggil Endpoint `http://localhost:8080/payments` (Hyperswitch API).

## Verification Plan

### Automated/Manual Tests
- Menjalankan `bimasakti_mock` (port 3001).
- Menjalankan SpacetimePOC3 payment service (port 4100).
- Melakukan POST request ke `http://localhost:4100/qris` dan memastikan bahwa balasan mencakup QRIS string yang dihasilkan dari `bimasakti_mock` setelah memutar lewat Hyperswitch.
- Memeriksa _dashboard_ Control Center Hyperswitch (`http://localhost:9000`) dan melihat transaksi "Stripe" tercatat berhasil.
