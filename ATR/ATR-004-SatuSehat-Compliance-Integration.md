# ATR-004: Ekstraksi Bridging SatuSehat ke Integration Engine (Middleware)

## Status
**Proposed** (Prioritas Utama - Area Kepatuhan/Compliance & Regulasi)

## Konteks & Latar Belakang (Context)
SatuSehat Kemenkes adalah platform yang sifatnya **Wajib secara Regulasi**. Kemenkes memantau secara ketat persentase pengiriman data rekam medis elektronik (EMR) dari setiap faskes. Kegagalan mempertahankan standar *compliance* pengiriman data berpotensi mendatangkan sanksi administratif berupa teguran, penurunan akreditasi, hingga terputusnya kerjasama dengan BPJS Kesehatan.

Masalah pada arsitektur SIMRS Khanza saat ini:
1. **Pengiriman Sinkron Tanpa Retry yang Kuat:** Saat dokter menyimpan diagnosa, aplikasi Khanza menembak langsung ke SatuSehat. Jika koneksi RS putus atau server Kemenkes sedang RTO (*Request Timeout*), proses pengiriman gagal. Tidak ada agen otomatis di belakang layar yang konsisten mengulang (*retry*) pengiriman data yang gagal tersebut. Hal ini menyebabkan RS sering kehilangan persentase *compliance* tanpa disadari.
2. **Hardcoded FHIR Mapping:** Skema JSON HL7 FHIR dari Kemenkes sangat dinamis dan sering berubah/bertambah (*mandatory fields*). Karena *mapping* FHIR ditulis langsung di *source code* Java Khanza, RS harus menunggu *update* `.jar` dan menyebarkannya ke ratusan PC perawat/dokter setiap kali Kemenkes memperbarui aturan API-nya.

## Keputusan Arsitektural (Decision)
Kita akan memisahkan seluruh beban penyusunan objek FHIR dan pengiriman SatuSehat ke sebuah **Middleware / Integration Engine Khusus** (misalnya menggunakan *Mirth Connect*, atau *Event-Relay Service* seperti di arsitektur Spacetime).
1. Aplikasi Khanza **TIDAK LAGI** mengirim data ke SatuSehat secara langsung. Khanza cukup mencatat transaksi medis ke dalam database MySQL lokal (seperti biasa) ditambah log ke tabel `satusehat_outbox`.
2. Middleware akan secara terus-menerus memantau tabel `outbox` tersebut.
3. Middleware yang akan melakukan transformasi data (*mapping*) dari skema MySQL Khanza menjadi format JSON FHIR R4.
4. Middleware memiliki fitur **Dead Letter Queue (DLQ) & Auto-Retry**: Jika server SatuSehat *down*, Middleware akan menampung data sementara waktu dan mencoba mengirim ulang setiap beberapa menit tanpa campur tangan manusia, sehingga tidak ada satu pun rekam medis yang luput terkirim ke Kemenkes.

## Konsekuensi (Consequences)
*   **Positif (+):** 
    *   **Garansi Compliance 100%:** Risiko terkena sanksi Kemenkes akibat data medis "hilang/gagal kirim" menjadi nol, karena sistem dijamin akan mengulang pengiriman (*retry*) hingga sukses.
    *   **Perawatan Mudah:** Jika Kemenkes mengubah aturan *field* FHIR minggu depan, tim IT RS cukup mengedit *script mapping* di server Middleware tanpa perlu menyentuh, meng-*compile*, atau meng-*update* ratusan komputer di poli dan IGD.
*   **Negatif (-):** Harus mempelajari sistem *Integration Engine* baru atau menulis *Microservice* tambahan, serta menyediakan RAM/Server terpisah untuk menjalankan *engine* ini 24/7.
