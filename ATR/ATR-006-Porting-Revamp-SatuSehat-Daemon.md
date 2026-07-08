# ATR-006: Porting & Revamp Daemon Background Service SatuSehat ke Bun + Effect TS

## Status
**Superseded by ATR-007 / Partially Implemented**

ATR ini adalah keputusan awal untuk memindahkan daemon SatuSehat legacy dari pola Java Swing/headless-unfriendly menuju aplikasi satelit berbasis Bun + Effect TS. Implementasi aktualnya sudah dicatat pada:

```text
ATR/ATR-007-Khanza-SatuSehat-Sync-Satellite.md
```

Dengan demikian, ATR-006 dipertahankan sebagai catatan *decision intent* dan latar belakang historis. Detail implementasi final, struktur modul aktual, validasi, Graphify findings, dan roadmap hardening mengacu ke ATR-007.

## Konteks & Latar Belakang (Context)
Layanan latar belakang **`KhanzaHMSServiceSatuSehat`** (khususnya berkas [frmUtama.java](file:///Users/user/OPREK2/simrs-khanza/KhanzaHMSServiceSatuSehat/src/khanzahmsservicesatusehat/frmUtama.java)) dirancang untuk melakukan penarikan data transaksi medis dari database lokal secara berkala dan mem-*push* datanya ke platform **SatuSehat Kemenkes RI**. 

Meskipun fungsionalitas pengiriman data medisnya sangat luas, implementasi saat ini memiliki keterbatasan arsitektural yang kritis:
1.  **Ketergantungan Desktop GUI (Java Swing):** Layanan ini dibungkus sebagai aplikasi visual desktop. Padahal, sebuah *background daemon* idealnya berjalan murni tanpa antarmuka (*headless*) di server backend Linux. Hal ini menyulitkan *deployment* skala besar dan meningkatkan konsumsi memori RAM.
2.  **Pemrosesan Sinkron & Berurutan (Single-Threaded Blocking I/O):**
    Menggunakan `javax.swing.Timer` yang berjalan setiap detik. Setiap jam atau menit tertentu, sistem melakukan *looping* untuk memproses puluhan jenis data EMR (Encounter, TTV, Resep, Diagnosis, Lab, Rad). Di dalam loop tersebut, program melakukan pemanggilan HTTP REST secara sinkron satu demi satu untuk mengecek NIK dokter & pasien. Jika API Kemenkes lambat, seluruh thread penjadwalan akan *freeze/hang*.
3.  **Absensi Mekanisme Auto-Retry Pintar:**
    Jika terjadi kegagalan koneksi atau server Kemenkes sedang sibuk (*Timeout/RTO*), program hanya mencetak error ke konsol GUI dan **melewati data medis tersebut**. Data baru dicoba kembali 4 jam kemudian secara keseluruhan, tanpa ada mekanisme antrean pintar (*Retry Queue*) berbasis berkas per data yang gagal.

## Keputusan Arsitektural (Decision)
Kita memutuskan untuk melakukan **Porting Menyeluruh dan Revamp Arsitektur** terhadap proyek `KhanzaHMSServiceSatuSehat` menjadi aplikasi satelit modern berbasis **Bun & Effect TS**.

Keputusan ini sudah direalisasikan dalam bentuk `khanza-satusehat-sync`, dengan beberapa penyesuaian implementasi aktual:

1.  **Migrasi Runtime ke Bun (TypeScript):**
    Mengganti mesin Java JVM dengan **Bun runtime** yang super cepat dan sangat efisien. Layanan akan dideploy murni sebagai headless daemon (tanpa GUI) yang sangat cocok untuk *production server* menggunakan kontainerisasi **Docker**.
2.  **Adopsi Effect TS Functional & Concurrent Architecture:**
    Mengubah alur loop sinkron Java menjadi **concurrent fibers** menggunakan Effect TS. Logika pengecekan NIK dan pengiriman data FHIR akan diproses secara paralel terkontrol (misalnya: memproses 10 data rekam medis sekaligus via `concurrency: 10`), memangkas waktu tunggu I/O secara masif.
3.  **Pemisahan Tanggung Jawab (Decoupling & Modularity):**
    Memecah berkas tunggal monolithic `frmUtama.java` (8.700+ baris) menjadi modul-modul TypeScript yang terfokus. Implementasi aktual menggunakan:
    *   `src/config/AppConfig.ts`: konfigurasi runtime dari environment.
    *   `src/services/Database.ts`: koneksi database Khanza menggunakan `@effect/sql` + `@effect/sql-mysql2`.
    *   `src/services/SatuSehatClient.ts`: OAuth2 dan HTTP client SATUSEHAT.
    *   `src/services/NikCache.ts`: cache lookup Patient/Practitioner berdasarkan NIK.
    *   `src/jobs/_runner.ts`: generic sync runner untuk resource FHIR.
    *   `src/jobs/*`: job per domain/resource.
    *   `src/mappers/*`: transformasi row Khanza menjadi payload FHIR.
    *   `src/scheduler/Orchestrator.ts`: scheduler DAG berbasis Effect.
    *   `src/services/ApprovalGate.ts`, `src/approval/ReviewServer.ts`, dan `src/approval/ApprovalDispatcher.ts`: human-in-the-loop review untuk resource sensitif.
    *   `src/services/NdjsonWriter.ts` dan `src/services/FlatQuackRunner.ts`: export NDJSON dan analytics pipeline.
4.  **Self-Healing dan Outbox Pattern sebagai Hardening Roadmap:**
    Keputusan awal mengarah pada self-healing queue/outbox. Implementasi saat ini sudah memiliki retry HTTP di client, scheduler resilien, approval queue, dan error logging, tetapi **persistent outbox, idempotency key, retry queue/DLQ, dan FHIR validation sistematis masih menjadi roadmap hardening** di ATR-007.

## Realisasi Aktual

Realisasi keputusan ini adalah:

```text
khanza-satusehat-sync/
```

Status aktual:
- TypeScript/Bun service sudah tersedia.
- Effect Layer sudah digunakan untuk dependency wiring.
- Scheduler DAG SATUSEHAT sudah tersedia.
- Mapper FHIR sudah dipisah per resource.
- Test mapper, approval gate, dan NDJSON sudah tersedia.
- Review dashboard dan approval dispatcher sudah tersedia.
- NDJSON + FlatQuack analytics pipeline sudah tersedia.
- Dockerfile dan docker-compose sudah tersedia.

Validasi terakhir mengacu pada ATR-007:
- `bun run typecheck` berhasil.
- `bun test` berhasil dengan 18 test pass.

## Konsekuensi (Consequences)
*   **Dampak Positif (+):**
    *   **Headless & Docker-Ready:** Layanan tidak lagi bergantung pada GUI Java Swing.
    *   **Keandalan Transmisi Lebih Baik:** Pengiriman SATUSEHAT dipindahkan ke scheduler/service khusus, bukan flow desktop legacy.
    *   **Kemudahan Pemeliharaan:** Struktur kode modular membuat mapper, job, scheduler, client, dan approval flow lebih mudah diuji dan dikembangkan.
    *   **Foundation Aplikasi Satelit:** Pola ini menjadi referensi untuk aplikasi satelit berikutnya seperti Payment System QRIS/Hyperswitch.
*   **Dampak Negatif (-):**
    *   Ada service baru yang harus dimonitor.
    *   Memerlukan runtime Bun/Docker di server infrastruktur rumah sakit.
    *   Membutuhkan installer/preflight checker karena variasi schema Khanza antar instalasi RS.
    *   Beberapa janji reliability dari keputusan awal masih perlu diselesaikan pada fase production hardening.

## Gap yang Dipindahkan ke Roadmap ATR-007

Hal-hal berikut tidak lagi dianggap sebagai bagian ATR-006 yang terpisah, tetapi menjadi roadmap hardening `khanza-satusehat-sync` di ATR-007:

1. Persistent outbox untuk semua resource.
2. Idempotency key per resource.
3. Retry queue dan Dead Letter Queue.
4. FHIR validation sistematis sebelum send.
5. Auth/RBAC untuk approval dashboard.
6. Migration SQL dan index untuk tabel review/outbox/audit.
7. Health check, metrics, structured logs, dan dashboard operasional.

## Hubungan dengan ATR Lain

- `ATR-004` menjelaskan keputusan awal ekstraksi bridging SATUSEHAT ke middleware/integration engine.
- `ATR-006` ini menjelaskan intent porting daemon legacy ke Bun + Effect TS.
- `ATR-007` mencatat implementasi aktual `khanza-satusehat-sync` dan roadmap hardening.
- `ATR-008` melanjutkan pola aplikasi satelit ke domain Payment System QRIS/Hyperswitch.
