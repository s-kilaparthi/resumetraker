const express = require('express');
const fs = require('fs');
const multer = require('multer');
const os = require('os');
const path = require('path');
const {
  addApplication,
  getAllApplications,
  searchApplicationsByCompany,
  getApplicationById,
  updateApplicationStatus,
  updateApplication,
  deleteApplication,
} = require('./db');

const PORT = 4000;
const resumesDir = path.join(os.homedir(), '.resumetracker', 'resumes');
fs.mkdirSync(resumesDir, { recursive: true });

const allowedExtensions = new Set(['.pdf', '.doc', '.docx']);

function sanitizeCompanyName(name) {
  return String(name || 'resume')
    .trim()
    .replace(/[<>:"/\\|?*]/g, '_') || 'resume';
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, resumesDir);
  },
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}_upload${extension}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      cb(new Error('Resume must be a .pdf, .doc, or .docx file.'));
      return;
    }
    cb(null, true);
  },
});

function saveUploadedResume(file, companyName) {
  const extension = path.extname(file.originalname).toLowerCase();
  const savedPath = path.join(
    resumesDir,
    `${Date.now()}_${sanitizeCompanyName(companyName)}${extension}`
  );
  fs.renameSync(file.path, savedPath);
  return savedPath;
}

function unlinkQuietly(filePath) {
  if (!filePath) {
    return;
  }

  try {
    fs.unlinkSync(filePath);
  } catch {
    // Ignore missing files.
  }
}

const app = express();

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.post('/api/applications', (req, res) => {
  upload.single('resume')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }

    try {
      const companyName = String(req.body.companyName ?? '').trim();
      const jobRole = String(req.body.jobRole ?? '').trim();
      const jobDescription = String(req.body.jobDescription ?? '').trim();

      if (!companyName) {
        res.status(400).json({ error: 'Company name is required.' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'Resume file is required.' });
        return;
      }

      const savedPath = saveUploadedResume(req.file, companyName);

      const application = addApplication({
        company_name: companyName,
        job_role: jobRole || null,
        job_description: jobDescription || null,
        resume_path: savedPath,
      });

      res.status(201).json(application);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to save application.' });
    }
  });
});

app.get('/api/applications', (_req, res) => {
  try {
    res.json(getAllApplications());
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load applications.' });
  }
});

app.get('/api/applications/search', (req, res) => {
  try {
    const query = String(req.query.q ?? '');
    res.json(searchApplicationsByCompany(query));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to search applications.' });
  }
});

app.get('/api/applications/:id', (req, res) => {
  try {
    const application = getApplicationById(Number(req.params.id));
    if (!application) {
      res.status(404).json({ error: 'Application not found.' });
      return;
    }

    res.json(application);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load application.' });
  }
});

app.patch('/api/applications/:id/status', (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status ?? '').trim();
    const allowed = new Set(['Applied', 'Interview', 'Rejected']);

    if (!allowed.has(status)) {
      res.status(400).json({ error: 'Status must be Applied, Interview, or Rejected.' });
      return;
    }

    const interviewDate = String(req.body?.interviewDate ?? '').trim() || null;

    if (!getApplicationById(id)) {
      res.status(404).json({ error: 'Application not found.' });
      return;
    }

    res.json(updateApplicationStatus(id, status, interviewDate));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to update status.' });
  }
});

app.put('/api/applications/:id', (req, res) => {
  upload.single('resume')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }

    try {
      const id = Number(req.params.id);
      const existing = getApplicationById(id);
      if (!existing) {
        res.status(404).json({ error: 'Application not found.' });
        return;
      }

      const companyName = String(req.body.companyName ?? '').trim();
      const jobRole = String(req.body.jobRole ?? '').trim();
      const jobDescription = String(req.body.jobDescription ?? '').trim();

      if (!companyName) {
        res.status(400).json({ error: 'Company name is required.' });
        return;
      }

      let resumePath;
      if (req.file) {
        resumePath = saveUploadedResume(req.file, companyName);
        unlinkQuietly(existing.resume_path);
      }

      const application = updateApplication(id, {
        company_name: companyName,
        job_role: jobRole || null,
        job_description: jobDescription || null,
        resume_path: resumePath,
      });

      res.json(application);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to update application.' });
    }
  });
});

app.delete('/api/applications/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!getApplicationById(id)) {
      res.status(404).json({ error: 'Application not found.' });
      return;
    }

    const resumePath = deleteApplication(id);
    unlinkQuietly(resumePath);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to delete application.' });
  }
});

app.get('/api/resume/:id', (req, res) => {
  try {
    const application = getApplicationById(Number(req.params.id));
    if (!application || !application.resume_path) {
      res.status(404).json({ error: 'Resume not found.' });
      return;
    }

    const resumePath = path.resolve(application.resume_path);

    if (!fs.existsSync(resumePath)) {
      res.status(404).json({ error: 'Resume file is missing.' });
      return;
    }

    res.sendFile(resumePath, { dotfiles: 'allow' }, (err) => {
      if (err && !res.headersSent) {
        res.status(err.statusCode || 500).json({
          error: err.message || 'Failed to open resume.',
        });
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to open resume.' });
  }
});

const url = `http://localhost:${PORT}`;
const isDirectRun = require.main === module;

function startServer() {
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, () => {
      console.log(`Resume Tracker listening on ${url}`);
      resolve(server);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${PORT} is already in use.`);
        resolve(null);
        return;
      }

      reject(err);
    });
  });
}

async function openInBrowser() {
  const { default: open } = await import('open');
  await open(url);
}

const serverReady = startServer().then(async (server) => {
  if (isDirectRun) {
    try {
      await openInBrowser();
    } catch (err) {
      console.error('Could not open browser:', err.message);
    }

    if (!server) {
      process.exit(0);
    }
  }
});

if (isDirectRun) {
  serverReady.catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = app;
module.exports.serverReady = serverReady;
