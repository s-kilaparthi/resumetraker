const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(os.homedir(), '.resumetracker');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'tracker.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    job_description TEXT,
    resume_path TEXT,
    applied_at TEXT NOT NULL,
    status TEXT,
    job_role TEXT
  )
`);

function tableHasColumn(tableName, columnName) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some((column) => column.name === columnName);
}

if (!tableHasColumn('applications', 'job_role')) {
  db.exec('ALTER TABLE applications ADD COLUMN job_role TEXT');
}

if (!tableHasColumn('applications', 'status')) {
  db.exec('ALTER TABLE applications ADD COLUMN status TEXT');
}

if (!tableHasColumn('applications', 'interview_date')) {
  db.exec('ALTER TABLE applications ADD COLUMN interview_date TEXT');
}

function addApplication(data) {
  const stmt = db.prepare(`
    INSERT INTO applications (company_name, job_role, job_description, resume_path, applied_at, status)
    VALUES (@company_name, @job_role, @job_description, @resume_path, @applied_at, @status)
  `);

  const info = stmt.run({
    company_name: data.company_name,
    job_role: data.job_role ?? data.jobRole ?? null,
    job_description: data.job_description ?? null,
    resume_path: data.resume_path ?? null,
    applied_at: new Date().toISOString(),
    status: data.status || 'Applied',
  });

  return db.prepare('SELECT * FROM applications WHERE id = ?').get(info.lastInsertRowid);
}

function getAllApplications() {
  return db.prepare(`
    SELECT * FROM applications
    ORDER BY applied_at DESC
  `).all();
}

function searchApplicationsByCompany(query) {
  return db.prepare(`
    SELECT * FROM applications
    WHERE company_name LIKE ? COLLATE NOCASE
    ORDER BY applied_at DESC
  `).all(`%${query}%`);
}

function getApplicationById(id) {
  return db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
}

function updateApplicationStatus(id, status, interviewDate) {
  if (interviewDate) {
    db.prepare(`
      UPDATE applications
      SET status = ?, interview_date = ?
      WHERE id = ?
    `).run(status, interviewDate, id);
  } else {
    db.prepare('UPDATE applications SET status = ? WHERE id = ?').run(status, id);
  }

  return getApplicationById(id);
}

function updateApplication(id, data) {
  const existing = getApplicationById(id);
  if (!existing) {
    return null;
  }

  db.prepare(`
    UPDATE applications
    SET company_name = ?, job_role = ?, job_description = ?, resume_path = ?
    WHERE id = ?
  `).run(
    data.company_name,
    data.job_role ?? null,
    data.job_description ?? null,
    data.resume_path ?? existing.resume_path,
    id
  );

  return getApplicationById(id);
}

function deleteApplication(id) {
  const existing = getApplicationById(id);
  if (!existing) {
    return null;
  }

  db.prepare('DELETE FROM applications WHERE id = ?').run(id);
  return existing.resume_path;
}

module.exports = {
  addApplication,
  getAllApplications,
  searchApplicationsByCompany,
  getApplicationById,
  updateApplicationStatus,
  updateApplication,
  deleteApplication,
};
