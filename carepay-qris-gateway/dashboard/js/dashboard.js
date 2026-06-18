// CarePay Dashboard - Client-side JavaScript
const API_KEY = 'carepay_dev_key_change_me';
const API_BASE = window.location.origin;
let currentPaymentId = null;
let pollTimer = null;

// === Navigation ===
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const page = item.dataset.page;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    item.classList.add('active');
    document.getElementById(`page-${page}`).classList.add('active');
    
    const titles = {
      overview: ['Overview', 'Dashboard pembayaran real-time'],
      payments: ['Pembayaran', 'Daftar seluruh transaksi'],
      cashier: ['Kasir & Wallet', 'Manajemen Dompet Pasien & Pembayaran Langsung'],
      'qr-generate': ['Generate QRIS', 'Buat pembayaran QRIS baru'],
      reconciliation: ['Rekonsiliasi', 'Status reconciliation jobs'],
      health: ['Health Monitor', 'Status sistem dan koneksi'],
    };
    document.getElementById('page-title').textContent = titles[page]?.[0] || page;
    document.getElementById('page-subtitle').textContent = titles[page]?.[1] || '';
    
    if (page === 'payments') loadPayments();
    if (page === 'reconciliation') loadReconJobs();
    if (page === 'health') loadHealth();
  });
});

// === Clock ===
function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}
setInterval(updateClock, 1000);
updateClock();

// === API Helpers ===
async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      ...opts.headers,
    },
  });
  return res.json();
}

// === Refresh Metrics ===
async function refreshMetrics() {
  try {
    const metrics = await api('/api/health/metrics');
    let total = 0, pending = 0, paid = 0, failed = 0, reconciled = 0, revenue = 0;
    
    if (metrics.today) {
      for (const row of metrics.today) {
        total += Number(row.count);
        if (row.status === 'PENDING') pending = Number(row.count);
        if (row.status === 'PAID' || row.status === 'RECONCILED' || row.status === 'RECONCILING') {
          paid += Number(row.count);
          revenue += Number(row.total_amount);
        }
        if (row.status === 'RECONCILED') reconciled = Number(row.count);
        if (row.status === 'FAILED' || row.status === 'EXPIRED') failed += Number(row.count);
      }
    }

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-pending').textContent = pending;
    document.getElementById('stat-paid').textContent = paid;
    document.getElementById('stat-failed').textContent = failed;
    document.getElementById('stat-revenue').textContent = `Rp ${revenue.toLocaleString('id-ID')}`;
    document.getElementById('stat-reconciled').textContent = reconciled;
  } catch (e) {
    console.error('Metrics error:', e);
  }
}

// === Refresh Payments ===
async function refreshPayments() {
  try {
    const data = await api('/api/payments?limit=10');
    const tbody = document.getElementById('recent-payments-body');
    tbody.innerHTML = '';
    for (const p of (data.data || [])) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family:monospace;font-size:0.75rem">${p.payment_request_id.substring(0, 16)}…</td>
        <td>${p.khanza_billing_id}</td>
        <td>${p.patient_name || '-'}</td>
        <td style="font-weight:600">Rp ${Number(p.amount).toLocaleString('id-ID')}</td>
        <td><span class="badge badge-${p.status.toLowerCase()}">${p.status}</span></td>
        <td style="font-size:0.75rem">${new Date(p.created_at).toLocaleString('id-ID')}</td>
        <td><button class="btn btn-sm" onclick="showDetail('${p.payment_request_id}')">Detail</button></td>
      `;
      tbody.appendChild(tr);
    }
    if (!data.data?.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem">Belum ada transaksi</td></tr>';
    }
  } catch (e) {
    console.error('Payments error:', e);
  }
}

// === Load Payments (full list) ===
async function loadPayments() {
  const status = document.getElementById('filter-status')?.value || '';
  const params = status ? `?status=${status}&limit=50` : '?limit=50';
  try {
    const data = await api(`/api/payments${params}`);
    const tbody = document.getElementById('payments-body');
    tbody.innerHTML = '';
    for (const p of (data.data || [])) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family:monospace;font-size:0.75rem">${p.payment_request_id.substring(0, 20)}…</td>
        <td>${p.khanza_billing_id}</td>
        <td>${p.no_rawat || '-'}</td>
        <td>${p.patient_name || '-'}</td>
        <td style="font-weight:600">Rp ${Number(p.amount).toLocaleString('id-ID')}</td>
        <td><span class="badge badge-${p.status.toLowerCase()}">${p.status}</span></td>
        <td style="font-size:0.75rem">${new Date(p.created_at).toLocaleString('id-ID')}</td>
        <td><button class="btn btn-sm" onclick="showDetail('${p.payment_request_id}')">Detail</button></td>
      `;
      tbody.appendChild(tr);
    }
  } catch (e) {
    console.error('Load payments error:', e);
  }
}

