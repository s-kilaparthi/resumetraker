const form = document.getElementById('add-application-form');
const companyNameInput = document.getElementById('company-name');
const jobRoleInput = document.getElementById('job-role');
const jobDescriptionInput = document.getElementById('job-description');
const resumeInput = document.getElementById('resume');
const appliedAtEl = document.getElementById('applied-at');
const formMessageEl = document.getElementById('form-message');
const searchInput = document.getElementById('search-applications');
const applicationsListEl = document.getElementById('applications-list');
const detailHeadingEl = document.getElementById('detail-heading');
const detailJobRoleEl = document.getElementById('detail-job-role');
const detailStatusEl = document.getElementById('detail-status');
const interviewDateInput = document.getElementById('interview-date');
const editApplicationButton = document.getElementById('edit-application');
const deleteApplicationButton = document.getElementById('delete-application');
const resumePanelEl = document.getElementById('resume-panel');
const resumePreviewEl = document.getElementById('resume-preview');
const expandResumeButton = document.getElementById('expand-resume');
const jobDescriptionPreviewEl = document.getElementById('job-description-preview');
const editForm = document.getElementById('edit-application-form');
const editCompanyNameInput = document.getElementById('edit-company-name');
const editJobRoleInput = document.getElementById('edit-job-role');
const editJobDescriptionInput = document.getElementById('edit-job-description');
const editResumeInput = document.getElementById('edit-resume');
const cancelEditButton = document.getElementById('cancel-edit');

let searchTimeout = null;
let selectedApplicationId = null;
let selectedApplication = null;

appliedAtEl.textContent = new Date().toLocaleString();

function setMessage(text, type) {
  formMessageEl.textContent = text;
  formMessageEl.className = type || '';
}

async function parseJsonResponse(response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok || data.error) {
    throw new Error(data.error || 'Request failed.');
  }
  return data;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const companyName = companyNameInput.value.trim();
  const jobRole = jobRoleInput.value.trim();
  const jobDescription = jobDescriptionInput.value.trim();
  const resumeFile = resumeInput.files[0];

  if (!companyName) {
    setMessage('Company name is required.', 'error');
    return;
  }

  if (!resumeFile) {
    setMessage('Please choose a resume file.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('companyName', companyName);
  formData.append('jobRole', jobRole);
  formData.append('jobDescription', jobDescription);
  formData.append('resume', resumeFile);

  try {
    await parseJsonResponse(
      await fetch('/api/applications', {
        method: 'POST',
        body: formData,
      })
    );

    setMessage('Application saved.', 'success');
    form.reset();
    appliedAtEl.textContent = new Date().toLocaleString();
    await refreshApplicationsList();
  } catch (error) {
    setMessage(error.message || 'Failed to save application.', 'error');
  }
});

function formatAppliedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || '';
  }
  return date.toLocaleString();
}

function resumeExtension(resumePath) {
  const match = String(resumePath || '').toLowerCase().match(/\.[^.]+$/);
  return match ? match[0] : '';
}

function statusClass(status) {
  return `status-${String(status || 'applied').toLowerCase()}`;
}

function formatInterviewDate(value) {
  if (!value) {
    return '';
  }

  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) {
    return value;
  }

  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function toDateInputValue(value) {
  return value ? String(value).slice(0, 10) : '';
}

function statusBadgeText(status, interviewDate) {
  if (status === 'Interview' && interviewDate) {
    return `Interview — ${formatInterviewDate(interviewDate)}`;
  }
  return status || 'Applied';
}

function createStatusBadge(status, interviewDate) {
  const badge = document.createElement('span');
  badge.className = `status-badge ${statusClass(status)}`;
  badge.textContent = statusBadgeText(status, interviewDate);
  return badge;
}

function updateListStatusBadge(id, status, interviewDate) {
  const item = applicationsListEl.querySelector(`.application-item[data-id="${id}"]`);
  const badge = item?.querySelector('.status-badge');
  if (!badge) {
    return;
  }

  badge.className = `status-badge ${statusClass(status)}`;
  badge.textContent = statusBadgeText(status, interviewDate);
}

