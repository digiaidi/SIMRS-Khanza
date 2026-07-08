## **0\)**

## **RECAP**

## **Ringkasan Langkah Build Modular Monolith**

1. **Create App:** Buat *container* utama menggunakan perintah CLI: `bench new-app nama_app`.  
2. **Define Modules:** Buat beberapa **Module Def** di Desk untuk memisahkan domain bisnis (misal: `Core`, `Billing`, `Logistics`).  
3. **Build DocTypes:** Buat DocType dan arahkan ke Module Def yang sesuai. Tulis logika bisnis secara terisolasi di folder masing-masing.  
4. **Connect via Hooks:** Jika antar modul butuh berinteraksi secara asinkron atau berbasis *event*, manfaatkan `hooks.py`.

## **1\)** **Detilkan bagaimana kita build modular monolith app di Frappe.io yang terkait dengan  Module Def, Doctype dan lainnya yang relevan.**

Membangun aplikasi dengan arsitektur **Modular Monolith** di Frappe Framework sebenarnya adalah *core philosophy* dari Frappe itu sendiri. Frappe tidak menggunakan konsep microservices yang terpisah secara infrastruktur, melainkan membagi aplikasi ke dalam modul-modul logis (Python & JS) yang berjalan di atas satu monolit yang kuat (satu database, satu core runtime).  
Berikut adalah detail komponen utama dan cara menyusun modular monolith di Frappe.

## 

## **1\. Arsitektur Dasar: App vs. Module**

Dalam Frappe, modularitas dibangun secara bertingkat:

* **Frappe App (Level Tertinggi):** Ini adalah satu repositori Git utuh. Di dalam satu *site* Frappe, Anda bisa menginstal beberapa App sekaligus (misalnya: frappe, erpnext, dan aplikasi\_kustom\_anda).  
* **Module Def (Level Internal App):** Di dalam satu App, Anda membaginya lagi menjadi beberapa modul fungsional (misalnya: modul HR, Accounting, atau Inventory).

## 

## **2\. Mengenal Module Def (Module Definition)**

**Module Def** adalah cara Frappe mengelompokkan kode, DocType, report, dan dashboard secara logis di dalam satu App.

### **Cara Membuat Module Def:**

1. Masuk ke Desk Frappe sebagai Administrator.  
2. Cari dan buka DocType **Module Def**.  
3. Klik **Add Module Def**.  
4. Isi nama modul (misal: Project Management) dan pilih **App** tempat modul ini bernaung.

Setelah dibuat, Frappe akan otomatis membuatkan folder baru di dalam direktori App Anda:  
apps/\[nama\_app\]/\[nama\_app\]/\[nama\_modul\_lowercased\]/  
💡 **Praktik Terbaik Monolith:** Pisahkan domain bisnis Anda dengan tegas di level Module Def. Hindari dependensi sirkular (Modul A memanggil Modul B, dan Modul B memanggil Modul A) agar monolit Anda tetap bersih dan mudah di-maintain.

## 

## **3\. Komponen Inti: DocType (Document Type)**

DocType adalah fondasi dari segala data dan logika di Frappe. Ia bertindak sebagai skema database (Tabel), sekaligus pengatur UI (Form) dan Controller (Logika Bisnis).  
Saat Anda membuat DocType baru, Anda **wajib memilih Module Def**. Frappe akan menempatkan seluruh *source code* DocType tersebut di dalam folder modul yang bersangkutan.

### 

### **Struktur Folder DocType di dalam Modul:**

Misalnya Anda membuat DocType Project Task di dalam modul Project Management, strukturnya akan menjadi:

Plaintext  
project\_management/  
├── \_\_init\_\_.py  
├── module\_def\_name.json  
└── doctype/  
    └── project\_task/  
        ├── \_\_init\_\_.py  
        ├── project\_task.json   \# Definisi field, izin (permissions), dll.  
        ├── project\_task.py     \# Server-side controller (Python)  
        ├── project\_task.js     \# Client-side controller (JavaScript)  
        └── project\_task\_list.js \# Kustomisasi tampilan list (Opsional)

### **Menjaga Modularitas di Level DocType:**

* **Server-Side (Python):** Gunakan file .py untuk menulis *business logic* spesifik DocType tersebut (seperti validasi data sebelum disimpan menggunakan method validate()).  
* **Hooks & Event Streaming:** Jika Modul A butuh memicu aksi di Modul B saat ada data baru, jangan lakukan *hard-coding* import langsung jika ingin menjaga *loose coupling*. Gunakan fitur **Hooks** atau **Document Events** di Frappe.