// === Generate QRIS ===
async function generateQRIS(event) {
  event.preventDefault();
  const body = {
    billing_id: document.getElementById('qr-billing-id').value,
    no_rawat: document.getElementById('qr-no-rawat').value || undefined,
    no_rkm_medis: document.getElementById('qr-no-rkm').value || undefined,
    patient_name: document.getElementById('qr-patient').value || undefined,
    amount: parseInt(document.getElementById('qr-amount').value),
    description: document.getElementById('qr-description').value || 'Pembayaran Rawat Jalan',
  };

  try {
    const result = await api('/api/payments/qris', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (result.error) {
      alert('Error: ' + result.error);
      return;
    }

    currentPaymentId = result.payment_request_id;
    document.getElementById('qr-result').style.display = 'block';
    document.getElementById('qr-image').src = result.qris_url;
    document.getElementById('qr-display-amount').textContent = `Rp ${Number(result.amount).toLocaleString('id-ID')}`;
    document.getElementById('qr-display-status').innerHTML = `<span class="badge badge-${result.status.toLowerCase()}">${result.status}</span>`;
    document.getElementById('qr-display-id').textContent = result.payment_request_id;
    document.getElementById('qr-display-expires').textContent = `Expires: ${new Date(result.expires_at).toLocaleString('id-ID')}`;
    
    if (result.idempotent) {
      document.getElementById('qr-display-expires').textContent += ' (idempotent - existing)';
    }

    refreshMetrics();
    refreshPayments();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

// === Check Payment Status ===
async function checkPaymentStatus() {
  if (!currentPaymentId) return;
  const data = await api(`/api/payments/${currentPaymentId}`);
  document.getElementById('qr-display-status').innerHTML = `<span class="badge badge-${data.status.toLowerCase()}">${data.status}</span>`;
  refreshMetrics();
}

// === Simulate Paid ===
async function simulatePaid() {
  if (!currentPaymentId) return;
  try {
    const result = await api(`/api/payments/${currentPaymentId}/simulate-paid`, { method: 'POST' });
    document.getElementById('qr-display-status').innerHTML = `<span class="badge badge-${result.status.toLowerCase()}">${result.status}</span>`;
    refreshMetrics();
    refreshPayments();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

// === Show Detail Modal ===
async function showDetail(id) {
  const payment = await api(`/api/payments/${id}`);
  document.getElementById('modal-title').textContent = `Payment ${id.substring(0, 20)}…`;
  document.getElementById('modal-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
      <div><strong>Billing ID:</strong><br>${payment.khanza_billing_id}</div>
      <div><strong>Status:</strong><br><span class="badge badge-${payment.status.toLowerCase()}">${payment.status}</span></div>
      <div><strong>No. Rawat:</strong><br>${payment.no_rawat || '-'}</div>
      <div><strong>No. RM:</strong><br>${payment.no_rkm_medis || '-'}</div>
      <div><strong>Pasien:</strong><br>${payment.patient_name || '-'}</div>
      <div><strong>Nominal:</strong><br>Rp ${Number(payment.amount).toLocaleString('id-ID')}</div>
      <div><strong>Channel:</strong><br>${payment.channel}</div>
      <div><strong>Facility:</strong><br>${payment.facility_id}</div>
      <div><strong>Dibuat:</strong><br>${new Date(payment.created_at).toLocaleString('id-ID')}</div>
      <div><strong>Expires:</strong><br>${payment.expires_at ? new Date(payment.expires_at).toLocaleString('id-ID') : '-'}</div>
      <div><strong>Paid At:</strong><br>${payment.paid_at ? new Date(payment.paid_at).toLocaleString('id-ID') : '-'}</div>
      <div><strong>Hyperswitch ID:</strong><br>${payment.hyperswitch_payment_id || '-'}</div>
    </div>
    ${payment.qris_url ? `<div style="text-align:center;margin-top:1rem"><img src="${payment.qris_url}" style="width:200px;border-radius:8px;border:2px solid var(--border-color)"></div>` : ''}
    <div style="margin-top:1rem;font-family:monospace;font-size:0.7rem;color:var(--text-muted);word-break:break-all">
      <strong>Idempotency Key:</strong> ${payment.idempotency_key}
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

// === Reconciliation Jobs ===
async function loadReconJobs() {
  try {
    const data = await api('/api/reconciliation/jobs');
    const tbody = document.getElementById('recon-body');
    tbody.innerHTML = '';
    for (const j of (data.data || [])) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family:monospace;font-size:0.75rem">${j.job_id.substring(0, 16)}…</td>
        <td>${j.khanza_billing_id || '-'}</td>
        <td>${j.patient_name || '-'}</td>
        <td>Rp ${Number(j.amount || 0).toLocaleString('id-ID')}</td>
        <td><span class="badge badge-${j.status.toLowerCase()}">${j.status}</span></td>
        <td>${j.retry_count}/${j.max_retries}</td>
        <td style="font-size:0.75rem;max-width:200px;overflow:hidden;text-overflow:ellipsis">${j.last_error || '-'}</td>
        <td>${j.status === 'FAILED' ? `<button class="btn btn-sm" onclick="retryRecon('${j.job_id}')">🔄 Retry</button>` : ''}</td>
      `;
      tbody.appendChild(tr);
    }
    if (!data.data?.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:2rem">Tidak ada reconciliation jobs</td></tr>';
    }
  } catch (e) {
    console.error('Recon jobs error:', e);
  }
}

async function retryRecon(jobId) {
  await api(`/api/reconciliation/retry/${jobId}`, { method: 'POST' });
  loadReconJobs();
  refreshMetrics();
}

// === Health ===
async function loadHealth() {
  try {
    const health = await api('/api/health/');
    const el = document.getElementById('health-content');
    el.innerHTML = `
      <div class="health-check">
        <span>Status</span>
        <span class="${health.status === 'healthy' ? 'health-ok' : 'health-fail'}">${health.status?.toUpperCase()}</span>
      </div>
      <div class="health-check">
        <span>Uptime</span>
        <span>${formatUptime(health.uptime_seconds)}</span>
      </div>
      <div class="health-check">
        <span>Database</span>
        <span class="${health.checks?.database?.ok ? 'health-ok' : 'health-fail'}">${health.checks?.database?.ok ? '✅ Connected' : '❌ ' + (health.checks?.database?.error || 'Failed')}</span>
      </div>
      <div class="health-check">
        <span>Hyperswitch</span>
        <span class="${health.checks?.hyperswitch?.ok ? 'health-ok' : 'health-fail'}">${health.checks?.hyperswitch?.ok ? '✅ Connected' : '⚠️ Not available'}</span>
      </div>
      <div class="health-check">
        <span>Facility</span>
        <span>${health.facility?.name || '-'} (${health.facility?.id || '-'})</span>
      </div>
      <div class="health-check">
        <span>Version</span>
        <span>${health.version || '-'}</span>
      </div>
      <div class="health-check">
        <span>Timestamp</span>
        <span>${health.timestamp ? new Date(health.timestamp).toLocaleString('id-ID') : '-'}</span>
      </div>
    `;
    
    // Update facility info in sidebar
    const facilityInfo = document.getElementById('facility-info');
    facilityInfo.querySelector('.facility-name').textContent = health.facility?.name || 'Unknown';
    facilityInfo.querySelector('.facility-status').style.color = health.status === 'healthy' ? 'var(--accent-green)' : 'var(--accent-red)';
  } catch (e) {
    document.getElementById('health-content').textContent = 'Error: ' + e.message;
  }
}

function formatUptime(seconds) {
  if (!seconds) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

// === CSV Export ===
async function exportCSV() {
  const data = await api('/api/payments?limit=1000');
  if (!data.data?.length) return alert('Tidak ada data');
  
  const headers = ['payment_request_id', 'khanza_billing_id', 'no_rawat', 'patient_name', 'amount', 'status', 'channel', 'created_at', 'paid_at'];
  const csv = [
    headers.join(','),
    ...data.data.map(p => headers.map(h => `"${p[h] || ''}"`).join(','))
  ].join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `carepay_payments_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
}

// === Initial Load & Auto-Refresh ===
refreshMetrics();
refreshPayments();
loadHealth();

// Auto-refresh every 5 seconds
setInterval(() => {
  refreshMetrics();
  refreshPayments();
}, 5000);

// === Cashier & eKYC System Integration ===
let activePatient = null;
let kycPhotos = { ktp: null, selfie: null };
let mediaStream = null;

// Mock database for billing details (SIMRS Khanza Integration)
const mockKhanzaBillings = {
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

async function searchBilling() {
  const searchInput = document.getElementById('cashier-search-input').value.trim();
  if (!searchInput) return alert('Masukkan No. RM atau nama pasien!');

  // Match search
  let found = mockKhanzaBillings[searchInput];
  if (!found) {
    // Search by name
    found = Object.values(mockKhanzaBillings).find(b => b.patientName.toLowerCase().includes(searchInput.toLowerCase()));
  }

  if (!found) {
    return alert('Billing / Pasien tidak ditemukan di SIMRS Khanza');
  }

  activePatient = found;

  // Render Billing details
  document.getElementById('billing-details-card').style.display = 'block';
  document.getElementById('bill-patient-name').textContent = found.patientName;
  document.getElementById('bill-rm-no').textContent = found.patientId;
  document.getElementById('bill-rawat-no').textContent = found.rawatNo;
  document.getElementById('bill-id').textContent = found.billingId;
  document.getElementById('bill-total-amount').textContent = `Rp ${found.totalAmount.toLocaleString('id-ID')}`;

  const badge = document.getElementById('billing-badge-status');
  badge.textContent = found.status;
  badge.className = `badge badge-${found.status === 'PAID' ? 'paid' : 'expired'}`;

  const itemsList = document.getElementById('billing-items-list');
  itemsList.innerHTML = found.items.map(item => `
    <div class="billing-item-row">
      <span>${item.name}</span>
      <span style="font-weight:600">Rp ${item.price.toLocaleString('id-ID')}</span>
    </div>
  `).join('');

  // Fetch Wallet info from CarePay Satelit API
  document.getElementById('wallet-status-card').style.display = 'block';
  await refreshWalletStatus();
}

async function refreshWalletStatus() {
  if (!activePatient) return;
  
  const balanceEl = document.getElementById('wallet-balance-amount');
  const bindingEl = document.getElementById('wallet-binding-status');
  const kycEl = document.getElementById('wallet-kyc-status');
  const actionsPanel = document.getElementById('wallet-actions-panel');
  const trackerCard = document.getElementById('workflow-tracker-card');
  
  balanceEl.textContent = 'Memuat...';
  trackerCard.style.display = 'none';

  try {
    const res = await api(`/api/wallets/${activePatient.patientId}/balance`);

    if (res.error) {
      // Wallet not found or unbound
      balanceEl.textContent = 'Rp -';
      bindingEl.textContent = 'UNBOUND';
      bindingEl.className = 'meta-value badge badge-expired';
      kycEl.textContent = 'UNVERIFIED';
      kycEl.className = 'meta-value badge badge-draft';
      
      updateKYCStepper(0);

      actionsPanel.innerHTML = `
        <button class="btn btn-primary btn-block" onclick="linkPatientWallet()">
          🔗 Hubungkan Dompet CarePay Pasien (OTP)
        </button>
      `;
      return;
    }

    // Wallet is BOUND
    const balance = res.accountInfos?.balanceInfos?.[0]?.availableBalance || 0;
    balanceEl.textContent = `Rp ${Number(balance).toLocaleString('id-ID')}`;
    
    bindingEl.textContent = 'BOUND';
    bindingEl.className = 'meta-value badge badge-paid';

    // Check KYC Status
    const kycRes = await api(`/api/wallets/${activePatient.patientId}/kyc/status`);
    const kycStatus = kycRes.kycStatus || 'UNVERIFIED';
    
    kycEl.textContent = kycStatus;
    
    if (kycStatus === 'VERIFIED') {
      kycEl.className = 'meta-value badge badge-paid';
      updateKYCStepper(2);
    } else if (kycStatus === 'IN_PROGRESS') {
      kycEl.className = 'meta-value badge badge-pending';
      updateKYCStepper(1);
    } else {
      kycEl.className = 'meta-value badge badge-expired';
      updateKYCStepper(0);
    }

    // Dynamic actions based on balance and KYC
    let buttons = '';
    const hasEnoughBalance = Number(balance) >= activePatient.totalAmount;

    if (activePatient.status === 'PAID') {
      buttons += `<div style="text-align:center;color:var(--accent-green);font-weight:600;padding:1rem">✓ Tagihan Sudah Lunas</div>`;
    } else {
      if (hasEnoughBalance) {
        buttons += `
          <button class="btn btn-success btn-block" onclick="directDebitPayment()">
            💸 Bayar via Potong Saldo CarePay (Direct Debit)
          </button>
        `;
      } else {
        buttons += `
          <div style="color:var(--accent-red);font-size:0.8rem;margin-bottom:0.5rem;text-align:center">
            ⚠ Saldo tidak mencukupi untuk pembayaran tagihan
          </div>
          <button class="btn btn-primary btn-block" onclick="printQRISTopup()">
            📱 Tampilkan QRIS Top-Up Pasien
          </button>
        `;
      }

      if (kycStatus !== 'VERIFIED' && kycStatus !== 'IN_PROGRESS') {
        buttons += `
          <button class="btn btn-block" onclick="openKYCModal()">
            🪪 Upgrade Limit e-Money (eKYC Webcam)
          </button>
        `;
      }
    }

    actionsPanel.innerHTML = buttons;

  } catch (e) {
    console.error('Wallet fetch error:', e);
    balanceEl.textContent = 'Error';
  }
}

function updateKYCStepper(step) {
  // Step 0: Unregistered, Step 1: In Progress, Step 2: Verified
  document.querySelectorAll('.kyc-stepper .step').forEach(el => el.className = 'step');
  document.querySelectorAll('.kyc-stepper .line').forEach(el => el.className = 'line');

  if (step >= 0) {
    document.getElementById('step-0').className = 'step active success';
  }
  if (step >= 1) {
    document.getElementById('line-1').className = 'line active';
    document.getElementById('step-1').className = 'step active pending';
  }
  if (step >= 2) {
    document.getElementById('line-1').className = 'line success';
    document.getElementById('step-1').className = 'step success';
    document.getElementById('line-2').className = 'line success';
    document.getElementById('step-2').className = 'step success active';
  }
}

// Bind Wallet OTP Simulation
async function linkPatientWallet() {
  if (!activePatient) return;
  const phone = activePatient.phoneNo;

  try {
    const res = await api('/api/wallets/binding/request', {
      method: 'POST',
      body: JSON.stringify({
        patientId: activePatient.patientId,
        msisdn: phone
      })
    });

    const otp = prompt(`[SIMULASI BINDING] Kode OTP telah dikirim ke nomor ${phone}. Masukkan OTP (default: 123456):`, "123456");
    if (!otp) return;

    // Simulate callback webhook confirmation from SpeedCash
    const confirmRes = await api('/api/wallets/binding/confirm', {
      method: 'POST',
      headers: {
        'x-timestamp': new Date().toISOString(),
        'x-signature': 'dummy-signature-accepted-by-mock-layer',
      },
      body: JSON.stringify({
        phoneNo: phone,
        tokenB2b2c: `token_b2b2c_${Math.random().toString(36).substring(2, 10)}`,
        refreshToken: `refresh_token_${Math.random().toString(36).substring(2, 10)}`,
        walletId: `sc_wallet_${activePatient.patientId}`,
        status: "SUCCESS"
      })
    });

    alert('✅ Akun Dompet CarePay Pasien Berhasil Dihubungkan (BOUND)!');
    await refreshWalletStatus();
  } catch (e) {
    alert('Binding error: ' + e.message);
  }
}

// eKYC Webcam Modal Controls
async function openKYCModal() {
  if (!activePatient) return;
  document.getElementById('kyc-modal-overlay').classList.add('active');
  document.getElementById('kyc-name').value = activePatient.patientName;
  document.getElementById('kyc-nik').value = activePatient.patientId === "000123" ? "3172012345678901" : "3172098765432101";
  document.getElementById('kyc-dob').value = activePatient.patientId === "000123" ? "1990-05-15" : "1995-10-20";

  kycPhotos = { ktp: null, selfie: null };
  document.getElementById('box-ktp').className = 'photo-box';
  document.getElementById('box-selfie').className = 'photo-box';

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    document.getElementById('kyc-video').srcObject = mediaStream;
  } catch (e) {
    console.error('Camera access failed:', e);
    alert('Webcam tidak dapat diakses. Simulasi foto akan menggunakan placeholder.');
  }
}

function closeKYCModal() {
  document.getElementById('kyc-modal-overlay').classList.remove('active');
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
}

function capturePhoto(type) {
  const video = document.getElementById('kyc-video');
  const canvas = document.getElementById('kyc-canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = 640;
  canvas.height = 480;

  if (mediaStream) {
    ctx.drawImage(video, 0, 0, 640, 480);
    canvas.toBlob(blob => {
      kycPhotos[type] = blob;
      const box = document.getElementById(`box-${type}`);
      box.className = 'photo-box captured';
      box.querySelector('.photo-text').textContent = `Foto ${type.toUpperCase()} Diambil ✓`;
    }, 'image/jpeg');
  } else {
    // Mock image blob if camera is missing
    kycPhotos[type] = new Blob(['mock_image'], { type: 'image/jpeg' });
    const box = document.getElementById(`box-${type}`);
    box.className = 'photo-box captured';
    box.querySelector('.photo-text').textContent = `Foto ${type.toUpperCase()} Diambil ✓ (Mock)`;
  }
}

async function submitKYCFiles() {
  if (!kycPhotos.ktp || !kycPhotos.selfie) {
    return alert('Ambil kedua foto (KTP & Selfie) terlebih dahulu!');
  }

  const nik = document.getElementById('kyc-nik').value;
  const name = document.getElementById('kyc-name').value;
  const dob = document.getElementById('kyc-dob').value;

  const formData = new FormData();
  formData.append('idCardNumber', nik);
  formData.append('fullName', name);
  formData.append('dateOfBirth', dob);
  formData.append('idCardImage', kycPhotos.ktp, 'ktp.jpg');
  formData.append('selfieImage', kycPhotos.selfie, 'selfie.jpg');

  try {
    const res = await fetch(`${API_BASE}/api/wallets/${activePatient.patientId}/kyc`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY
      },
      body: formData
    });

    const result = await res.json();
    alert('📤 Berkas KYC Berhasil Dikirim ke Bimasakti!');
    closeKYCModal();
    await refreshWalletStatus();
  } catch (e) {
    alert('KYC upload error: ' + e.message);
  }
}

// Effect Workflow Live Debit Payment Simulation
async function directDebitPayment() {
  if (!activePatient) return;
  
  const tracker = document.getElementById('workflow-tracker-card');
  const logBox = document.getElementById('workflow-logs');
  tracker.style.display = 'block';
  logBox.innerHTML = '';

  const addLog = (text, type = '') => {
    const time = new Date().toLocaleTimeString('id-ID');
    const div = document.createElement('div');
    div.className = `log-line ${type}`;
    div.innerHTML = `[${time}] ${text}`;
    logBox.appendChild(div);
    logBox.scrollTop = logBox.scrollHeight;
  };

  // Reset steps
  const resetSteps = () => {
    document.querySelectorAll('.workflow-stepper .wf-step').forEach(el => el.className = 'wf-step');
    document.querySelectorAll('.workflow-stepper .wf-line').forEach(el => el.className = 'wf-line');
  };
  resetSteps();

  addLog('Membuka sesi pembayaran untuk tagihan SIMRS...', 'info');
  document.getElementById('wf-draft').className = 'wf-step active';
  
  await sleep(1000);
  document.getElementById('wfl-1').className = 'wf-line active';
  document.getElementById('wf-pending').className = 'wf-step active';
  addLog('Menghubungkan ke server satelit CarePay (Effect Runtime)...', 'info');

  await sleep(1200);
  addLog(`Memverifikasi saldo dompet Bimasakti untuk NIK KTP...`, 'info');
  
  // Call the actual API
  try {
    document.getElementById('wfl-2').className = 'wf-line active';
    document.getElementById('wf-paying').className = 'wf-step active pending';
    addLog(`Melakukan pemotongan saldo (Direct Debit) Bimasakti: Rp ${activePatient.totalAmount.toLocaleString('id-ID')}`, 'info');

    const response = await api(`/api/wallets/${activePatient.patientId}/debit`, {
      method: 'POST',
      body: JSON.stringify({
        amount: activePatient.totalAmount,
        billingId: activePatient.billingId
      })
    });

    if (response.error) {
      throw new Error(response.error);
    }

    await sleep(1500);
    document.getElementById('wfl-3').className = 'wf-line success';
    document.getElementById('wf-reconciled').className = 'wf-step success active';
    addLog('✅ Bimasakti Direct Debit sukses! ResponseCode: 2000000', 'success');

    // Run reconciliation log
    addLog('Memicu Auto-Reconciliation Engine (Effect Workflow)...', 'info');
    await sleep(1000);
    addLog('Mengubah status tabel pemberian_obat & rawat_jl_dr ke LUNAS...', 'success');
    addLog('Mencetak struk billing kasir SIMRS Khanza...', 'success');

    // Mark patient lunas
    activePatient.status = 'PAID';
    
    // Refresh stats
    refreshMetrics();
    refreshPayments();
    await refreshWalletStatus();

  } catch (e) {
    resetSteps();
    document.getElementById('wf-paying').className = 'wf-step active error';
    addLog(`✗ Gagal melaksanakan pembayaran: ${e.message}`, 'error');
  }
}

async function printQRISTopup() {
  if (!activePatient) return;
  alert(`Menampilkan QRIS Dinamis senilai Rp ${activePatient.totalAmount.toLocaleString('id-ID')} untuk Top-Up saldo CarePay Wallet.`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