function showInterviewDateInput(visible, prefill) {
  interviewDateInput.hidden = !visible;
  if (visible) {
    interviewDateInput.value = toDateInputValue(prefill);
  } else {
    interviewDateInput.value = '';
  }
}

function renderDetailPanel(application) {
  selectedApplication = application;
  setEditMode(false);
  setResumeFullscreen(false);

  detailHeadingEl.textContent = application.company_name;
  detailJobRoleEl.textContent = application.job_role || '';
  detailStatusEl.hidden = false;
  detailStatusEl.value = application.status || 'Applied';
  showInterviewDateInput(
    application.status === 'Interview',
    application.interview_date
  );
  editApplicationButton.hidden = false;
  deleteApplicationButton.hidden = false;
  resumePreviewEl.replaceChildren();
  jobDescriptionPreviewEl.textContent = application.job_description || '';

  const extension = resumeExtension(application.resume_path);

  if (extension === '.pdf') {
    const iframe = document.createElement('iframe');
    iframe.src = `/api/resume/${application.id}`;
    iframe.title = `${application.company_name} resume`;
    resumePreviewEl.appendChild(iframe);
    return;
  }

  if (extension === '.doc' || extension === '.docx') {
    const downloadLink = document.createElement('a');
    downloadLink.href = `/api/resume/${application.id}`;
    downloadLink.textContent = 'Download Resume';
    resumePreviewEl.appendChild(downloadLink);
  }
}

async function selectApplication(id) {
  selectedApplicationId = id;

  for (const item of applicationsListEl.querySelectorAll('.application-item')) {
    item.classList.toggle('selected', Number(item.dataset.id) === Number(id));
  }

  try {
    const application = await parseJsonResponse(
      await fetch(`/api/applications/${id}`)
    );
    renderDetailPanel(application);
  } catch (error) {
    setMessage(error.message || 'Failed to load application.', 'error');
  }
}

function renderApplications(applications) {
  applicationsListEl.replaceChildren();

  if (!applications || applications.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-list';
    empty.textContent = 'No applications found.';
    applicationsListEl.appendChild(empty);
    return;
  }

  for (const application of applications) {
    const item = document.createElement('div');
    item.className = 'application-item';
    item.dataset.id = String(application.id);

    if (Number(application.id) === Number(selectedApplicationId)) {
      item.classList.add('selected');
    }

    const details = document.createElement('div');
    details.className = 'application-details';

    const company = document.createElement('strong');
    company.textContent = application.company_name;

    const jobRole = document.createElement('span');
    jobRole.className = 'job-role';
    jobRole.textContent = application.job_role || '';

    const appliedAt = document.createElement('span');
    appliedAt.textContent = formatAppliedAt(application.applied_at);

    details.append(company, jobRole, appliedAt);

    const badge = createStatusBadge(
      application.status || 'Applied',
      application.interview_date
    );

    const viewResume = document.createElement('button');
    viewResume.type = 'button';
    viewResume.className = 'view-resume';
    viewResume.textContent = 'View Resume';

    item.addEventListener('click', () => {
      selectApplication(application.id);
    });

    item.append(details, badge, viewResume);
    applicationsListEl.appendChild(item);
  }
}

async function refreshApplicationsList() {
  const query = searchInput.value.trim();
  const url = query
    ? `/api/applications/search?q=${encodeURIComponent(query)}`
    : '/api/applications';

  try {
    const applications = await parseJsonResponse(await fetch(url));
    renderApplications(applications);
  } catch (error) {
    setMessage(error.message || 'Failed to load applications.', 'error');
  }
}

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    refreshApplicationsList();
  }, 300);
});

refreshApplicationsList();

function setResumeFullscreen(isFullscreen) {
  resumePanelEl.classList.toggle('resume-fullscreen', isFullscreen);
  expandResumeButton.textContent = isFullscreen ? 'Collapse' : 'Expand';
}

expandResumeButton.addEventListener('click', () => {
  setResumeFullscreen(!resumePanelEl.classList.contains('resume-fullscreen'));
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && resumePanelEl.classList.contains('resume-fullscreen')) {
    setResumeFullscreen(false);
  }
});

