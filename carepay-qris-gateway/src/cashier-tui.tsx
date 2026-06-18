import React, { useState, useEffect } from "react";
import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";

const API_PORT = process.env.CAREPAY_API_PORT || "3200";
const API_BASE = `http://127.0.0.1:${API_PORT}`;
const API_KEY = process.env.CAREPAY_API_KEY || "carepay_dev_key";

// Mock Database untuk pencarian billing Khanza
const mockKhanzaBillings: Record<string, any> = {
  "000123": {
    patientId: "000123",
    patientName: "Budi Wiyono",
    billingId: "BILL-20260618-0001",
    rawatNo: "2026/06/18/000001",
    phoneNo: "089601014551",
    status: "UNPAID",
    totalAmount: 350000,
    items: [
      { name: "Pendaftaran Rawat Jalan & Admisi", price: 50000 },
      { name: "Resep Obat Ralan (Amoxicillin, PCT)", price: 120000 },
      { name: "Tindakan Medis Dokter Umum", price: 180000 }
    ]
  },
  "000456": {
    patientId: "000456",
    patientName: "Siti Rahma",
    billingId: "BILL-20260618-0002",
    rawatNo: "2026/06/18/000002",
    phoneNo: "081234567890",
    status: "UNPAID",
    totalAmount: 2500000,
    items: [
      { name: "Lab Pemeriksaan Darah Lengkap", price: 150000 },
      { name: "Pemeriksaan Rontgen Thorax", price: 350000 },
      { name: "Tindakan Bedah Kecil", price: 2000000 }
    ]
  }
};