## 

## **4\. Fitur Pendukung Modularitas Lainnya**

Selain DocType dan Module Def, Frappe menyediakan alat bantu untuk menjaga aplikasi monolit Anda tetap teratur:

### 

### **A. Workspace & Dashboard**

Anda bisa membuat **Workspace** khusus untuk setiap Module Def. Ini memastikan pengguna yang hanya bekerja di bagian *Payroll* hanya akan melihat shortcut, laporan, dan grafik yang relevan dengan modul mereka, tanpa terganggu oleh modul *Procurement*.

### 

### **B. Custom Field & Property Setter (Ekstensi Tanpa Merusak)**

Jika Anda menginstal aplikasi *core* (seperti ERPNext) dan ingin menambahkan field atau mengubah perilaku modul bawaan dari aplikasi kustom Anda, **jangan pernah mengubah kode core**.

* Gunakan **Custom Field** yang didaftarkan via file hooks.py aplikasi Anda.  
* Gunakan **Property Setter** untuk mengubah sifat field bawaan.  
  Dengan cara ini, arsitektur monolit Anda tetap bisa di-upgrade tanpa konflik kode.

### 

### **C. Fixtures**

Untuk membawa data konfigurasi (seperti Custom Field, Workflow, atau Dashboard) antar modul dan memastikan *deployment* berjalan lancar, gunakan **Fixtures** di file hooks.py:

Python  
fixtures \= \[  
    {"dt": "Custom Field", "filters": \[\["module", "=", "Project Management"\]\]},  
    {"dt": "Workflow", "filters": \[\["module", "=", "Project Management"\]\]}  
\]

## **Ringkasan Langkah Build Modular Monolith**

