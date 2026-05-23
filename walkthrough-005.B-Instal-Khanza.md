# Panduan Akses Environment Docker SIMRS Khanza

Selamat! Anda kini telah memiliki ekosistem *backend* SIMRS Khanza yang rapi, modern, dan terisolasi menggunakan Docker di Mac Anda.

## Arsitektur yang Berjalan

Saat ini, terdapat 3 *container* yang aktif berjalan di belakang layar (*background*):

1. **khanza-db (MariaDB 10.5)**
   Berjalan pada *port* `3306`. Container ini secara otomatis mengimpor `sql.sik` yang diunduh ke dalam database bernama `sik`.
2. **khanza-pma (PHPMyAdmin)**
   Berjalan pada *port* `8080`. Container ini digunakan sebagai *Database Manager* visual.
3. **khanza-webapps (Apache + PHP 7.4)**
   Berjalan pada *port* `80`. Container ini melakukan *binding/mount* langsung ke folder `webapps/` Anda. Artinya, setiap perubahan kode pada folder lokal `webapps/` akan langsung berdampak (*live reload*) di *browser* tanpa perlu mem-*build* ulang container!

---

## 🚀 Cara Akses Layanan

### 1. Aplikasi Desktop Khanza (Java Client)
Anda dapat langsung menjalankan project `SIMRSKhanza` dari NetBeans. Secara default, `database.xml` Anda sudah mengarah ke `localhost` port `3306` (dengan konfigurasi tersandi), sehingga aplikasi otomatis terhubung ke Docker.

### 2. Aplikasi Berbasis Web (Webapps)
Buka *browser* Anda dan ketikkan alamat berikut:
👉 [http://localhost](http://localhost)

> [!TIP]
> Jika Anda ingin mengakses modul tertentu (misal: antrian poli), Anda bisa langsung menembak URL-nya seperti [http://localhost/antrian.php](http://localhost/antrian.php).

### 3. Manajemen Database (PHPMyAdmin)
Untuk melihat, memodifikasi, atau mengekspor isi *database* (Tabel Pasien, Rekam Medis, dll):
👉 [http://localhost:8080](http://localhost:8080)
- **Username:** `root`
- **Password:** *(Kosongkan saja)*

---

## 🛠 Panduan Operasional Docker (Cheat Sheet)

Apabila Anda mematikan (*restart*) Mac Anda atau perlu mengelola status server ini, berikut adalah perintah dasar yang dapat Anda jalankan di Terminal (pada direktori `/Users/user/OPREK2/simrs-khanza`):

- **Menjalankan/Menghidupkan Server:**
  ```bash
  docker-compose up -d
  ```
- **Mematikan Server (Tanpa menghapus data):**
  ```bash
  docker-compose stop
  ```
- **Melihat Status/Log Server:**
  ```bash
  docker-compose logs -f
  ```
- **Menghancurkan Server & Menghapus Database (Hati-hati!):**
  ```bash
  docker-compose down -v
  ```

> [!IMPORTANT]
> Karena kita telah mendefinisikan *Named Volume* bernama `khanza_db_data`, data Anda aman dan **TIDAK AKAN HILANG** meskipun container dimatikan (`stop`) atau Anda me-*restart* Mac Anda.