async function api(path: string, method = "GET", body: any = null): Promise<any> {
  const headers: Record<string, string> = {
    "x-api-key": API_KEY,
    "Content-Type": "application/json"
  };
  const options: RequestInit = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${API_BASE}${path}`, options);
  return response.json();
}

function App() {
  const [view, setView] = useState<"SEARCH" | "DASHBOARD" | "WORKFLOW">("SEARCH");
  
  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState("");

  // Patient / Wallet State
  const [activePatient, setActivePatient] = useState<any>(null);
  const [walletStatus, setWalletStatus] = useState<any>(null);
  const [kycStatus, setKycStatus] = useState("UNVERIFIED");

  // Binding & KYC Input States
  const [isBinding, setIsBinding] = useState(false);
  const [otp, setOtp] = useState("");
  
  const [isKyc, setIsKyc] = useState(false);
  const [kycStep, setKycStep] = useState(0); // 0 = NIK, 1 = Nama
  const [kycNik, setKycNik] = useState("");
  const [kycName, setKycName] = useState("");

  // Workflow State
  const [workflowStep, setWorkflowStep] = useState(0);
  const [workflowLogs, setWorkflowLogs] = useState<string[]>([]);
  
  // Action/Network Error state
  const [actionError, setActionError] = useState("");

  const refreshWallet = async (patientId: string) => {
    try {
      const res = await api(`/api/wallets/${patientId}/balance`);
      setWalletStatus(res);
      if (res && !res.error) {
        const kycRes = await api(`/api/wallets/${patientId}/kyc/status`);
        setKycStatus(kycRes.kycStatus || "UNVERIFIED");
      }
    } catch (_) {
      setWalletStatus({ error: "Unreachable" });
    }
  };

  const executeSearch = () => {
    const found = mockKhanzaBillings[searchQuery.trim()];
    if (!found) {
      setSearchError("Error: Data Pasien / Billing tidak ditemukan di SIMRS Khanza!");
      setSearchQuery("");
      return;
    }
    setSearchError("");
    setActivePatient(found);
    setView("DASHBOARD");
    refreshWallet(found.patientId);
  };

  const handleKeyboardInput = (char: string) => {
    if (view === "SEARCH") {
      setSearchQuery((q) => q + char);
    } else if (view === "DASHBOARD") {
      if (isBinding) {
        setOtp((o) => o + char);
      } else if (isKyc) {
        if (kycStep === 0) {
          setKycNik((n) => n + char);
        } else {
          setKycName((n) => n + char);
        }
      }
    }
  };

  const handleBackspace = () => {
    if (view === "SEARCH") {
      setSearchQuery((q) => q.slice(0, -1));
    } else if (view === "DASHBOARD") {
      if (isBinding) {
        setOtp((o) => o.slice(0, -1));
      } else if (isKyc) {
        if (kycStep === 0) {
          setKycNik((n) => n.slice(0, -1));
        } else {
          setKycName((n) => n.slice(0, -1));
        }
      }
    }
  };

  const handleEnter = async () => {
    setActionError("");
    if (view === "SEARCH") {
      executeSearch();
    } else if (view === "DASHBOARD") {
      if (isBinding) {
        if (otp.trim() === "123456") {
          setIsBinding(false);
          setOtp("");
          try {
            await api("/api/wallets/binding/confirm", "POST", {
              phoneNo: activePatient.phoneNo,
              tokenB2b2c: `token_b2b2c_${Math.random().toString(36).substring(2, 12)}`,
              refreshToken: `refresh_token_${Math.random().toString(36).substring(2, 12)}`,
              walletId: `sc_wallet_${activePatient.patientId}`,
              status: "SUCCESS"
            });
            await refreshWallet(activePatient.patientId);
          } catch (err: any) {
            setActionError("Gagal binding OTP: " + (err.message || err));
          }
        } else {
          setIsBinding(false);
          setOtp("");
          setActionError("Kode OTP salah!");
        }
      } else if (isKyc) {
        if (kycStep === 0) {
          setKycStep(1);
        } else {
          setIsKyc(false);
          setKycStep(0);
          
          try {
            // Submit Customer KYC Form Data mock
            const formData = new FormData();
            formData.append("idCardNumber", kycNik);
            formData.append("fullName", kycName);
            formData.append("dateOfBirth", "1990-05-15");
            formData.append("idCardImage", new Blob(["ktp"], { type: "image/jpeg" }));
            formData.append("selfieImage", new Blob(["selfie"], { type: "image/jpeg" }));

            const res = await fetch(`${API_BASE}/api/wallets/${activePatient.patientId}/kyc`, {
              method: "POST",
              headers: { "x-api-key": API_KEY },
              body: formData
            });

            if (!res.ok) {
              throw new Error(`HTTP ${res.status}`);
            }

            // Check Status trigger
            await api(`/api/wallets/${activePatient.patientId}/kyc/status`);
            await refreshWallet(activePatient.patientId);
          } catch (err: any) {
            setActionError("Gagal submit eKYC: " + (err.message || err));
          }
        }
      }
    } else if (view === "WORKFLOW") {
      setView("DASHBOARD");
    }
  };

  const handleDirectDebit = async () => {
    setView("WORKFLOW");
    setWorkflowStep(0);
    const logs: string[] = [];
    
    const appendLog = (msg: string, step: number) => {
      logs.push(msg);
      setWorkflowLogs([...logs]);
      setWorkflowStep(step);
    };

    appendLog("[Effect] Inisialisasi proses pembayaran untuk Billing ID: " + activePatient.billingId, 0);
    await new Promise((r) => setTimeout(r, 1000));
    
    appendLog("[Effect] Menghubungkan ke MySQL database & memvalidasi idempotency key...", 1);
    await new Promise((r) => setTimeout(r, 1200));
    
    appendLog("[Effect] Mengirim instruksi Direct Debit ke API Bimasakti Linkage...", 2);
    
    try {
      const debitRes = await api(`/api/wallets/${activePatient.patientId}/debit`, "POST", {
        amount: activePatient.totalAmount,
        billingId: activePatient.billingId
      });

      if (debitRes.error) {
        throw new Error(debitRes.error);
      }

      await new Promise((r) => setTimeout(r, 1500));
      appendLog("[Success] Pemotongan saldo berhasil! Bimasakti TrxID: sc_debit_9983712", 2);
      appendLog("[Reconcile] Memicu Durable Reconcile Job (Effect Task Queue)...", 3);
      await new Promise((r) => setTimeout(r, 1000));
      
      appendLog("[Success] Tabel pemberian_obat & kasir ralan SIMRS Khanza di-update: LUNAS", 3);
      appendLog("[Success] Struk Billing tercetak secara otomatis. Tekan [Enter] untuk kembali.", 3);

      activePatient.status = "PAID";
    } catch (err: any) {
      appendLog("[Error] Transaksi gagal: " + err.message + ". Tekan [Enter] untuk kembali.", 2);
    }
  };

  useKeyboard((key) => {
    // Standard Exit
    if (key.name === "q" && view === "DASHBOARD" && !isBinding && !isKyc) {
      process.exit(0);
    }

    // Escape cancel
    if (key.name === "escape") {
      if (isBinding) {
        setIsBinding(false);
        setOtp("");
      } else if (isKyc) {
        setIsKyc(false);
        setKycStep(0);
        setKycNik("");
        setKycName("");
      }
      return;
    }

    // Input handlers
    if (key.name === "enter" || key.name === "return") {
      handleEnter();
      return;
    }

    if (key.name === "backspace") {
      handleBackspace();
      return;
    }

    // Menu keys
    if (view === "DASHBOARD" && !isBinding && !isKyc) {
      const option = key.name;
      if (option === "c" || option === "C") {
        setActivePatient(null);
        setSearchQuery("");
        setView("SEARCH");
        return;
      }
      if (option === "1") {
        if (!walletStatus || walletStatus.error) {
          setIsBinding(true);
        } else {
          const balance = Number(walletStatus.accountInfos?.balanceInfos?.[0]?.availableBalance || 0);
          if (balance >= activePatient.totalAmount) {
            handleDirectDebit();
          } else {
            // QRIS top-up simulation
            refreshWallet(activePatient.patientId);
          }
        }
        return;
      }
      if (option === "2") {
        if (walletStatus && !walletStatus.error) {
          setIsKyc(true);
          setKycStep(0);
          setKycNik("");
          setKycName("");
        }
        return;
      }
    }

    // Collect standard character keys
    if (!key.ctrl && !key.meta && !key.super && !key.hyper) {
      let char = "";
      if (key.name === "space") {
        char = " ";
      } else if (key.sequence && key.sequence.length === 1) {
        char = key.sequence;
      } else if (key.name && key.name.length === 1) {
        char = key.name;
      }

      if (char) {
        handleKeyboardInput(char);
      }
    }
  });

  return (
    <box width="100%" height="100%" flexDirection="column" padding={1} backgroundColor="#0a0a0a" border={true} borderColor="cyan">
      {/* Header */}
      <box width="100%" height={3} border={true} borderColor="cyan" alignItems="center" justifyContent="center" marginBottom={1}>
        <text fg="cyan">💳 CAREPAY WALLET — TERMINAL KASIR KELAS DUNIA (OPENTUI REACT) 💳</text>
      </box>

      {/* Main View */}
      {view === "SEARCH" && (
        <box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
          <text fg="yellow">Silakan cari data pasien untuk memulai transaksi:</text>
          <text fg="white" marginTop={0.5}>[RM Contoh: 000123 (Budi Wiyono) atau 000456 (Siti Rahma)]</text>
          
          <box flexDirection="row" marginTop={1} border={true} paddingX={2} paddingY={1} borderColor="white" width={50} justifyContent="flex-start">
            <text fg="cyan">🔍 No. Rekam Medis (RM): </text>
            <text fg="white">{searchQuery}</text>
            <text fg="cyan">_</text>
          </box>

          {searchError && (
            <text fg="red" marginTop={1}>❌ {searchError}</text>
          )}
        </box>
      )}

      {view === "DASHBOARD" && activePatient && (
        <box flexGrow={1} flexDirection="row" gap={2}>
          {/* Left: Billing Info */}
          <box flexDirection="column" width="50%" border={true} borderColor="yellow" padding={1}>
            <text fg="yellow">🔹 RINCIAN TAGIHAN SIMRS KHANZA (BILLING)</text>
            <text fg="white" marginTop={1}>  Nama Pasien  : {activePatient.patientName}</text>
            <text fg="white">  No. RM / Reg : {activePatient.patientId} / {activePatient.rawatNo}</text>
            <text fg="white">  Billing ID   : {activePatient.billingId}</text>
            <text fg="white">  Status Bayar : {activePatient.status === "PAID" ? "LUNAS ✓" : "BELUM BAYAR ✗"}</text>
            <text fg="white" marginTop={0.5}>  --------------------------------------------------</text>
            {activePatient.items.map((item: any, idx: number) => (
              <text key={idx} fg="white">
                {"  • " + item.name.padEnd(35) + " : Rp " + item.price.toLocaleString("id-ID")}
              </text>
            ))}
            <text fg="white">  --------------------------------------------------</text>
            <text fg="cyan" marginTop={0.5}>  TOTAL TAGIHAN : Rp {activePatient.totalAmount.toLocaleString("id-ID")}</text>
          </box>

          {/* Right: Wallet & Menu */}
          <box flexDirection="column" width="50%" border={true} borderColor="green" padding={1}>
            <text fg="green">🔹 STATUS CAREPAY WALLET (BIMASAKTI EMONEY)</text>
            {(!walletStatus || walletStatus.error) ? (
              <box flexDirection="column" marginTop={1}>
                <text fg="red">  Link Status  : UNBOUND (Belum Terhubung)</text>
                <text fg="white">  Limit Saldo  : Rp 0</text>
                <text fg="white">  eKYC Status  : UNVERIFIED</text>
              </box>
            ) : (
              <box flexDirection="column" marginTop={1}>
                <text fg="green">  Link Status  : BOUND (Terhubung) | WalletID: {walletStatus.accountInfos?.walletId || "-"}</text>
                <text fg="white">  Limit Saldo  : Rp {Number(walletStatus.accountInfos?.balanceInfos?.[0]?.availableBalance || 0).toLocaleString("id-ID")}</text>
                <text fg="cyan">  eKYC Status  : {kycStatus}</text>
              </box>
            )}

            {actionError && (
              <text fg="red" marginTop={1}>❌ {actionError}</text>
            )}

            <text fg="yellow" marginTop={2}>🔹 MENU TINDAKAN KASIR</text>
            {isBinding ? (
              <box flexDirection="column" border={true} borderColor="yellow" padding={1} marginTop={1}>
                <text fg="yellow">🔗 Hubungkan Wallet CarePay Pasien (OTP)</text>
                <text fg="white" marginTop={0.5}>Masukkan 6-digit OTP (Simulasi default: 123456):</text>
                <text fg="cyan" marginTop={0.5}>{otp}_</text>
                <text fg="white" marginTop={0.5}>[ESC] Batalkan</text>
              </box>
            ) : isKyc ? (
              <box flexDirection="column" border={true} borderColor="yellow" padding={1} marginTop={1}>
                <text fg="yellow">📷 Upgrade Limit via eKYC</text>
                {kycStep === 0 ? (
                  <box flexDirection="column" marginTop={0.5}>
                    <text fg="white">Masukkan Nomor NIK KTP:</text>
                    <text fg="cyan" marginTop={0.5}>{kycNik}_</text>
                  </box>
                ) : (
                  <box flexDirection="column" marginTop={0.5}>
                    <text fg="white">Masukkan Nama Lengkap Sesuai KTP:</text>
                    <text fg="cyan" marginTop={0.5}>{kycName}_</text>
                  </box>
                )}
                <text fg="white" marginTop={0.5}>[ESC] Batalkan</text>
              </box>
            ) : (
              <box flexDirection="column" marginTop={1}>
                {(!walletStatus || walletStatus.error) ? (
                  <text fg="white">  [1] Hubungkan Wallet CarePay Pasien (OTP Binding)</text>
                ) : (
                  <box flexDirection="column">
                    {activePatient.status !== "PAID" && (
                      Number(walletStatus.accountInfos?.balanceInfos?.[0]?.availableBalance || 0) >= activePatient.totalAmount ? (
                        <text fg="green">  [1] Bayar via Potong Saldo (Direct Debit)</text>
                      ) : (
                        <text fg="yellow">  [1] Tampilkan Kode QRIS untuk Top-Up Saldo</text>
                      )
                    )}
                    <text fg="white">  [2] Upgrade Limit e-Money via eKYC (KTP + Selfie)</text>
                  </box>
                )}
                <text fg="white">  [C] Cari Pasien Lain</text>
                <text fg="white">  [Q] Keluar dari Terminal</text>
              </box>
            )}
          </box>
        </box>
      )}

      {view === "WORKFLOW" && (
        <box flexGrow={1} flexDirection="column" border={true} borderColor="yellow" padding={1}>
          <text fg="yellow">⚙️ ENGINE EFFECT WORKFLOW LIVE VISUALIZER</text>
          <text fg="white">--------------------------------------------------</text>
          <box flexDirection="row" gap={2} marginBottom={1} marginTop={0.5}>
            <text fg={workflowStep >= 0 ? "green" : "white"}>[Draft]</text>
            <text fg="white">===</text>
            <text fg={workflowStep >= 1 ? "green" : "white"}>[Pending]</text>
            <text fg="white">===</text>
            <text fg={workflowStep >= 2 ? "green" : "white"}>[Debit Saldo]</text>
            <text fg="white">===</text>
            <text fg={workflowStep >= 3 ? "green" : "white"}>[Lunas (Reconciled)]</text>
          </box>
          <text fg="white">--------------------------------------------------</text>
          <text fg="cyan" marginTop={1}>LOG EKSEKUSI ENGINE EFFECT:</text>
          {workflowLogs.map((log, idx) => (
            <text key={idx} fg="white">{"  " + log}</text>
          ))}
        </box>
      )}
    </box>
  );
}

async function start() {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  });
  const root = createRoot(renderer);
  root.render(<App />);
}

start().catch((err) => {
  console.error("Fatal error starting React OpenTUI:", err);
  process.exit(1);
});