1. **Create App:** Buat *container* utama menggunakan perintah CLI: bench new-app nama\_app.  
2. **Define Modules:** Buat beberapa **Module Def** di Desk untuk memisahkan domain bisnis (misal: Core, Billing, Logistics).  
3. **Build DocTypes:** Buat DocType dan arahkan ke Module Def yang sesuai. Tulis logika bisnis secara terisolasi di folder masing-masing.  
4. **Connect via Hooks:** Jika antar modul butuh berinteraksi secara asinkron atau berbasis *event*, manfaatkan [hooks.py](http://hooks.py).

## 

## **2\)**

## **Apa saja best practice aplikasi modular monolith berbasis Frappe.io yang kita bisa terhindar dari kebiasaan JOIN atar doctype yang banyak terjadi di ERPNext?** 

Pertanyaan yang sangat bagus\! Masalah kueri JOIN yang berlebihan dan saling mengikat (*tight coupling*) antar-domain memang menjadi salah satu tantangan terbesar di ERPNext. Karena semua data berada di satu database (MariaDB/Postgres) yang sama, developer sering kali tergoda untuk langsung melakukan frappe.db.sql("SELECT ... JOIN ...") lintas modul.  
Arsitektur dasar Frappe menempatkan semua aplikasi di atas runtime dan database yang sama (seperti terlihat pada diagram arsitektur di bawah), sehingga disiplin *clean code* harus dijaga ketat di level aplikasi agar tidak berujung menjadi *spaghetti code*.

Agar modular monolith Anda di Frappe tetap bersih, independen, dan terhindar dari *anti-pattern* kueri JOIN massal seperti di ERPNext, berikut adalah beberapa *best practice* yang bisa diterapkan:

### 

### **1\. Terapkan Denormalisasi Data secara Terkontrol (Data Redundancy)**

Di ERPNext, jika Anda membutuhkan nama pelanggan di DocType *Invoicing*, Anda cenderung melakukan kueri ke DocType *Customer*. Dalam *Domain-Driven Design* (DDD) untuk modular monolith, Anda sebaiknya **menduplikasi data** yang jarang berubah.

* **Cara Frappe:** Gunakan properti fetch\_from di DocType Field.  
* **Praktik:** Jika DocType Siswa berada di Modul Akademik, dan Modul Perpus butuh mencatat Peminjaman Buku, jangan lakukan kueri JOIN ke tabel Siswa setiap kali ingin tahu nama siswa. Cukup simpan siswa\_id dan buat field nama\_siswa dengan fetch\_from ke siswa\_id.nama. Data nama akan di-kopi secara permanen di tabel Peminjaman saat dokumen disimpan.

### 

### **2\. Gunakan Event-Driven Architecture Inter-Modul (Frappe Hooks & Events)**

Jangan biarkan Modul A langsung mengubah status atau memanggil method internal milik Modul B lewat import Python langsung. Hal ini membuat kedua modul tidak bisa dipisahkan di kemudian hari.

Gunakan **Document Events** di file hooks.py untuk menangani komunikasi asinkron.

5. **Contoh Kasus:** Ketika dokumen di Modul Penjualan (Sales Invoice) di-submit, Modul Akuntansi harus membuat Jurnal.  
6. **Anti-Pattern (ERPNext style):** Di dalam file sales\_invoice.py tertulis kode untuk mengimport dan membuat Journal Entry.  
7. **Best Practice:** Daftarkan event di hooks.py aplikasi Anda:

Python  
\# hooks.py  
doc\_events \= {  
    "Sales Invoice": {  
        "on\_submit": "accounting.api.create\_journal\_entry\_for\_invoice"  
    }  
}

*Modul Penjualan sama sekali tidak tahu dan tidak peduli apa yang dilakukan oleh Modul Akuntansi setelah invoice disubmit.*

### 

### **3\. Sediakan API Publik Tingkat Modul (api.py)**

Setiap modul harus memiliki "pintu masuk" resmi. Jika Modul A terpaksa membutuhkan data atau agregasi dari Modul B, Modul A **dilarang keras** melakukan frappe.get\_all() atau frappe.db.get\_value() langsung ke DocType internal Modul B.

* **Praktik:** Buat file api.py atau utils.py di akar folder Modul B sebagai *Interface Contract*.  
* **Contoh:**  
  Python  
  \# Di dalam modul\_gudang/api.py  
  def get\_stock\_balance(item\_code):  
      \# Logika internal gudang, bebas diubah kapan saja tanpa merusak modul lain  
      return frappe.db.get\_value("Stock Ledger Entry", ...) 

  Modul Penjualan yang membutuhkan data stok cukup memanggil modul\_gudang.api.get\_stock\_balance(item). Jika struktur tabel di dalam Modul Gudang berubah, Anda hanya perlu memperbaiki fungsi di file api.py tersebut.

### 

### **4\. Batasi Penggunaan Link Field Lintas Batas Domain**

Link Field di Frappe secara otomatis menciptakan relasi asing (*foreign key* tersirat) di UI dan database. Terlalu banyak Link Field lintas modul akan menciptakan jaringan dependensi yang rumit.

* **Solusi:** Untuk entitas yang sifatnya transaksional lintas modul, pertimbangkan menggunakan tipe data Data (String) untuk menyimpan ID, bukan Link. Validasi keberadaan ID tersebut bisa dilakukan secara manual di backend menggunakan *Interface Contract* (API) yang sudah dijelaskan di poin ke-3.

### 

### **5\. Pisahkan Kueri Menggunakan Virtual DocType untuk Data External / Agregasi**

Jika Anda harus menampilkan data gabungan yang kompleks di UI (misalnya dashboard yang membutuhkan data dari 3 modul berbeda), hindari menulis kueri SQL JOIN yang rumit di controller utama.

5. **Solusi:** Manfaatkan **Virtual DocType**.  
6. Virtual DocType tidak memiliki tabel fisik di database. Anda bisa menulis kode Python kustom di dalamnya untuk mengambil data dari berbagai API modul secara terpisah, lalu menggabungkannya di memori Python sebelum disajikan ke UI Frappe.

### 

### **Rangkuman Pola Pikir**

| Pendekatan ERPNext (Spaghetti Monolith) | Pendekatan Modular Monolith yang Bersih |
| :---- | :---- |
| frappe.db.sql("SELECT \* FROM tabA JOIN tabB ...") | Memanggil fungsi API: modul\_b.api.get\_data() |
| Mengubah status dokumen modul lain langsung di file .py sendiri | Menggunakan doc\_events di hooks.py (*Publish-Subscribe*) |
| Selalu melakukan JOIN untuk mengambil teks/atribut relasi | Menggunakan denormalisasi terkontrol (fetch\_from) |

## **3\)**

## **Apa benang merah kebiasaan JOIN / Link Field Lintas Batas Domain memungkinkan di geser ke kebiasaan baru Modular Monolith? Apa saja benang merahnya?**

Benang merah (atau jembatan konseptual) yang menghubungkan kebiasaan lama (banyak JOIN / *Link Field* lintas domain) dengan kebiasaan baru (*Modular Monolith*) terletak pada **pergeseran dari integrasi di level database (SQL/Data) ke integrasi di level kode/kontrak (API/Event)**.  
Frappe dirancang sebagai framework *data-driven*, sehingga secara natural developer digiring untuk menyelesaikan semua masalah di level database menggunakan *Link Field*. Untuk beralih ke *Modular Monolith*, Anda tidak perlu membuang fitur Frappe, melainkan **mengubah cara pandang terhadap relasi data tersebut**.

Berikut adalah 4 benang merah utama yang menggeser kebiasaan lama menjadi kebiasaan baru:

### **1\. Dari "Relasi Data" ke "Relasi Informasi" (Benang Merah: *Data Ownership*)**

* **Kebiasaan Lama:** Anda menganggap DocType B adalah bagian dari tabel DocType A, sehingga Anda membuat *Link Field* langsung untuk menarik semua data lewat JOIN.  
* **Kebiasaan Baru:** Anda menyadari bahwa Modul A hanya butuh **informasi snapshot (identitas)** dari Modul B, bukan akses penuh ke seluruh datanya.  
* **Pergeserannya:** *Link Field* tetap digunakan, tetapi **hanya sebagai referensi ID (Foreign Key kosong)**. Modul A tidak boleh tahu apa saja field di dalam Modul B. Jika Modul A butuh data pendukung, ia memanggil fungsi API Modul B, bukan menulis query SQL JOIN. Hak milik data (*Data Ownership*) tetap berada utuh di Modul B.

### 

### **2\. Dari "Sekali Kueri Dapat Semua" ke "Komposisi Data" (Benang Merah: *Interface Aggregation*)**

8. **Kebiasaan Lama:** Menulis satu kueri SQL raksasa dengan banyak JOIN agar data dari berbagai modul muncul sekaligus dalam satu kali jalan (demi performa database).  
9. **Kebiasaan Baru:** Memisahkan pengambilan data per modul di memori Python, lalu menyatukannya sebelum dikirim ke UI.  
10. **Pergeserannya:** Menggunakan **Virtual DocType** atau **Controller Methods** di Frappe sebagai *Aggregator*. Anda melakukan frappe.get\_doc ke Modul A, lalu mengambil data pelengkap dari Modul B lewat API-nya, dan menggabungkannya di level Python. Secara performa, Python dan MariaDB modern sangat cepat dalam menangani kueri terpisah (singel *Primary Key lookups*) dibanding melakukan JOIN tabel-tabel besar yang mengunci (*locking*) database.

### 

### **3\. Dari "Eksekusi Langsung" ke "Pemberitahuan/Notifikasi" (Benang Merah: *Inversion of Control*)**

* **Kebiasaan Lama:** Ketika data di Modul A berubah, Modul A langsung melakukan JOIN atau kueri untuk meng-update tabel di Modul B secara sepihak. Modul A memegang kendali penuh.  
* **Kebiasaan Baru:** Ketika data di Modul A berubah, Modul A hanya berteriak: *"Saya sudah berubah\!"*, dan Modul B yang akan mengambil tindakan sendiri.  
* **Pergeserannya:** Memanfaatkan **Frappe Hooks (Document Events)**. Ini adalah benang merah paling kuat. Hubungan antar-Doctype yang tadinya terikat mati di dalam kode controller .py, digeser ke file konfigurasi hooks.py. Modul Anda menjadi *loose coupling* (ikatan longgar).

### 

### **4\. Dari "Berbagi Skema" ke "Berbagi Kontrak" (Benang Merah: *Encapsulation*)**

* **Kebiasaan Lama:** Jika ada perubahan struktur field di DocType Modul B, kueri JOIN di Modul A langsung *error* karena nama kolomnya hilang atau berubah.  
* **Kebiasaan Baru:** Modul A tidak perlu tahu struktur tabel Modul B. Modul A hanya tahu "kontrak" berupa fungsi Python yang disediakan Modul B.  
* **Pergeserannya:** Membuat file api.py di setiap modul. Selama input dan output dari fungsi di api.py tersebut tidak berubah, Anda bebas mengubah nama field, menambahkan tabel anak (*Child Table*), atau mendesain ulang DocType di dalam modul tersebut tanpa takut merusak modul lainnya.

### 

### **Kesimpulan**

Benang merah terbesar untuk bergeser ke *Modular Monolith* di Frappe adalah **kedisiplinan membatasi batas domain (Bounded Context)**.  
Alih-alih memperlakukan database Frappe sebagai satu kolam besar tempat semua DocType bebas saling *JOIN*, anggaplah setiap **Module Def** sebagai sebuah "Mini-Application" mandiri yang hanya berbicara dengan sesamanya melalui pintu resmi (API dan Hooks), meskipun di latar belakang mereka masih berbagi rumah (database) yang sama.

## **3\)**

## **Berikan by example pembuatan aplikasi modular monolith yang sangat clear menjelaskan semua ini**

Mari kita bedah melalui contoh nyata. Kita akan membuat aplikasi **Sistem Manajemen Kampus (Campus System)** yang dibagi menjadi dua modul yang harus terisolasi tapi tetap saling berkomunikasi:

* **Modul Akademik** (Mengelola Mahasiswa dan Kelulusan)  
* **Modul Perpustakaan** (Mengelola Peminjaman Buku dan Cek Sanksi)

Kita ingin ketika **Modul Perpustakaan** mencatat peminjaman, ia butuh data Mahasiswa. Namun, kita **tidak ingin** ada kueri JOIN langsung ke tabel Akademik, dan kita ingin **Modul Akademik** bisa mencekal kelulusan mahasiswa jika mereka masih punya pinjaman buku yang belum dikembalikan.  
Berikut adalah langkah demi langkah implementasi *clean modular monolith* di Frappe.

## 

## **Langkah 1: Struktur Modul (Module Def)**

Kita buat satu App bernama campus\_nexus. Di dalamnya, kita buat dua **Module Def**: Academic dan Library.  
Struktur foldernya di dalam *backend* akan otomatis terlihat seperti ini:

Plaintext  
campus\_nexus/  
├── hooks.py  
└── campus\_nexus/  
    ├── academic/          \# Domain Modul Akademik  
    │   ├── api.py         \# API Resmi Modul Akademik (Pintu Masuk)  
    │   └── doctype/  
    │       └── student/   \# DocType Mahasiswa  
    └── library/           \# Domain Modul Perpustakaan  
        ├── api.py         \# API Resmi Modul Perpustakaan (Pintu Masuk)  
        └── doctype/  
            └── book\_loan/ \# DocType Peminjaman Buku

## **Langkah 2: Desain DocType & Denormalisasi Terkontrol**

### **1\. DocType Student (Modul: Academic)**

Memiliki field standar:

11. student\_name (Data)  
12. status (Select: Active, Suspended, Graduated)

### 

### **2\. DocType Book Loan (Modul: Library)**

Di sinilah kebiasaan lama (banyak JOIN) kita geser. Kita butuh ID Mahasiswa dan Nama Mahasiswa.

* student (Link \-\> ke DocType Student). *Ini hanya menyimpan ID (Foreign Key).*  
* student\_name (Data) \-\> Di level UI/Field, kita set properti **Fetch From** menjadi: student.student\_name.

💡 **Benang Merah \#1 (Data Ownership):** Saat dokumen Book Loan disimpan, Frappe akan menyalin teks nama mahasiswa ke tabel Perpustakaan. Modul Perpustakaan **tidak perlu** melakukan SQL JOIN ke tabel Student di kemudian hari hanya untuk mencari tahu siapa nama peminjamnya saat membuat laporan atau list view.

## 

## **Langkah 3: Membuat Kontrak Antar-Modul (API Level Kode)**

Bayangkan di Modul Akademik, ketika mahasiswa mau mengajukan kelulusan, sistem harus mengecek apakah mahasiswa tersebut punya pinjaman buku yang menunggak.  
**Anti-Pattern (Cara Lama \- ERPNext Style):**  
Developer menulis kueri langsung di dalam student.py seperti ini:

Python  
\# DI DALAM academic/doctype/student/student.py \-\> INI SALAH (Tight Coupling)  
def check\_clearance(self):  
    \# Langsung menembak tabel milik modul lain dengan kueri SQL  
    loans \= frappe.db.sql("SELECT count(\*) FROM \`tabBook Loan\` WHERE student=%s AND status='Borrowed'", self.name)  
    if loans\[0\]\[0\] \> 0:  
        frappe.throw("Tidak bisa lulus, ada pinjaman buku\!")

*Kenapa ini salah? Jika suatu saat Modul Perpustakaan mengubah nama DocType Book Loan menjadi Buku Pinjam, atau mengubah status 'Borrowed' menjadi 'Dipinjam', maka Modul Akademik akan error seketika.*

**Best Practice (Cara Baru \- Modular Monolith):**  
**1\. Modul Perpustakaan menyediakan pintu masuk resmi (library/api.py):**

Python  
\# campus\_nexus/library/api.py

def has\_active\_loans(student\_id):  
    """  
    Kontrak Resmi: Modul lain boleh memanggil fungsi ini.  
    Input: student\_id (String)  
    Output: Boolean  
    """  
    \# Logika internal internal perpustakaan bebas diubah kapan saja di sini  
    count \= frappe.db.count("Book Loan", filters={  
        "student": student\_id,  
        "status": "Borrowed"  
    })  
    return count \> 0

**2\. Modul Akademik memanggil kontrak tersebut (academic/doctype/student/student.py):**

Python  
\# campus\_nexus/academic/doctype/student/student.py  
import frappe  
from frappe.model.document import Document  
\# Import fungsi dari API resmi, bukan dari DocType internal  
from campus\_nexus.library.api import has\_active\_loans 

class Student(Document):  
    def validate(self):  
        if self.status \== "Graduated":  
            \# Memanggil lewat kontrak kode, bukan kueri database langsung  
            if has\_active\_loans(self.name):  
                frappe.throw("Kelulusan ditolak\! Mahasiswa masih memiliki pinjaman buku di Perpustakaan.")

## **Langkah 4: Komunikasi Berbasis Event (Frappe Hooks)**

Sekarang ada kasus sebaliknya: Jika ada mahasiswa yang melakukan pelanggaran berat di Perpustakaan (misal merusak fasilitas), Modul Perpustakaan ingin otomatis mengubah status Mahasiswa di Modul Akademik menjadi Suspended (Skorsing).  
Kita tidak ingin kode Perpustakaan langsung melakukan frappe.set\_value('Student', ...) karena itu melanggar batas domain. Kita akan gunakan **Event-Driven**.

**1\. Di Modul Perpustakaan, buat Event Trigger saat Sanksi Dibuat:**  
Misalnya ada DocType LibrarySanction. Ketika di-submit, kita jalankan event.

Python  
\# campus\_nexus/library/doctype/library\_sanction/library\_sanction.py  
class LibrarySanction(Document):  
    def on\_submit(self):  
        \# Memicu event internal aplikasi  
        frappe.get\_doc("Library Sanction", self.name).publish\_video\_and\_notification()   
        \# Atau cara termudah di Frappe, biarkan hooks menangkap hook standard on\_submit

**2\. Daftarkan hubungan tersebut di hooks.py (Pusat Kendali Monolit):**

Python  
\# campus\_nexus/hooks.py

doc\_events \= {  
    "Library Sanction": {  
        "on\_submit": "campus\_nexus.academic.api.suspend\_student\_on\_sanction"  
    }  
}

**3\. Modul Akademik menangkap event tersebut di academic/api.py:**

Python  
\# campus\_nexus/academic/api.py  
import frappe

def suspend\_student\_on\_sanction(doc, method):  
    """  
    Fungsi ini dipicu oleh hooks ketika ada Sanksi Perpustakaan yang disubmit.  
    """  
    student\_id \= doc.student  
    \# Modul akademik mengurus datanya sendiri berdasarkan pemberitahuan dari luar  
    student \= frappe.get\_doc("Student", student\_id)  
    student.status \= "Suspended"  
    student.add\_comment("Comment", f"Diskors otomatis karena sanksi perpustakaan: {doc.reason}")  
    student.save()

### **Kesimpulan dari Contoh Ini**

Dengan menerapkan pola di atas:

* **Tidak ada satupun kueri JOIN lintas tabel** antara tabel Akademik dan Perpustakaan.  
* Modul Perpustakaan aman dari perubahan struktur internal Modul Akademik, begitupun sebaliknya. Mereka hanya terikat pada fungsi di api.py dan konfigurasi di hooks.py.  
* Aplikasi Anda berjalan di **satu database yang sama (Monolith)**, namun kodenya tertata rapi seperti **Microservices (Modular)**.

