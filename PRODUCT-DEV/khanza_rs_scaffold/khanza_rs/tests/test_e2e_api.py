# khanza_rs/tests/test_e2e_api.py
# ============================================================================
# E2E API UNIT TESTS — khanza_rs
# ============================================================================
# Test suite to validate syntax, imports, and core logic (mocked db)
# of the 4 key SatuSehat-aligned Module Def APIs.
# ============================================================================

import unittest
from unittest.mock import MagicMock, patch

# Mock frappe module before importing APIs to avoid missing DocType DB errors
import sys
mock_frappe = MagicMock()
sys.modules['frappe'] = mock_frappe
mock_frappe._ = lambda x: x
mock_frappe.whitelist = lambda *args, **kwargs: lambda fn: fn
def mock_throw(msg, *args, **kwargs):
    raise Exception(msg)
mock_frappe.throw = mock_throw

mock_model = MagicMock()
sys.modules['frappe.model'] = mock_model
sys.modules['frappe.model.document'] = mock_model
mock_model.Document = MagicMock

mock_redis = MagicMock()
sys.modules['redis'] = mock_redis


# Now import the APIs
from khanza_rs.pasien_core.api import get_pasien_info, get_registrasi_aktif
from khanza_rs.keuangan.api import _recalculate_billing, add_tindakan_to_billing
from khanza_rs.farmasi.api import get_total_biaya_resep


class TestPasienCoreAPI(unittest.TestCase):
    @patch('sys.modules')
    def test_get_pasien_info(self, mock_sys):
        # Setup mock doc
        mock_doc = MagicMock()
        mock_doc.no_rkm_medis = "000001"
        mock_doc.nm_pasien = "Budi Wiyono"
        mock_doc.no_ktp = "3172000000000001"
        mock_doc.jk = "L"
        mock_doc.tgl_lahir = "1980-01-01"
        mock_doc.alamat = "Jakarta"
        mock_doc.no_peserta = "0001234567890"
        mock_doc.gol_darah = "O"
        mock_doc.no_tlp = "08123456789"
        
        mock_frappe.get_doc.return_value = mock_doc
        
        # Run API
        result = get_pasien_info("000001")
        
        # Verify
        mock_frappe.get_doc.assert_called_with("Pasien", "000001")
        self.assertEqual(result["no_rkm_medis"], "000001")
        self.assertEqual(result["nm_pasien"], "Budi Wiyono")
        self.assertEqual(result["no_ktp"], "3172000000000001")
        self.assertEqual(result["no_peserta"], "0001234567890")

    def test_pasien_validation_valid_nik(self):
        from khanza_rs.pasien_core.doctype.pasien.pasien import Pasien
        p = Pasien()
        p.no_ktp = "1234567890123456"
        p.validate()

    def test_pasien_validation_invalid_nik(self):
        from khanza_rs.pasien_core.doctype.pasien.pasien import Pasien
        p = Pasien()
        p.no_ktp = "12345678"
        with self.assertRaises(Exception):
            p.validate()


class TestFarmasiAPI(unittest.TestCase):
    @patch('khanza_rs.farmasi.api.get_resep_by_no_rawat')
    def test_get_total_biaya_resep(self, mock_get_resep):
        # Mock resep data
        mock_get_resep.return_value = [
            {
                "no_resep": "RXP001",
                "items": [
                    {"subtotal": 15000},
                    {"subtotal": 25000}
                ]
            },
            {
                "no_resep": "RXP002",
                "items": [
                    {"subtotal": 10000}
                ]
            }
        ]
        
        # Run API
        total = get_total_biaya_resep("2026/07/08/000001")
        
        # Verify
        self.assertEqual(total, 50000)


