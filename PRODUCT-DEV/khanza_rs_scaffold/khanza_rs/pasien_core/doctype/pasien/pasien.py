import re
import frappe
from frappe.model.document import Document

class Pasien(Document):
    def validate(self):
        if self.get("no_ktp"):
            # Check KTP contains exactly 16 digits of numbers
            if not re.match(r"^\d{16}$", str(self.no_ktp)):
                frappe.throw("Nomor KTP (NIK) harus terdiri dari tepat 16 digit angka!")
