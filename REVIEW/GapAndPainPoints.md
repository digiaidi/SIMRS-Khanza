# Analisa GAP dan Pain Point Bridging (SatuSehat & BPJS) pada SIMRS Khanza

Meskipun SIMRS Khanza memiliki fitur *bridging* yang komprehensif, arsitektur utamanya yang berbasis Desktop Monolith (Java Swing / *Fat Client*) yang mana setiap komputer klien terhubung langsung ke layanan API eksternal memunculkan beberapa **GAP** dan **Pain Point** yang signifikan pada skala besar (Enterprise).

## 1. Analisa Pain Point: Integrasi BPJS Kesehatan

| Pain Point / GAP | Deskripsi Mekanisme | Dampak pada Operasional / Sistem | Rekomendasi Solusi Arsitektural |
| :--- | :--- | :--- | :--- |
| **Manajemen Token Terdesentralisasi** | Setiap PC Pendaftaran/Kasir men-*generate* dan mengelola token (ConsID & Secret) ke BPJS masing-masing. | Sering terjadi *race condition* (saling menimpa atau me-reset token), menyebabkan kegagalan autentikasi (*Token Expired/Invalid*) secara tiba-tiba di loket, membuat antrean pasien menumpuk. | Membangun sebuah **Middleware / API Gateway** terpusat. Klien Desktop hanya memanggil *gateway* internal, sementara *gateway* menangani *token lifecycle* secara _thread-safe_. |
| **Tidak Ada Antrean / *Rate Limiting*** | Aplikasi *desktop* menembak API BPJS sesuka hati setiap *user* mengklik tombol, tanpa regulasi *traffic*. | Berisiko terkena *throttling* atau **pemblokiran IP sementara (Limit Exceeded)** oleh BPJS, mematikan seluruh layanan asuransi RS secara seketika. | Integrasi menggunakan sistem antrean (*Message Broker / Rate Limiter*). |
| **Tightly Coupled UI (Risiko *Freeze*)** | Pemanggilan HTTP (serta proses enkripsi AES dan dekompresi LZString) terjadi secara _synchronous_ pada _Main UI Thread_. | Jika server BPJS sedang lambat atau *down*, antarmuka (layar monitor) pengguna akan **freeze (Hang)** menunggu *timeout*. | Implementasi pemanggilan API secara asinkron (*Asynchronous API Calls*) menggunakan sistem *background worker*. |

---

## 2. Analisa Pain Point: Integrasi SatuSehat Kemenkes

| Pain Point / GAP | Deskripsi Mekanisme | Dampak pada Operasional / Sistem | Rekomendasi Solusi Arsitektural |
| :--- | :--- | :--- | :--- |
| **Struktur FHIR Bersifat *Hardcoded*** | Logika *mapping* entitas database internal ke objek JSON HL7 FHIR (seperti `Encounter`, `Condition`) ditulis *hardcoded* di dalam *class* Java (`src/bridging/SatuSehatKirim...`). | API SatuSehat masih sering berevolusi. Jika ada penambahan struktur *mandatory*, RS harus meng-*compile* ulang seluruh `.jar` dan mendistribusikannya ke ratusan PC klien. | *Mapping* harus dipisah menggunakan **Integration Engine** (seperti Mirth Connect) atau _Microservice_, sehingga *update mapping* dapat dilakukan terpusat di server tanpa menyentuh *client*. |
| **Tidak Ada Mekanisme Retry (No Outbox)** | Pengiriman data dipicu saat *event* simpan ditekan. Jika jaringan RS putus atau *cloud* SatuSehat mati, proses gagal di tempat. | Terjadi selisih jumlah pengiriman. Data rekam medis tidak terkirim utuh ke Kemenkes (Compliance Issue). | Implementasi **Transactional Outbox Pattern**. Simpan _event_ pengiriman ke tabel lokal terlebih dulu, lalu buat sebuah agen/daemon (_Relay Service_) yang mencoba mengirim secara periodik (_Retry Queue_). |
| **Beban Query yang Sangat Besar** | Menyusun satu JSON *Resource* FHIR yang lengkap memerlukan pengambilan data *(query JOIN)* dari banyak tabel MySQL yang berat. | Karena dijalankan secara _real-time_ oleh ratusan _client_, database MySQL utama akan mengalami **bottle-neck** I/O, memperlambat operasional RS secara drastis. | Pola *Event-Driven Architecture* (menyebar _event_ saat ada perubahan) atau mendelegasikan tugas ekstraksi FHIR kepada _Read Replica Database_. |

## Kesimpulan Singkat

Paradigma **"Client-to-External Direct"** yang saat ini digunakan Khanza sangat efisien dan mudah saat *deployment* tahap awal. Namun, hal ini menciptakan **Technical Debt** (utang teknis) terkait *Resilience* (ketahanan) dan pemeliharaan *software*. 

Sangat disarankan agar RS yang besar menggunakan atau mengembangkan **Layer Middleware / Relay Transport Server** secara terpisah, di mana Khanza hanya perlu berinteraksi (bahkan hanya melalui mekanisme perubahan pada level database/tabel) dan membiarkan _Middleware_ menangani kerumitan jaringan, *retry*, *rate limits*, dan enkripsi pihak ketiga.