class TestKeuanganAPI(unittest.TestCase):
    def test_recalculate_billing(self):
        # Setup mock billing document with items
        mock_billing = MagicMock()
        mock_billing.total_registrasi = 50000
        mock_billing.diskon = 10000
        
        item_tindakan = MagicMock()
        item_tindakan.jenis = "Tindakan"
        item_tindakan.subtotal = 150000
        
        item_obat = MagicMock()
        item_obat.jenis = "Obat"
        item_obat.subtotal = 80000
        
        mock_billing.items = [item_tindakan, item_obat]
        
        # Run internal recalculation logic
        _recalculate_billing(mock_billing)
        
        # Verify totals mapped correctly
        self.assertEqual(mock_billing.total_tindakan, 150000)
        self.assertEqual(mock_billing.total_obat, 80000)
        self.assertEqual(mock_billing.total_lab, 0)
        self.assertEqual(mock_billing.total_radiologi, 0)
        
        # Grand Total = reg (50k) + tindakan (150k) + obat (80k) - diskon (10k) = 270k
        self.assertEqual(mock_billing.grand_total, 270000)


        self.assertEqual(mock_billing.grand_total, 270000)


class TestRawatInapAPI(unittest.TestCase):
    @patch('khanza_rs.rawat_inap.api.frappe')
    def test_checkin_pasien_ranap(self, mock_f):
        # Mock DB checks
        mock_f.db.exists.return_value = False
        mock_f.utils.today.return_value = "2026-07-08"
        mock_f.utils.nowtime.return_value = "15:00:00"
        
        mock_doc = MagicMock()
        mock_doc.name = "RI-00001"
        mock_f.get_doc.return_value = mock_doc
        
        # Import dynamically to ensure mocked frappe is used
        from khanza_rs.rawat_inap.api import checkin_pasien_ranap
        
        res = checkin_pasien_ranap("2026/07/08/000001", "KMR-01", "Diagnosa Awal")
        self.assertEqual(res, "RI-00001")
        mock_f.get_doc.assert_called_once()


class TestPenunjangMedisAPI(unittest.TestCase):
    @patch('khanza_rs.penunjang_medis.api.frappe')
    def test_create_permintaan_lab(self, mock_f):
        mock_f.utils.today.return_value = "2026-07-08"
        mock_f.utils.nowtime.return_value = "15:00:00"
        
        mock_doc = MagicMock()
        mock_doc.name = "REQ-LAB-01"
        mock_f.get_doc.return_value = mock_doc
        
        from khanza_rs.penunjang_medis.api import create_permintaan_lab
        
        res = create_permintaan_lab("2026/07/08/000001", "Dr. Budi", "Check DB")
        self.assertEqual(res, "REQ-LAB-01")
        mock_f.get_doc.assert_called_once()


class TestBridgingAPI(unittest.TestCase):
    @patch('khanza_rs.bridging.api.frappe')
    def test_create_satusehat_views(self, mock_f):
        from khanza_rs.bridging.api import create_satusehat_views
        create_satusehat_views()
        self.assertEqual(mock_f.db.sql.call_count, 40)

    @patch('khanza_rs.bridging.api.frappe')
    def test_get_satusehat_config(self, mock_f):
        from khanza_rs.bridging.api import get_satusehat_config
        mock_f.get_doc.side_effect = Exception("Not found")
        config = get_satusehat_config()
        self.assertEqual(config["client_id"], "nE9q36mwQeGapnlviMgIljH5tZXd8QdtXyWRZdYLdRdqLNZX")

    @patch('khanza_rs.bridging.api.frappe')
    def test_publish_satusehat_event(self, mock_f):
        from khanza_rs.bridging.api import publish_satusehat_event
        import redis
        mock_r = MagicMock()
        redis.Redis.return_value = mock_r
        mock_f.utils.now.return_value = '2026-07-09 11:00:00'
        res = publish_satusehat_event("2026/07/08/000001", "Encounter")
        self.assertTrue(res["success"])
        mock_r.publish.assert_called_once()

    @patch('khanza_rs.bridging.api.frappe')
    def test_map_drug_to_kfa(self, mock_f):
        from khanza_rs.bridging.api import map_drug_to_kfa
        res = map_drug_to_kfa("B001", "930001", "Paracetamol 500mg")
        self.assertTrue(res["success"])
        self.assertEqual(mock_f.db.sql.call_count, 2)


if __name__ == '__main__':
    unittest.main()



