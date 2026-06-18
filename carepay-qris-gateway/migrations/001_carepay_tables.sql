-- CarePay QRIS Gateway - Database Schema
-- Run against Khanza database (sik)

CREATE TABLE IF NOT EXISTS carepay_payment_requests (
  payment_request_id VARCHAR(36) NOT NULL PRIMARY KEY,
  khanza_billing_id VARCHAR(50) NOT NULL,
  no_rawat VARCHAR(30) DEFAULT NULL,
  no_rkm_medis VARCHAR(20) DEFAULT NULL,
  patient_name VARCHAR(100) DEFAULT NULL,
  amount BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'IDR',
  channel ENUM('QRIS','VA','EDC') NOT NULL DEFAULT 'QRIS',
  status ENUM('DRAFT','PENDING','PAID','EXPIRED','FAILED','RECONCILING','RECONCILED','RECONCILE_FAILED') NOT NULL DEFAULT 'DRAFT',
  hyperswitch_payment_id VARCHAR(100) DEFAULT NULL,
  speedcash_trx_id VARCHAR(100) DEFAULT NULL,
  qris_payload TEXT DEFAULT NULL,
  qris_url TEXT DEFAULT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  facility_id VARCHAR(50) NOT NULL DEFAULT 'rs-demo',
  expires_at DATETIME DEFAULT NULL,
  paid_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_idempotency (idempotency_key),
  KEY idx_billing (khanza_billing_id),
  KEY idx_status (status),
  KEY idx_facility_date (facility_id, created_at),
  KEY idx_expires (status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS carepay_payment_events (
  event_id VARCHAR(36) NOT NULL PRIMARY KEY,
  payment_request_id VARCHAR(36) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  source VARCHAR(30) NOT NULL DEFAULT 'webhook',
  raw_payload JSON DEFAULT NULL,
  signature_valid TINYINT(1) DEFAULT NULL,
  processed TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_payment (payment_request_id),
  KEY idx_type (event_type),
  KEY idx_unprocessed (processed, created_at),
  CONSTRAINT fk_event_payment FOREIGN KEY (payment_request_id) REFERENCES carepay_payment_requests(payment_request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS carepay_reconciliation_jobs (
  job_id VARCHAR(36) NOT NULL PRIMARY KEY,
  payment_request_id VARCHAR(36) NOT NULL,
  status ENUM('PENDING','RUNNING','SUCCESS','FAILED','DLQ') NOT NULL DEFAULT 'PENDING',
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 5,
  last_error TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME DEFAULT NULL,
  next_retry_at DATETIME DEFAULT NULL,
  KEY idx_status_retry (status, next_retry_at),
  CONSTRAINT fk_recon_payment FOREIGN KEY (payment_request_id) REFERENCES carepay_payment_requests(payment_request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS carepay_audit_logs (
  log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  actor VARCHAR(100) NOT NULL DEFAULT 'system',
  detail_json JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_entity (entity_type, entity_id),
  KEY idx_action (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS carepay_workflow_execution (
  id VARCHAR(255) PRIMARY KEY,
  workflow_type VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,
  payload JSON NOT NULL,
  interrupted TINYINT(1) DEFAULT 0,
  result JSON DEFAULT NULL,
  error_details TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS carepay_activity_execution (
  id VARCHAR(255) PRIMARY KEY,
  workflow_id VARCHAR(255) NOT NULL,
  activity_name VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,
  input_data JSON DEFAULT NULL,
  output_data JSON DEFAULT NULL,
  error_details TEXT DEFAULT NULL,
  retry_count INT DEFAULT 0,
  next_retry_at DATETIME DEFAULT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_activity_wf FOREIGN KEY (workflow_id) REFERENCES carepay_workflow_execution(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS carepay_deferred_result (
  id VARCHAR(255) PRIMARY KEY,
  workflow_id VARCHAR(255) NOT NULL,
  deferred_name VARCHAR(100) NOT NULL,
  exit_data JSON NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_deferred_wf FOREIGN KEY (workflow_id) REFERENCES carepay_workflow_execution(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS carepay_task_queue (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  task_type VARCHAR(100) NOT NULL,
  payload JSON NOT NULL,
  run_after DATETIME DEFAULT CURRENT_TIMESTAMP,
  locked_by VARCHAR(255) DEFAULT NULL,
  locked_until DATETIME DEFAULT NULL,
  attempts INT DEFAULT 0,
  KEY idx_run_after (run_after),
  KEY idx_locked (locked_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