detailStatusEl.addEventListener('change', async () => {
  if (!selectedApplicationId) {
    return;
  }

  const status = detailStatusEl.value;

  if (status === 'Interview') {
    const existingDate = selectedApplication?.interview_date;
    showInterviewDateInput(true, existingDate);
    if (!existingDate) {
      return;
    }
    await saveApplicationStatus(status, existingDate);
    return;
  }

  showInterviewDateInput(false);
  await saveApplicationStatus(status);
});

interviewDateInput.addEventListener('change', async () => {
  if (!selectedApplicationId || detailStatusEl.value !== 'Interview') {
    return;
  }

  const interviewDate = interviewDateInput.value;
  if (!interviewDate) {
    return;
  }

  await saveApplicationStatus('Interview', interviewDate);
});

async function saveApplicationStatus(status, interviewDate) {
  try {
    const body = { status };
    if (interviewDate) {
      body.interviewDate = interviewDate;
    }

    const application = await parseJsonResponse(
      await fetch(`/api/applications/${selectedApplicationId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );

    selectedApplication = application;
    updateListStatusBadge(
      selectedApplicationId,
      application.status,
      application.interview_date
    );
  } catch (error) {
    setMessage(error.message || 'Failed to update status.', 'error');
  }
}

function setEditMode(isEditing) {
  editForm.hidden = !isEditing;
  resumePreviewEl.hidden = isEditing;
  jobDescriptionPreviewEl.hidden = isEditing;
  expandResumeButton.hidden = isEditing;
  detailStatusEl.hidden = isEditing || !selectedApplication;
  interviewDateInput.hidden =
    isEditing || !selectedApplication || selectedApplication.status !== 'Interview';
  editApplicationButton.hidden = isEditing || !selectedApplication;
  deleteApplicationButton.hidden = isEditing || !selectedApplication;

  if (isEditing && selectedApplication) {
    editCompanyNameInput.value = selectedApplication.company_name || '';
    editJobRoleInput.value = selectedApplication.job_role || '';
    editJobDescriptionInput.value = selectedApplication.job_description || '';
    editResumeInput.value = '';
  }
}

function clearDetailPanel() {
  selectedApplicationId = null;
  selectedApplication = null;
  setResumeFullscreen(false);
  setEditMode(false);
  detailHeadingEl.textContent = 'Select an application to view details.';
  detailJobRoleEl.textContent = '';
  detailStatusEl.hidden = true;
  interviewDateInput.hidden = true;
  interviewDateInput.value = '';
  editApplicationButton.hidden = true;
  deleteApplicationButton.hidden = true;
  resumePreviewEl.replaceChildren();
  jobDescriptionPreviewEl.textContent = '';

  for (const item of applicationsListEl.querySelectorAll('.application-item')) {
    item.classList.remove('selected');
  }
}

editApplicationButton.addEventListener('click', () => {
  if (!selectedApplication) {
    return;
  }
  setEditMode(true);
});

cancelEditButton.addEventListener('click', () => {
  if (selectedApplication) {
    renderDetailPanel(selectedApplication);
  }
});

editForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedApplicationId) {
    return;
  }

  const companyName = editCompanyNameInput.value.trim();
  if (!companyName) {
    setMessage('Company name is required.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('companyName', companyName);
  formData.append('jobRole', editJobRoleInput.value.trim());
  formData.append('jobDescription', editJobDescriptionInput.value.trim());
  if (editResumeInput.files[0]) {
    formData.append('resume', editResumeInput.files[0]);
  }

  try {
    const application = await parseJsonResponse(
      await fetch(`/api/applications/${selectedApplicationId}`, {
        method: 'PUT',
        body: formData,
      })
    );
    renderDetailPanel(application);
    await refreshApplicationsList();
  } catch (error) {
    setMessage(error.message || 'Failed to update application.', 'error');
  }
});

deleteApplicationButton.addEventListener('click', async () => {
  if (!selectedApplicationId) {
    return;
  }

  if (!confirm('Delete this application?')) {
    return;
  }

  try {
    await parseJsonResponse(
      await fetch(`/api/applications/${selectedApplicationId}`, {
        method: 'DELETE',
      })
    );
    clearDetailPanel();
    await refreshApplicationsList();
  } catch (error) {
    setMessage(error.message || 'Failed to delete application.', 'error');
  }
});
