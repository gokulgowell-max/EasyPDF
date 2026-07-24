// app.js - Core application logic, Google Sheets Sync, visual editor, and router for Gowell InfoHub

// --- GLOBAL APPLICATION STATE ---
const state = {
  teams: [],
  projects: [],
  currentView: 'home', // 'home' | 'team' | 'admin'
  currentTeamId: null,
  activeFilterStatus: 'ongoing', // 'all' | 'ongoing' | 'upcoming' | 'completed'
  searchQuery: '',
  adminActiveTab: 'projects', // 'projects' | 'teams' | 'settings'
  selectedProject: null,
  theme: 'light',
  isLoggedIn: false,
  
  // Modal states
  showTableDialog: false,
  
  // Forms state
  editingProjectId: null,
  editingTeamId: null
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  // Initialize storage & state
  db.init();
  state.teams = db.getTeams();
  state.projects = db.getProjects();
  
  // Theme check
  const savedTheme = localStorage.getItem('gowell_theme') || 'light';
  setTheme(savedTheme);
  
  // Check active admin session (simple session preservation)
  const sessionToken = sessionStorage.getItem('gowell_admin_token');
  if (sessionToken === 'authenticated') {
    state.isLoggedIn = true;
  }
  
  // Initialize routes from hash URL
  handleRouting();
  window.addEventListener('hashchange', handleRouting);
  
  // Bind Global UI Events
  bindGlobalEvents();

  // Trigger Google Sheet Auto Sync if enabled
  if (db.isSheetSyncEnabled() && db.getSheetId()) {
    triggerGoogleSheetsSync(true); // silent/on-load sync
  }
});

// --- THEME MANAGEMENT ---
function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('gowell_theme', theme);
  
  const themeBtnIcon = document.querySelector('.theme-toggle-btn i');
  if (themeBtnIcon) {
    themeBtnIcon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }
}

// --- ROUTER / VIEW SWITCHER ---
function handleRouting() {
  const hash = window.location.hash;
  
  if (hash === '' || hash === '#home') {
    state.currentView = 'home';
    state.currentTeamId = null;
  } else if (hash.startsWith('#team/')) {
    state.currentView = 'team';
    state.currentTeamId = hash.split('/')[1];
    state.activeFilterStatus = 'ongoing';
    state.searchQuery = '';
  } else if (hash === '#admin') {
    state.currentView = 'admin';
  } else {
    window.location.hash = '#home';
    return;
  }
  
  renderApp();
}

function navigateTo(hash) {
  window.location.hash = hash;
}

// --- RENDER APP ENGINE ---
function renderApp() {
  // Hide all main containers
  document.getElementById('home-view').style.display = 'none';
  document.getElementById('team-view').style.display = 'none';
  document.getElementById('admin-view').style.display = 'none';
  
  // Update header buttons active state
  const adminNavBtn = document.getElementById('nav-admin-btn');
  if (state.currentView === 'admin') {
    adminNavBtn.innerHTML = '<i class="fa-solid fa-house"></i> View Site';
    adminNavBtn.onclick = () => navigateTo('#home');
  } else {
    adminNavBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Admin Portal';
    adminNavBtn.onclick = () => navigateTo('#admin');
  }

  // Render view content
  if (state.currentView === 'home') {
    document.getElementById('home-view').style.display = 'block';
    renderHomeView();
  } else if (state.currentView === 'team') {
    document.getElementById('team-view').style.display = 'block';
    renderTeamView();
  } else if (state.currentView === 'admin') {
    document.getElementById('admin-view').style.display = 'block';
    renderAdminView();
  }
}

// --- HOME VIEW RENDERING ---
function renderHomeView() {
  // Refresh stats
  const totalTeams = state.teams.length;
  const totalProjects = state.projects.length;
  const ongoingCount = state.projects.filter(p => p.status === 'ongoing').length;
  const upcomingCount = state.projects.filter(p => p.status === 'upcoming').length;
  const completedCount = state.projects.filter(p => p.status === 'completed').length;
  
  // Render teams grid
  const grid = document.getElementById('teams-grid-container');
  grid.innerHTML = '';
  
  state.teams.forEach(team => {
    const teamProjects = state.projects.filter(p => p.teamId === team.id);
    const card = document.createElement('div');
    card.className = 'team-card';
    card.onclick = () => navigateTo(`#team/${team.id}`);
    
    card.innerHTML = `
      <div class="team-icon-wrapper">
        <i class="fa-solid ${team.icon || 'fa-users'}"></i>
      </div>
      <h3>${escapeHTML(team.name)}</h3>
      <p>${escapeHTML(team.description)}</p>
      <div class="team-card-footer">
        <span>${teamProjects.length} Projects</span>
        <i class="fa-solid fa-arrow-right"></i>
      </div>
    `;
    grid.appendChild(card);
  });
}

// --- TEAM VIEW RENDERING ---
function renderTeamView() {
  const team = state.teams.find(t => t.id === state.currentTeamId);
  if (!team) {
    navigateTo('#home');
    return;
  }
  
  // Team Header
  document.getElementById('team-view-title').innerHTML = `
    <i class="fa-solid ${team.icon || 'fa-users'}" style="color: var(--primary-color);"></i>
    ${escapeHTML(team.name)}
  `;
  document.getElementById('team-view-desc').innerText = team.description;
  
  // Refresh project lists
  const teamProjects = state.projects.filter(p => p.teamId === team.id);
  
  // Calculate tabs counts
  const counts = {
    all: teamProjects.length,
    ongoing: teamProjects.filter(p => p.status === 'ongoing').length,
    upcoming: teamProjects.filter(p => p.status === 'upcoming').length,
    completed: teamProjects.filter(p => p.status === 'completed').length
  };
  
  // Set tab badges
  document.getElementById('badge-all').innerText = counts.all;
  document.getElementById('badge-ongoing').innerText = counts.ongoing;
  document.getElementById('badge-upcoming').innerText = counts.upcoming;
  document.getElementById('badge-completed').innerText = counts.completed;
  
  // Highlight correct active tab
  document.querySelectorAll('.status-tab').forEach(tab => {
    if (tab.dataset.status === state.activeFilterStatus) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
  
  // Filter & Search projects
  let filteredProjects = teamProjects;
  if (state.activeFilterStatus !== 'all') {
    filteredProjects = filteredProjects.filter(p => p.status === state.activeFilterStatus);
  }
  
  if (state.searchQuery.trim() !== '') {
    const query = state.searchQuery.toLowerCase();
    filteredProjects = filteredProjects.filter(p => 
      p.title.toLowerCase().includes(query) || 
      p.summary.toLowerCase().includes(query)
    );
  }
  
  // Sort projects: newly created first
  filteredProjects.sort((a, b) => {
    const timeA = (a.id && a.id.startsWith('proj-')) ? parseInt(a.id.split('-')[1]) || new Date(a.updatedAt || 0).getTime() : new Date(a.updatedAt || 0).getTime();
    const timeB = (b.id && b.id.startsWith('proj-')) ? parseInt(b.id.split('-')[1]) || new Date(b.updatedAt || 0).getTime() : new Date(b.updatedAt || 0).getTime();
    return timeB - timeA;
  });

  // Render Project Cards
  const container = document.getElementById('projects-grid-container');
  container.innerHTML = '';
  
  if (filteredProjects.length === 0) {
    container.innerHTML = `
      <div class="no-projects">
        <i class="fa-solid fa-folder-open"></i>
        <p>No projects found in this category.</p>
      </div>
    `;
    return;
  }
  
  filteredProjects.forEach(proj => {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.onclick = () => openProjectModal(proj.id);
    
    // Status text & icon (Static Ongoing)
    let statusLabel = 'Ongoing';
    let statusIcon = 'fa-circle-dot';
    if (proj.status === 'upcoming') {
      statusLabel = 'Upcoming';
      statusIcon = 'fa-calendar-days';
    } else if (proj.status === 'completed') {
      statusLabel = 'Completed';
      statusIcon = 'fa-circle-check';
    }
    
    const formattedDate = new Date(proj.updatedAt || Date.now()).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
    
    card.innerHTML = `
      <div class="card-header">
        <span class="project-tag ${proj.status}">
          <i class="fa-solid ${statusIcon}"></i> ${statusLabel}
        </span>
      </div>
      <h4>${escapeHTML(proj.title)}</h4>
      <p class="project-summary">${escapeHTML(proj.summary)}</p>
      <div class="project-card-footer">
        <span>Updated: ${formattedDate}</span>
        <span class="click-hint">Read Details <i class="fa-solid fa-chevron-right"></i></span>
      </div>
    `;
    container.appendChild(card);
  });
}

// --- PROJECT DETAIL MODAL ---
function openProjectModal(projectId) {
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;
  
  const team = state.teams.find(t => t.id === project.teamId);
  state.selectedProject = project;
  
  // Fill Modal Contents
  document.getElementById('modal-project-title').innerText = project.title;
  document.getElementById('modal-project-team').innerHTML = `
    <i class="fa-solid fa-users"></i> ${escapeHTML(team ? team.name : 'Unknown Team')}
  `;
  
  // Status tag (Static Ongoing Icon)
  const statusBadge = document.getElementById('modal-project-status');
  statusBadge.className = `project-tag ${project.status}`;
  let statusText = 'Ongoing';
  let statusIcon = 'fa-circle-dot';
  if (project.status === 'upcoming') {
    statusText = 'Upcoming';
    statusIcon = 'fa-calendar-days';
  } else if (project.status === 'completed') {
    statusText = 'Completed';
    statusIcon = 'fa-circle-check';
  }
  statusBadge.innerHTML = `<i class="fa-solid ${statusIcon}"></i> ${statusText}`;
  
  // Detailed text body
  document.getElementById('modal-project-body').innerHTML = project.details || `<p>${escapeHTML(project.summary)}</p>`;
  
  // Wrap all tables inside the modal body to enable responsive scrolling with freeze header
  const tables = document.querySelectorAll('#modal-project-body table');
  tables.forEach(table => {
    if (table.parentElement && !table.parentElement.classList.contains('table-scroll-container')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'table-scroll-container';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    }
  });

  // Handle Positions Rendering in Modal
  const positionsContainer = document.getElementById('modal-project-positions-container');
  const positionsList = document.getElementById('modal-project-positions-list');
  positionsContainer.style.display = 'none';
  positionsList.innerHTML = '';
  
  if (project.positions) {
    try {
      const positions = JSON.parse(project.positions);
      if (Array.isArray(positions) && positions.length > 0) {
        positionsList.style.display = 'flex';
        positionsList.style.flexDirection = 'column';
        positionsList.style.gap = '20px';
        
        positions.forEach(pos => {
          const section = document.createElement('div');
          section.className = 'position-section-card';
          section.style.cssText = `
            background: var(--bg-card); 
            border: 1px solid var(--border-color); 
            padding: 20px; 
            border-radius: var(--radius-md); 
            box-shadow: var(--shadow-sm);
          `;
          
          const bodyId = 'pos-body-' + Math.random().toString(36).substring(2, 9);
          
          // Header for position (Accordion Toggle)
          let html = `
            <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; padding: 10px; border-radius: var(--radius-sm); transition: background 0.2s ease;" onmouseover="this.style.background='var(--bg-main)'" onmouseout="this.style.background='transparent'" onclick="const body = document.getElementById('${bodyId}'); const icon = this.querySelector('.toggle-icon'); if (body.style.display === 'none') { body.style.display = 'block'; this.style.borderBottom = '1px solid var(--border-color)'; this.style.paddingBottom = '16px'; this.style.marginBottom = '12px'; icon.className = 'fa-solid fa-chevron-up toggle-icon'; } else { body.style.display = 'none'; this.style.borderBottom = 'none'; this.style.paddingBottom = '10px'; this.style.marginBottom = '0'; icon.className = 'fa-solid fa-chevron-down toggle-icon'; }">
              <h4 style="color: var(--primary-color); margin: 0; font-size:1.15rem; display:flex; align-items:center; gap:8px;">
                <i class="fa-solid fa-user-tie"></i> ${escapeHTML(pos.title)}
              </h4>
              <span style="background:var(--status-ongoing-bg); color:var(--status-ongoing); padding:4px 12px; border-radius:50px; font-weight:700; font-size:0.8rem; border:1px solid var(--status-ongoing); white-space: nowrap; display:flex; align-items:center; gap:8px;">
                ${pos.count} Opening${pos.count > 1 ? 's' : ''}
                <i class="fa-solid fa-chevron-down toggle-icon" style="font-size: 0.8rem; opacity: 0.8;"></i>
              </span>
            </div>
            <div id="${bodyId}" style="display:none; padding: 0 10px 10px 10px;">
          `;
          
          // Migrate old formats dynamically if they are loaded
          let requirements = pos.requirements || [];
          if (requirements.length === 0) {
            if (pos.qualification) requirements.push({ label: 'QUALIFICATION', value: pos.qualification });
            if (pos.experience) requirements.push({ label: 'EXPERIENCE', value: pos.experience });
            
            const currency = pos.currency || 'EURO';
            const salaryVal = pos.salaryVal || pos.salaryEuro || '';
            if (salaryVal) requirements.push({ label: `SALARY (${currency.toUpperCase()})`, value: salaryVal });
            
            if (pos.salaryInr) requirements.push({ label: 'SALARY (INR)', value: pos.salaryInr });
          }
          
          // Build specifications table from dynamic requirements array
          if (requirements.length > 0) {
            html += `
              <div class="table-scroll-container" style="margin: 12px 0;">
                <table class="gowell-striped-table" style="width: 100%; border-collapse: separate !important; border-spacing: 0 !important; margin: 0 !important; border: none !important;">
                  <thead>
                    <tr>
            `;
            
            // Generate headers
            requirements.forEach(req => {
              html += `<th style="background-color: var(--table-header-bg) !important; color: var(--table-header-text) !important; text-transform: uppercase;">${escapeHTML(req.label)}</th>`;
            });
            
            html += `
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
            `;
            
            // Generate cell values
            requirements.forEach(req => {
              html += `<td style="border-bottom: 1px solid var(--table-border);">${escapeHTML(req.value || 'N/A')}</td>`;
            });
            
            html += `
                    </tr>
                  </tbody>
                </table>
              </div>
            `;
          }
          
          // Additional notes/description (HTML format from editor)
          if (pos.description && pos.description.trim() !== '' && pos.description !== '<p><br></p>') {
            html += `
              <div style="margin-top:12px; padding:12px; background:var(--bg-main); border-radius:var(--radius-sm); font-size:0.95rem; color:var(--text-muted); line-height:1.6;">
                <strong style="display:block; margin-bottom:6px; color:var(--text-main);">Position Specifications:</strong>
                <div class="rich-text-content">${pos.description}</div>
              </div>
            `;
          }
          
          html += `</div>`;
          
          section.innerHTML = html;
          positionsList.appendChild(section);
        });
        positionsContainer.style.display = 'block';
      }
    } catch (e) {
      console.error("Failed to parse project positions inside modal:", e);
    }
  }
  
  // Show modal
  const modal = document.getElementById('project-detail-modal');
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeProjectModal() {
  const modal = document.getElementById('project-detail-modal');
  modal.classList.remove('active');
  document.body.style.overflow = '';
  state.selectedProject = null;
}

// --- ADMIN PORTAL VIEW ---
function renderAdminView() {
  const loginSection = document.getElementById('admin-login-section');
  const dashSection = document.getElementById('admin-dashboard-section');
  
  if (!state.isLoggedIn) {
    loginSection.style.display = 'block';
    dashSection.style.display = 'none';
    document.getElementById('admin-login-pwd').value = '';
    document.getElementById('admin-login-pwd').focus();
    return;
  }
  
  loginSection.style.display = 'none';
  dashSection.style.display = 'block';
  
  // Set Active sidebar option
  document.querySelectorAll('.admin-menu-item').forEach(item => {
    item.classList.remove('active');
    if (item.dataset.tab === state.adminActiveTab) {
      item.classList.add('active');
    }
  });
  
  // Hide all panels
  document.getElementById('admin-projects-panel').style.display = 'none';
  document.getElementById('admin-teams-panel').style.display = 'none';
  document.getElementById('admin-settings-panel').style.display = 'none';
  document.getElementById('admin-project-form-panel').style.display = 'none';
  document.getElementById('admin-team-form-panel').style.display = 'none';
  
  // Show active panel
  if (state.adminActiveTab === 'projects') {
    document.getElementById('admin-projects-panel').style.display = 'block';
    renderAdminProjectsList();
  } else if (state.adminActiveTab === 'teams') {
    document.getElementById('admin-teams-panel').style.display = 'block';
    renderAdminTeamsList();
  } else if (state.adminActiveTab === 'settings') {
    document.getElementById('admin-settings-panel').style.display = 'block';
    populateSettingsFields();
  }
}

// Admin project list render
function renderAdminProjectsList() {
  const tbody = document.querySelector('#admin-projects-table tbody');
  tbody.innerHTML = '';
  
  if (state.projects.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No projects in database. Click Add Project to start.</td></tr>';
    return;
  }
  
  state.projects.forEach(proj => {
    const team = state.teams.find(t => t.id === proj.teamId);
    const row = document.createElement('tr');
    
    let statusText = `<span class="project-tag ${proj.status}" style="font-size:0.75rem;">${proj.status}</span>`;
    const dateText = new Date(proj.updatedAt || Date.now()).toLocaleDateString('en-US');
    
    row.innerHTML = `
      <td style="font-weight:600;">${escapeHTML(proj.title)}</td>
      <td>${escapeHTML(team ? team.name : 'Deleted Team')}</td>
      <td>${statusText}</td>
      <td>${dateText}</td>
      <td>
        <div class="action-buttons">
          <button class="btn-icon edit" onclick="showProjectForm('edit', '${proj.id}')" title="Edit Project"><i class="fa-solid fa-pencil"></i></button>
          <button class="btn-icon delete" onclick="deleteProject('${proj.id}')" title="Delete Project"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Admin team list render
function renderAdminTeamsList() {
  const tbody = document.querySelector('#admin-teams-table tbody');
  tbody.innerHTML = '';
  
  state.teams.forEach(team => {
    const teamProjects = state.projects.filter(p => p.teamId === team.id);
    const row = document.createElement('tr');
    
    row.innerHTML = `
      <td><span class="logo-icon" style="width:30px; height:30px; font-size:0.9rem;"><i class="fa-solid ${team.icon || 'fa-users'}"></i></span></td>
      <td style="font-weight:600;">${escapeHTML(team.name)}</td>
      <td style="max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(team.description)}</td>
      <td>${teamProjects.length}</td>
      <td>
        <div class="action-buttons">
          <button class="btn-icon edit" onclick="showTeamForm('edit', '${team.id}')" title="Edit Team"><i class="fa-solid fa-pencil"></i></button>
          <button class="btn-icon delete" onclick="deleteTeam('${team.id}')" title="Delete Team"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// --- ADMIN LOGIN LOGIC ---
function handleAdminLogin(event) {
  event.preventDefault();
  const password = document.getElementById('admin-login-pwd').value;
  const correctPassword = db.getAdminPassword();
  
  if (password === correctPassword) {
    state.isLoggedIn = true;
    sessionStorage.setItem('gowell_admin_token', 'authenticated');
    renderAdminView();
  } else {
    alert('Invalid admin password! Please try again.');
  }
}

function handleAdminLogout() {
  if (confirm('Are you sure you want to log out from the Admin Portal?')) {
    state.isLoggedIn = false;
    sessionStorage.removeItem('gowell_admin_token');
    navigateTo('#home');
  }
}

// --- PROJECT CREATE/EDIT FORM LOGIC ---
function showProjectForm(mode, projectId = null) {
  state.adminActiveTab = '';
  document.querySelectorAll('.admin-menu-item').forEach(item => item.classList.remove('active'));
  
  document.getElementById('admin-projects-panel').style.display = 'none';
  document.getElementById('admin-project-form-panel').style.display = 'block';
  
  const formTitle = document.getElementById('project-form-title');
  const teamSelect = document.getElementById('project-form-team');
  
  teamSelect.innerHTML = '';
  state.teams.forEach(t => {
    const opt = document.createElement('option');
              opt.value = t.id;
    opt.innerText = t.name;
    teamSelect.appendChild(opt);
  });
  
  const positionsInputsContainer = document.getElementById('project-positions-inputs-container');
  positionsInputsContainer.innerHTML = '';
  
  if (mode === 'add') {
    state.editingProjectId = null;
    formTitle.innerText = 'Add New Project';
    document.getElementById('project-form-title-input').value = '';
    document.getElementById('project-form-status').value = 'ongoing';
    document.getElementById('project-form-summary').value = '';
  } else {
    state.editingProjectId = projectId;
    formTitle.innerText = 'Edit Project';
    
    const project = state.projects.find(p => p.id === projectId);
    if (project) {
      document.getElementById('project-form-title-input').value = project.title;
      document.getElementById('project-form-team').value = project.teamId;
      document.getElementById('project-form-status').value = project.status;
      document.getElementById('project-form-summary').value = project.summary;
      // Populate existing positions if any
      if (project.positions) {
        try {
          const positions = JSON.parse(project.positions);
          if (Array.isArray(positions)) {
            positions.forEach(pos => {
              createPositionInputRow(pos);
            });
          }
        } catch (e) {
          console.error("Failed to parse project positions:", e);
        }
      }
    }
  }
}

function hideProjectForm() {
  state.adminActiveTab = 'projects';
  renderAdminView();
}

function saveProject(event) {
  event.preventDefault();
  
  const title = document.getElementById('project-form-title-input').value.trim();
  const teamId = document.getElementById('project-form-team').value;
  const status = document.getElementById('project-form-status').value;
  const summary = document.getElementById('project-form-summary').value.trim();
  
  let details = '';
  
  if (title === '' || summary === '') {
    alert('Please enter project title and brief summary!');
    return;
  }
  
  // Read dynamic positions & vacancies inputs
  const positionCards = document.querySelectorAll('.position-input-card');
  const positions = [];
  positionCards.forEach(card => {
    const titleInput = card.querySelector('.pos-title-input');
    const countInput = card.querySelector('.pos-count-input');
    const descriptionInput = card.querySelector('.pos-description-input');
    
    const sourceTextarea = card.querySelector('.pos-description-source');
    
    // Read dynamic requirement table fields
    const reqRows = card.querySelectorAll('.pos-req-row');
    const requirements = [];
    reqRows.forEach(row => {
      const labelInput = row.querySelector('.pos-req-label');
      const valInput = row.querySelector('.pos-req-val');
      if (labelInput && valInput) {
        const label = labelInput.value.trim();
        const value = valInput.value.trim();
        if (label || value) {
          requirements.push({ label, value });
        }
      }
    });
    
    if (titleInput && countInput) {
      const title = titleInput.value.trim();
      const count = parseInt(countInput.value) || 0;
      if (title && count > 0) {
        let descContent = '';
        if (sourceTextarea && sourceTextarea.style.display !== 'none') {
          descContent = sourceTextarea.value.trim();
        } else if (descriptionInput) {
          descContent = descriptionInput.innerHTML.trim();
        }
        positions.push({
          title,
          count,
          requirements,
          description: descContent
        });
      }
    }
  });
  const positionsJSON = JSON.stringify(positions);
  
  let targetProject;
  if (state.editingProjectId) {
    const idx = state.projects.findIndex(p => p.id === state.editingProjectId);
    if (idx !== -1) {
      state.projects[idx] = {
        ...state.projects[idx],
        title,
        teamId,
        status,
        summary,
        details,
        positions: positionsJSON,
        updatedAt: new Date().toISOString()
      };
      targetProject = state.projects[idx];
    }
  } else {
    const newId = 'proj-' + Date.now();
    targetProject = {
      id: newId,
      teamId,
      title,
      status,
      summary,
      details,
      positions: positionsJSON,
      updatedAt: new Date().toISOString()
    };
    state.projects.push(targetProject);
  }
  
  // Save database locally
  db.saveProjects(state.projects);
  
  // Write back to Google Sheets if Web App URL is configured
  if (db.getAppsScriptUrl()) {
    triggerGoogleSheetsPush();
  } else {
    alert('Project saved successfully to local workspace database! Note: Connect Google Apps Script URL in Settings to sync live to your Google Sheet.');
    hideProjectForm();
  }
}

function deleteProject(projectId) {
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;
  
  if (confirm(`Are you sure you want to delete the project "${project.title}"? This action cannot be undone.`)) {
    state.projects = state.projects.filter(p => p.id !== projectId);
    db.saveProjects(state.projects);
    
    if (db.getAppsScriptUrl()) {
      triggerGoogleSheetsPush();
    } else {
      alert('Project deleted successfully from local workspace database!');
      renderAdminProjectsList();
    }
  }
}

// --- TEAM CREATE/EDIT FORM LOGIC ---
function showTeamForm(mode, teamId = null) {
  state.adminActiveTab = '';
  document.querySelectorAll('.admin-menu-item').forEach(item => item.classList.remove('active'));
  
  document.getElementById('admin-teams-panel').style.display = 'none';
  document.getElementById('admin-team-form-panel').style.display = 'block';
  
  const formTitle = document.getElementById('team-form-title');
  
  if (mode === 'add') {
    state.editingTeamId = null;
    formTitle.innerText = 'Add New Team';
    document.getElementById('team-form-name-input').value = '';
    document.getElementById('team-form-icon-select').value = 'fa-globe';
    document.getElementById('team-form-desc').value = '';
  } else {
    state.editingTeamId = teamId;
    formTitle.innerText = 'Edit Team';
    
    const team = state.teams.find(t => t.id === teamId);
    if (team) {
      document.getElementById('team-form-name-input').value = team.name;
      document.getElementById('team-form-icon-select').value = team.icon || 'fa-globe';
      document.getElementById('team-form-desc').value = team.description;
    }
  }
}

function hideTeamForm() {
  state.adminActiveTab = 'teams';
  renderAdminView();
}

function saveTeam(event) {
  event.preventDefault();
  
  const name = document.getElementById('team-form-name-input').value.trim();
  const icon = document.getElementById('team-form-icon-select').value;
  const description = document.getElementById('team-form-desc').value.trim();
  
  if (name === '' || description === '') {
    alert('Please fill out all team fields!');
    return;
  }
  
  if (state.editingTeamId) {
    const idx = state.teams.findIndex(t => t.id === state.editingTeamId);
    if (idx !== -1) {
      state.teams[idx] = {
        ...state.teams[idx],
        name,
        icon,
        description
      };
    }
  } else {
    let newId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    if (!newId) newId = 'team-' + Date.now();
    
    if (state.teams.some(t => t.id === newId)) {
      newId = newId + '-' + Date.now();
    }
    
    state.teams.push({
      id: newId,
      name,
      icon,
      description
    });
  }
  
  db.saveTeams(state.teams);
  
  if (db.getAppsScriptUrl()) {
    triggerGoogleSheetsPush();
  } else {
    alert('Division saved successfully to local workspace database!');
    hideTeamForm();
  }
}

function deleteTeam(teamId) {
  const team = state.teams.find(t => t.id === teamId);
  if (!team) return;
  
  const teamProjects = state.projects.filter(p => p.teamId === teamId);
  if (teamProjects.length > 0) {
    alert(`Cannot delete this team because it contains ${teamProjects.length} active project(s). You must first reassign or delete these projects.`);
    return;
  }
  
  if (confirm(`Are you sure you want to delete the team "${team.name}"?`)) {
    state.teams = state.teams.filter(t => t.id !== teamId);
    db.saveTeams(state.teams);
    
    if (db.getAppsScriptUrl()) {
      triggerGoogleSheetsPush();
    } else {
      alert('Division deleted successfully from local workspace database!');
      renderAdminTeamsList();
    }
  }
}

// --- SETTINGS CONTROLS & BINDINGS ---
function populateSettingsFields() {
  document.getElementById('settings-sheet-id').value = db.getSheetId();
  document.getElementById('settings-script-url').value = db.getAppsScriptUrl();
  document.getElementById('settings-auto-sync').checked = db.isSheetSyncEnabled();
  
  // Bind onchange settings auto saving
  document.getElementById('settings-sheet-id').onchange = (e) => db.saveSheetId(e.target.value);
  document.getElementById('settings-script-url').onchange = (e) => db.saveAppsScriptUrl(e.target.value);
  document.getElementById('settings-auto-sync').onchange = (e) => db.setSheetSyncEnabled(e.target.checked);
}

function changePassword(event) {
  event.preventDefault();
  const currentPwd = document.getElementById('pwd-current').value;
  const newPwd = document.getElementById('pwd-new').value;
  const confirmPwd = document.getElementById('pwd-confirm').value;
  const savedPwd = db.getAdminPassword();
  
  if (currentPwd !== savedPwd) {
    alert('Incorrect current password!');
    return;
  }
  if (newPwd.length < 5) {
    alert('New password must be at least 5 characters long.');
    return;
  }
  if (newPwd !== confirmPwd) {
    alert('Confirm password does not match new password!');
    return;
  }
  
  db.saveAdminPassword(newPwd);
  alert('Admin password updated successfully!');
  document.getElementById('pwd-current').value = '';
  document.getElementById('pwd-new').value = '';
  document.getElementById('pwd-confirm').value = '';
}

function exportDatabase() {
  const dataStr = db.exportData();
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
  const exportFileDefaultName = `gowell_hub_backup_${new Date().toISOString().slice(0,10)}.json`;
  
  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();
}

function importDatabase(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const contents = e.target.result;
    const result = db.importData(contents);
    
    if (result.success) {
      state.teams = db.getTeams();
      state.projects = db.getProjects();
      alert(result.message);
      renderAdminView();
    } else {
      alert(result.message);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function resetToDefaultData() {
  if (confirm('Are you sure you want to reset all teams, projects, and connection settings? This will wipe Google Sheets config.')) {
    const result = db.resetToDefault();
    state.teams = db.getTeams();
    state.projects = db.getProjects();
    alert(result.message);
    renderAdminView();
  }
}

// --- GOOGLE SHEETS SYNC CONTROLLER ---

// UI loading triggers
function showSyncOverlay(title, msg) {
  document.getElementById('sync-title').innerText = title;
  document.getElementById('sync-message').innerText = msg;
  document.getElementById('sync-overlay').classList.add('active');
}

function hideSyncOverlay() {
  document.getElementById('sync-overlay').classList.remove('active');
}

// Public triggers for UI buttons
function syncFromGoogleSheetsBtn() {
  const sheetId = db.getSheetId();
  if (!sheetId) {
    alert('Please enter a valid Google Spreadsheet ID first!');
    return;
  }
  triggerGoogleSheetsSync(false);
}

function pushToGoogleSheetsBtn() {
  const scriptUrl = db.getAppsScriptUrl();
  if (!scriptUrl) {
    alert('You must provide a deployed Google Apps Script Web App URL in order to save/push database changes to Google Sheets! Please see the instruction guide below.');
    return;
  }
  triggerGoogleSheetsPush();
}

// Logic: Read Spreadsheet
async function triggerGoogleSheetsSync(isAutoOnLoad = false) {
  const sheetId = db.getSheetId();
  if (!sheetId) return;

  // Show sync overlay if it is a manual sync OR if we currently have no data loaded
  if (!isAutoOnLoad || state.teams.length === 0 || state.projects.length === 0) {
    showSyncOverlay('Fetching Google Sheet...', 'Downloading teams and projects lists from spreadsheet.');
  }

  try {
    // Fetch CSV files from spreadsheet using Google Sheets Visualization API to support specific tab names by parameter
    const teamsUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=Teams`;
    const projectsUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=Projects`;

    const [teamsRes, projectsRes] = await Promise.all([
      fetch(teamsUrl).then(r => { if (!r.ok) throw new Error('Teams fetch error'); return r.text(); }),
      fetch(projectsUrl).then(r => { if (!r.ok) throw new Error('Projects fetch error'); return r.text(); })
    ]);

    // Parse CSV rows
    const teamsRows = parseCSV(teamsRes);
    const projectsRows = parseCSV(projectsRes);

    if (teamsRows.length <= 1 && projectsRows.length <= 1) {
      throw new Error('Google Sheet tabs are empty or columns are uninitialized.');
    }

    // Process Teams rows: [id, name, icon, description]
    const parsedTeams = [];
    if (teamsRows.length > 1) {
      const headers = teamsRows[0].map(h => h.trim().toLowerCase());
      const idIdx = headers.indexOf('id');
      const nameIdx = headers.indexOf('name');
      const iconIdx = headers.indexOf('icon');
      const descIdx = headers.indexOf('description');

      if (idIdx !== -1 && nameIdx !== -1) {
        for (let i = 1; i < teamsRows.length; i++) {
          const row = teamsRows[i];
          if (!row[idIdx]) continue;
          parsedTeams.push({
            id: row[idIdx].trim(),
            name: row[nameIdx] ? row[nameIdx].trim() : '',
            icon: iconIdx !== -1 && row[iconIdx] ? row[iconIdx].trim() : 'fa-globe',
            description: descIdx !== -1 && row[descIdx] ? row[descIdx].trim() : ''
          });
        }
      }
    }

    // Process Projects rows: [id, teamid, title, status, summary, details, updatedat]
    const parsedProjects = [];
    if (projectsRows.length > 1) {
      const headers = projectsRows[0].map(h => h.trim().toLowerCase());
      const idIdx = headers.indexOf('id');
      const teamIdIdx = headers.indexOf('teamid');
      const titleIdx = headers.indexOf('title');
      const statusIdx = headers.indexOf('status');
      const summaryIdx = headers.indexOf('summary');
      const detailsIdx = headers.indexOf('details');
      const dateIdx = headers.indexOf('updatedat');
      const positionsIdx = headers.indexOf('positions');

      if (idIdx !== -1 && titleIdx !== -1) {
        for (let i = 1; i < projectsRows.length; i++) {
          const row = projectsRows[i];
          if (!row[idIdx]) continue;
          parsedProjects.push({
            id: row[idIdx].trim(),
            teamId: teamIdIdx !== -1 && row[teamIdIdx] ? row[teamIdIdx].trim() : '',
            title: row[titleIdx] ? row[titleIdx].trim() : '',
            status: statusIdx !== -1 && row[statusIdx] ? row[statusIdx].trim().toLowerCase() : 'ongoing',
            summary: summaryIdx !== -1 && row[summaryIdx] ? row[summaryIdx].trim() : '',
            details: detailsIdx !== -1 && row[detailsIdx] ? row[detailsIdx].trim() : '',
            updatedAt: dateIdx !== -1 && row[dateIdx] ? row[dateIdx].trim() : new Date().toISOString(),
            positions: positionsIdx !== -1 && row[positionsIdx] ? row[positionsIdx].trim() : ''
          });
        }
      }
    }

    // If both synced successfully and contain data, overwrite local database
    if (parsedTeams.length > 0) {
      state.teams = parsedTeams;
      db.saveTeams(parsedTeams);
    }
    if (parsedProjects.length > 0) {
      state.projects = parsedProjects;
      db.saveProjects(parsedProjects);
    }

    // Re-render
    renderApp();
    
    // Always hide sync overlay when finished fetching
    hideSyncOverlay();
    
    if (!isAutoOnLoad) {
      alert(`Synchronized with Google Sheets successfully!\nDownloaded: ${state.teams.length} Divisions and ${state.projects.length} Projects.`);
    }
  } catch (err) {
    console.error('Google Sheet synchronization failed:', err);
    hideSyncOverlay(); // Always hide sync overlay on error
    if (!isAutoOnLoad) {
      alert('Google Sheets Sync Failed!\n\nCheck if:\n1. Your Spreadsheet ID is correct.\n2. The spreadsheet sharing is set to "Anyone with the link can view".\n3. The spreadsheet has tabs named exactly "Teams" and "Projects".\n\nFalling back to locally cached offline database.');
    }
  }
}

// Logic: Write back changes using Apps Script Web App
async function triggerGoogleSheetsPush() {
  const scriptUrl = db.getAppsScriptUrl();
  if (!scriptUrl) return;

  showSyncOverlay('Syncing Google Sheet...', 'Uploading and saving changes to your spreadsheet backend.');

  try {
    const payload = {
      action: 'pushAll',
      teams: state.teams,
      projects: state.projects
    };

    // Make POST request to the Apps Script Web App URL
    // We send payload as raw text and avoid pre-flight CORS precheck conflicts using plain postData
    const response = await fetch(scriptUrl, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error('Server response error');
    }

    const data = await response.json();
    hideSyncOverlay();
    
    if (data.success) {
      alert('Spreadsheet synchronized successfully! All changes are now live on your Google Sheet.');
      // Return to admin views
      if (state.currentView === 'admin') {
        if (state.editingProjectId || state.editingTeamId) {
          hideProjectForm();
          hideTeamForm();
        } else {
          renderAdminView();
        }
      }
    } else {
      alert('Apps Script reported error: ' + data.message);
    }
  } catch (err) {
    console.error('Failed to sync to Google Sheet:', err);
    hideSyncOverlay();
    alert('Failed to save to Google Sheet!\n\nVerify that:\n1. The Google Apps Script is deployed as a Web App.\n2. Access permission is set to "Anyone" (even anonymous).\n3. You copied the correct Web App Deployment URL.\n\nChanges have been saved locally in your browser cache, but are not live in the Google Sheet yet.');
  }
}

// Custom CSV Parser that handles double quotes, commas, and multiline values
function parseCSV(text) {
  const lines = [];
  let currentLine = [];
  let currentVal = '';
  let inQuotes = false;
  
  if (!text) return [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentVal += '"';
          i++; // skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentLine.push(currentVal);
        currentVal = '';
      } else if (char === '\n' || char === '\r') {
        currentLine.push(currentVal);
        lines.push(currentLine);
        currentLine = [];
        currentVal = '';
        if (char === '\r' && nextChar === '\n') {
          i++; // skip LF
        }
      } else {
        currentVal += char;
      }
    }
  }
  
  // Capture residual values
  if (currentVal || currentLine.length > 0) {
    currentLine.push(currentVal);
    lines.push(currentLine);
  }
  
  return lines;
}

// --- WYSIWYG RICH TEXT EDITOR ENGINE ---
let sourceMode = false;

function initEditorState() {
  sourceMode = false;
  const canvas = document.getElementById('editor-canvas');
  const sourceTextarea = document.getElementById('editor-html-source');
  const sourceBtn = document.getElementById('editor-btn-source');
  
  canvas.style.display = 'block';
  sourceTextarea.style.display = 'none';
  sourceBtn.classList.remove('active');
  
  canvas.addEventListener('keyup', updateToolbarStates);
  canvas.addEventListener('mouseup', updateToolbarStates);
  
  // Initialize the history stack with current content
  historyState.init(canvas.innerHTML);
  
  canvas.focus();
}

function updateToolbarStates() {
  const formats = ['bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList'];
  formats.forEach(cmd => {
    const btn = document.getElementById(`editor-btn-${cmd}`);
    if (btn) {
      if (document.queryCommandState(cmd)) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  });
}

function execEditorCommand(command, value = null) {
  if (sourceMode) return;
  
  document.execCommand(command, false, value);
  const canvas = document.getElementById('editor-canvas');
  canvas.focus();
  updateToolbarStates();
  
  historyState.save(canvas.innerHTML);
}

function toggleSourceMode() {
  const canvas = document.getElementById('editor-canvas');
  const sourceTextarea = document.getElementById('editor-html-source');
  const sourceBtn = document.getElementById('editor-btn-source');
  
  sourceMode = !sourceMode;
  
  if (sourceMode) {
    sourceTextarea.value = canvas.innerHTML;
    canvas.style.display = 'none';
    sourceTextarea.style.display = 'block';
    sourceBtn.classList.add('active');
    
    document.querySelectorAll('.editor-toolbar button:not(#editor-btn-source):not(#editor-btn-undo):not(#editor-btn-redo)').forEach(btn => {
      btn.style.opacity = '0.5';
      btn.style.pointerEvents = 'none';
    });
    document.querySelectorAll('.editor-toolbar select').forEach(select => {
      select.disabled = true;
    });
  } else {
    canvas.innerHTML = sourceTextarea.value;
    sourceTextarea.style.display = 'none';
    canvas.style.display = 'block';
    sourceBtn.classList.remove('active');
    
    document.querySelectorAll('.editor-toolbar button:not(#editor-btn-source):not(#editor-btn-undo):not(#editor-btn-redo)').forEach(btn => {
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    });
    document.querySelectorAll('.editor-toolbar select').forEach(select => {
      select.disabled = false;
    });
    
    // Save history when returning from source view
    historyState.save(canvas.innerHTML);
    canvas.focus();
  }
}

// Zebra table insertion function
function openTableCreator() {
  if (sourceMode) return;
  const dialog = document.getElementById('table-creator-dialog');
  dialog.classList.add('active');
  document.getElementById('table-rows').value = '3';
  document.getElementById('table-cols').value = '3';
  document.getElementById('table-rows').focus();
}

function closeTableCreator() {
  const dialog = document.getElementById('table-creator-dialog');
  dialog.classList.remove('active');
}

function confirmTableCreation() {
  const rows = parseInt(document.getElementById('table-rows').value) || 2;
  const cols = parseInt(document.getElementById('table-cols').value) || 2;
  
  closeTableCreator();
  if (typeof currentCardForTable !== 'undefined' && currentCardForTable) {
    insertZebraTableForCard(currentCardForTable, rows, cols);
    currentCardForTable = null;
  } else {
    insertZebraTable(rows, cols);
  }
}

function insertZebraTable(rows, cols) {
  const canvas = document.getElementById('editor-canvas');
  canvas.focus();
  
  let tableHTML = '<table class="gowell-striped-table" style="width: 100%; border-collapse: collapse; margin: 15px 0;">';
  tableHTML += '<thead><tr>';
  for (let c = 1; c <= cols; c++) {
    tableHTML += `<th>Heading ${c}</th>`;
  }
  tableHTML += '</tr></thead>';
  tableHTML += '<tbody>';
  for (let r = 1; r <= rows; r++) {
    tableHTML += '<tr>';
    for (let c = 1; c <= cols; c++) {
      tableHTML += `<td>Cell Row ${r} - Col ${c}</td>`;
    }
    tableHTML += '</tr>';
  }
  tableHTML += '</tbody></table><p><br></p>';
  
  const selection = window.getSelection();
  if (selection.getRangeAt && selection.rangeCount) {
    const range = selection.getRangeAt(0);
    if (canvas.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      
      const el = document.createElement("div");
      el.innerHTML = tableHTML;
      const frag = document.createDocumentFragment();
      let node, lastNode;
      while ((node = el.firstChild)) {
        lastNode = frag.appendChild(node);
      }
      range.insertNode(frag);
      
      if (lastNode) {
        range.setStartAfter(lastNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } else {
      canvas.innerHTML += tableHTML;
    }
  } else {
    canvas.innerHTML += tableHTML;
  }
  
  // Save history on new table creation
  historyState.save(canvas.innerHTML);
}

// --- GLOBAL BINDINGS ---
function bindGlobalEvents() {
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    themeBtn.onclick = () => {
      setTheme(state.theme === 'dark' ? 'light' : 'dark');
    };
  }
  
  const closeModalBtn = document.getElementById('close-modal-btn');
  if (closeModalBtn) {
    closeModalBtn.onclick = closeProjectModal;
  }
  
  const modalOverlay = document.getElementById('project-detail-modal');
  if (modalOverlay) {
    modalOverlay.onclick = (e) => {
      if (e.target === modalOverlay) closeProjectModal();
    };
  }
  
  const tableOverlay = document.getElementById('table-creator-dialog');
  if (tableOverlay) {
    tableOverlay.onclick = (e) => {
      if (e.target === tableOverlay) closeTableCreator();
    };
  }
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeProjectModal();
      closeTableCreator();
    }
  });

  // Bind Editor History Events
  const canvas = document.getElementById('editor-canvas');
  const sourceTextarea = document.getElementById('editor-html-source');
  
  if (canvas && sourceTextarea) {
    let inputTimeout = null;
    
    // Save history on input changes with debounce
    canvas.addEventListener('input', () => {
      if (inputTimeout) clearTimeout(inputTimeout);
      inputTimeout = setTimeout(() => {
        historyState.save(canvas.innerHTML);
      }, 500);
    });
    
    sourceTextarea.addEventListener('input', () => {
      if (inputTimeout) clearTimeout(inputTimeout);
      inputTimeout = setTimeout(() => {
        historyState.save(sourceTextarea.value);
      }, 500);
    });
    
    // Intercept keyboard shortcuts inside canvas
    canvas.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        historyState.undo();
      }
      if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        historyState.redo();
      }
    });
    
    // Intercept keyboard shortcuts inside source view
    sourceTextarea.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        historyState.undo();
      }
      if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        historyState.redo();
      }
    });
  }
}

function setupProjectFilters() {
  document.querySelectorAll('.status-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.status-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.activeFilterStatus = tab.dataset.status;
      renderTeamView();
    };
  });
  
  const searchInput = document.getElementById('project-search');
  if (searchInput) {
    searchInput.oninput = (e) => {
      state.searchQuery = e.target.value;
      renderTeamView();
    };
  }
}

function setAdminTab(tabName) {
  state.adminActiveTab = tabName;
  renderAdminView();
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- EDITOR HISTORY STATE MANAGEMENT (UNDO / REDO) ---

const historyState = {
  undoStack: [],
  redoStack: [],
  maxSize: 50,
  
  init: (initialHTML) => {
    historyState.undoStack = [initialHTML];
    historyState.redoStack = [];
    historyState.updateButtons();
  },
  
  save: (html) => {
    if (historyState.undoStack.length > 0 && historyState.undoStack[historyState.undoStack.length - 1] === html) {
      return;
    }
    historyState.undoStack.push(html);
    if (historyState.undoStack.length > historyState.maxSize) {
      historyState.undoStack.shift();
    }
    historyState.redoStack = [];
    historyState.updateButtons();
  },
  
  undo: () => {
    if (historyState.undoStack.length <= 1) return;
    const canvas = document.getElementById('editor-canvas');
    const current = historyState.undoStack.pop();
    historyState.redoStack.push(current);
    
    const previous = historyState.undoStack[historyState.undoStack.length - 1];
    canvas.innerHTML = previous;
    
    const sourceTextarea = document.getElementById('editor-html-source');
    if (sourceTextarea && sourceTextarea.style.display !== 'none') {
      sourceTextarea.value = previous;
    }
    
    historyState.updateButtons();
  },
  
  redo: () => {
    if (historyState.redoStack.length === 0) return;
    const canvas = document.getElementById('editor-canvas');
    const next = historyState.redoStack.pop();
    historyState.undoStack.push(next);
    
    canvas.innerHTML = next;
    
    const sourceTextarea = document.getElementById('editor-html-source');
    if (sourceTextarea && sourceTextarea.style.display !== 'none') {
      sourceTextarea.value = next;
    }
    
    historyState.updateButtons();
  },
  
  updateButtons: () => {
    const undoBtn = document.getElementById('editor-btn-undo');
    const redoBtn = document.getElementById('editor-btn-redo');
    
    if (undoBtn) {
      undoBtn.disabled = historyState.undoStack.length <= 1;
      undoBtn.style.opacity = historyState.undoStack.length <= 1 ? '0.4' : '1';
    }
    if (redoBtn) {
      redoBtn.disabled = historyState.redoStack.length === 0;
      redoBtn.style.opacity = historyState.redoStack.length === 0 ? '0.4' : '1';
    }
  }
};

// --- EXISTING TABLE EDITING OPERATIONS ---

function getSelectedTableCell(canvasContext = null) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return null;
  
  let node = selection.anchorNode;
  const canvas = canvasContext || document.getElementById('editor-canvas');
  
  while (node && node !== canvas && node !== document.body) {
    if (node.nodeName === 'TD' || node.nodeName === 'TH') {
      return node;
    }
    node = node.parentNode;
  }
  return null;
}

function handleTableAction(action) {
  if (!action) return;
  
  const cell = getSelectedTableCell();
  if (!cell) {
    alert("Please place your cursor inside a table cell to modify the table.");
    return;
  }
  
  const row = cell.closest('tr');
  const table = cell.closest('table');
  
  switch (action) {
    case 'addRowAbove':
      insertTableRow(row, true);
      break;
    case 'addRowBelow':
      insertTableRow(row, false);
      break;
    case 'deleteRow':
      deleteTableRow(row, table);
      break;
    case 'addColumnLeft':
      insertTableColumn(table, cell.cellIndex, true);
      break;
    case 'addColumnRight':
      insertTableColumn(table, cell.cellIndex, false);
      break;
    case 'deleteColumn':
      deleteTableColumn(table, cell.cellIndex);
      break;
  }
  
  // Save canvas state after modifying existing table
  historyState.save(document.getElementById('editor-canvas').innerHTML);
}

function insertTableRow(currentRow, above) {
  const newRow = document.createElement('tr');
  const numCells = currentRow.cells.length;
  
  for (let i = 0; i < numCells; i++) {
    const isHeader = currentRow.cells[i].nodeName === 'TH';
    const newCell = document.createElement(isHeader ? 'th' : 'td');
    newCell.innerHTML = '<br>';
    newRow.appendChild(newCell);
  }
  
  if (above) {
    currentRow.parentNode.insertBefore(newRow, currentRow);
  } else {
    currentRow.parentNode.insertBefore(newRow, currentRow.nextSibling);
  }
}

function deleteTableRow(currentRow, table) {
  const allRows = table.querySelectorAll('tr');
  if (allRows.length <= 1) {
    if (confirm("This is the last row. Delete the entire table?")) {
      table.remove();
    }
  } else {
    currentRow.remove();
  }
}

function insertTableColumn(table, colIndex, left) {
  const rows = table.querySelectorAll('tr');
  rows.forEach(r => {
    if (r.cells.length > colIndex) {
      const targetCell = r.cells[colIndex];
      const isHeader = targetCell.nodeName === 'TH';
      const newCell = document.createElement(isHeader ? 'th' : 'td');
      newCell.innerHTML = '<br>';
      
      if (left) {
        r.insertBefore(newCell, targetCell);
      } else {
        r.insertBefore(newCell, targetCell.nextSibling);
      }
    } else if (r.cells.length > 0) {
      const isHeader = r.parentNode.nodeName === 'THEAD';
      const newCell = document.createElement(isHeader ? 'th' : 'td');
      newCell.innerHTML = '<br>';
      r.appendChild(newCell);
    }
  });
}

function deleteTableColumn(table, colIndex) {
  const rows = table.querySelectorAll('tr');
  let maxCells = 0;
  rows.forEach(r => {
    if (r.cells.length > maxCells) {
      maxCells = r.cells.length;
    }
  });
  
  if (maxCells <= 1) {
    if (confirm("This is the last column. Delete the entire table?")) {
      table.remove();
      return;
    }
  }
  
  rows.forEach(r => {
    if (r.cells.length > colIndex) {
      r.cells[colIndex].remove();
    }
  });
}

// --- PROJECT OPENING POSITIONS FORM HELPERS ---

function addPositionInputRow() {
  createPositionInputRow({
    title: '',
    count: '',
    requirements: [
      { label: 'Qualification Required', value: '' },
      { label: 'Experience Required', value: '' },
      { label: 'Salary (Euro)', value: '' },
      { label: 'Salary (INR)', value: '' }
    ],
    description: '<p><br></p>'
  });
}

function createPositionInputRow(posData = {}) {
  const container = document.getElementById('project-positions-inputs-container');
  if (!container) return;
  
  // Migrate old formats dynamically if they are loaded
  let requirements = posData.requirements || [];
  if (requirements.length === 0) {
    if (posData.qualification) requirements.push({ label: 'Qualification Required', value: posData.qualification });
    if (posData.experience) requirements.push({ label: 'Experience Required', value: posData.experience });
    
    const currency = posData.currency || 'EURO';
    const salaryVal = posData.salaryVal || posData.salaryEuro || '';
    if (salaryVal) requirements.push({ label: `Salary (${currency})`, value: salaryVal });
    
    if (posData.salaryInr) requirements.push({ label: 'Salary (INR)', value: posData.salaryInr });
  }
  
  // Default fields for new position card if still empty
  if (requirements.length === 0) {
    requirements = [
      { label: 'Qualification Required', value: '' },
      { label: 'Experience Required', value: '' },
      { label: 'Salary (Euro)', value: '' },
      { label: 'Salary (INR)', value: '' }
    ];
  }
  
  const cardId = 'pos-card-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  const card = document.createElement('div');
  card.className = 'position-input-card';
  card.id = cardId;
  card.style.cssText = `
    border: 1px solid var(--border-color); 
    padding: 20px; 
    border-radius: var(--radius-sm); 
    background: var(--bg-main); 
    display: flex; 
    flex-direction: column; 
    gap: 15px; 
    position: relative;
    margin-bottom: 20px;
  `;
  
  // Generate HTML for requirements fields
  let reqsHTML = '';
  requirements.forEach((req) => {
    reqsHTML += createReqInputRowHTML(req.label, req.value);
  });
  
  card.innerHTML = `
    <button type="button" class="btn-icon delete" onclick="this.closest('.position-input-card').remove()" style="position: absolute; top: 12px; right: 12px; z-index: 5; height: 32px; width: 32px; display:flex; justify-content:center; align-items:center;" title="Remove Position"><i class="fa-solid fa-trash"></i></button>
    
    <div class="form-row">
      <div class="form-group">
        <label style="font-weight:600; font-size:0.85rem;">Position Name / Title</label>
        <input type="text" class="form-control pos-title-input" placeholder="e.g. Industrial Electrician" value="${escapeHTML(posData.title || '')}" required>
      </div>
      <div class="form-group">
        <label style="font-weight:600; font-size:0.85rem;">Openings Count</label>
        <input type="number" class="form-control pos-count-input" placeholder="e.g. 10" value="${posData.count || ''}" min="1" required>
      </div>
    </div>
    
    <!-- DYNAMIC SPECIFICATION FIELDS LIST -->
    <div class="form-group">
      <label style="display:flex; justify-content:space-between; align-items:center; font-weight:600; font-size:0.85rem;">
        <span>Position Requirements Table Fields</span>
        <button type="button" class="btn-secondary" onclick="addRequirementFieldToCard('${cardId}')" style="padding: 4px 10px; font-size: 0.75rem; height: 28px; display:flex; align-items:center; gap:4px; border-radius:4px;">
          <i class="fa-solid fa-plus"></i> Add Field
        </button>
      </label>
      <div class="pos-reqs-inputs-container" style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
        ${reqsHTML}
      </div>
    </div>
    
    <!-- FORMATTABLE JOB DETAILS -->
    <div class="form-group">
      <label style="font-weight:600; font-size:0.85rem;">Additional Specifications / Job Details (Formattable)</label>
      
      <!-- Full Formatting Toolbar for Position -->
      <div class="editor-toolbar" style="border: 1px solid var(--border-color); border-bottom: none; border-radius: var(--radius-sm) var(--radius-sm) 0 0; background: var(--bg-card); display: flex; flex-wrap: wrap; gap: 4px; padding: 8px; align-items: center;">
        <!-- Headings -->
        <select class="editor-select" onchange="execMiniCommand('${cardId}', 'formatBlock', this.value); this.selectedIndex=0;" title="Headers & Typography" style="height: 32px;">
          <option value="" disabled selected>Formatting</option>
          <option value="<h2>">Main Heading (H2)</option>
          <option value="<h3>">Subheading (H3)</option>
          <option value="<p>">Normal Paragraph</option>
        </select>
        
        <select class="editor-select" onchange="execMiniCommand('${cardId}', 'fontName', this.value); this.selectedIndex=0;" title="Font Family" style="height: 32px;">
          <option value="" disabled selected>Font Family</option>
          <option value="Arial">Arial</option>
          <option value="Courier New">Courier</option>
          <option value="Georgia">Georgia</option>
          <option value="Times New Roman">Times</option>
          <option value="Verdana">Verdana</option>
          <option value="Inter">Inter</option>
        </select>

        <select class="editor-select" onchange="execMiniCommand('${cardId}', 'fontSize', this.value); this.selectedIndex=0;" title="Font Size" style="height: 32px;">
          <option value="" disabled selected>Font Size</option>
          <option value="1">Smallest</option>
          <option value="2">Small</option>
          <option value="3">Normal</option>
          <option value="4">Medium</option>
          <option value="5">Large</option>
          <option value="6">Largest</option>
          <option value="7">Huge</option>
        </select>
        
        <select class="editor-select" onchange="applyLineHeight('${cardId}', this.value); this.selectedIndex=0;" title="Line Height" style="height: 32px;">
          <option value="" disabled selected>Line Height</option>
          <option value="1.0">1.0</option>
          <option value="1.2">1.2</option>
          <option value="1.5">1.5</option>
          <option value="2.0">2.0</option>
        </select>
        
        <div class="editor-divider"></div>
        
        <!-- Inline Styles -->
        <button type="button" class="editor-btn" onclick="execMiniCommand('${cardId}', 'bold')" title="Bold"><i class="fa-solid fa-bold"></i></button>
        <button type="button" class="editor-btn" onclick="execMiniCommand('${cardId}', 'italic')" title="Italic"><i class="fa-solid fa-italic"></i></button>
        <button type="button" class="editor-btn" onclick="execMiniCommand('${cardId}', 'underline')" title="Underline"><i class="fa-solid fa-underline"></i></button>
        
        <div class="editor-divider"></div>
        
        <!-- Alignments -->
        <button type="button" class="editor-btn" onclick="execMiniCommand('${cardId}', 'justifyLeft')" title="Align Left"><i class="fa-solid fa-align-left"></i></button>
        <button type="button" class="editor-btn" onclick="execMiniCommand('${cardId}', 'justifyCenter')" title="Align Center"><i class="fa-solid fa-align-center"></i></button>
        <button type="button" class="editor-btn" onclick="execMiniCommand('${cardId}', 'justifyRight')" title="Align Right"><i class="fa-solid fa-align-right"></i></button>
        <button type="button" class="editor-btn" onclick="execMiniCommand('${cardId}', 'justifyFull')" title="Justify"><i class="fa-solid fa-align-justify"></i></button>
        
        <div class="editor-divider"></div>
        
        <!-- Lists -->
        <button type="button" class="editor-btn" onclick="execMiniCommand('${cardId}', 'insertUnorderedList')" title="Bulleted List"><i class="fa-solid fa-list-ul"></i></button>
        <button type="button" class="editor-btn" onclick="execMiniCommand('${cardId}', 'insertOrderedList')" title="Numbered List"><i class="fa-solid fa-list-ol"></i></button>
        
        <div class="editor-divider"></div>
        
        <!-- Custom Actions (Tables) -->
        <button type="button" class="editor-btn" onclick="openTableCreatorForCard('${cardId}')" title="Insert Zebra Striped Table" style="color: var(--secondary-color); width: auto; padding: 0 10px;">
          <i class="fa-solid fa-table"></i> Insert Striped Table
        </button>
        
        <div class="editor-divider"></div>
        
        <select class="editor-select" onchange="handleTableActionForCard('${cardId}', this.value); this.selectedIndex=0;" title="Table Operations" style="color: var(--secondary-color); height: 32px;">
          <option value="" disabled selected>Table Actions</option>
          <option value="addRowAbove">Add Row Above</option>
          <option value="addRowBelow">Add Row Below</option>
          <option value="deleteRow">Delete Row</option>
          <option value="addColumnLeft">Add Column Left</option>
          <option value="addColumnRight">Add Column Right</option>
          <option value="deleteColumn">Delete Column</option>
        </select>
        
        <div class="editor-divider"></div>
        
        <!-- HTML Source view -->
        <button type="button" class="editor-btn source-btn-${cardId}" onclick="toggleSourceModeForCard('${cardId}')" title="Toggle Raw HTML Source" style="margin-left:auto; width: auto; padding: 0 10px;">
          <i class="fa-solid fa-code"></i> Source HTML
        </button>
      </div>
      
      <div class="form-control pos-description-input rich-text-content" contenteditable="true" style="min-height: 200px; overflow-y:auto; background: var(--bg-card); border-radius:0 0 var(--radius-sm) var(--radius-sm); outline:none; border-top:none; border:1px solid var(--border-color); padding:16px;" placeholder="Detailed Project Specifications & Requirements for this position...">${posData.description || '<p><br></p>'}</div>
      <textarea class="form-control pos-description-source" style="display:none; font-family:monospace; min-height:200px; border-radius:0 0 var(--radius-sm) var(--radius-sm); border:1px solid var(--border-color); border-top:none; resize:vertical; padding:16px;"></textarea>
    </div>
  `;
  container.appendChild(card);
  
  // Bind selection save events to the contenteditable editor
  const editor = card.querySelector('.pos-description-input');
  if (editor) {
    editor.addEventListener('mouseup', () => saveCardRange(cardId));
    editor.addEventListener('keyup', () => saveCardRange(cardId));
    editor.addEventListener('blur', () => saveCardRange(cardId));
    
    // Clean pasted HTML of custom font sizes, families, and colors
    editor.addEventListener('paste', (e) => {
      e.preventDefault();
      let html = (e.originalEvent || e).clipboardData.getData('text/html');
      if (!html) {
        const text = (e.originalEvent || e).clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
        return;
      }
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const allElements = doc.body.querySelectorAll('*');
      
      allElements.forEach(el => {
        el.style.fontSize = '';
        el.style.fontFamily = '';
        el.style.color = '';
        el.style.backgroundColor = '';
        el.removeAttribute('face');
        el.removeAttribute('size');
        el.removeAttribute('color');
        
        if (el.nodeName === 'FONT') {
          const span = doc.createElement('span');
          span.innerHTML = el.innerHTML;
          el.parentNode.replaceChild(span, el);
        }
      });
      
      document.execCommand('insertHTML', false, doc.body.innerHTML);
    });
  }
}

function createReqInputRowHTML(label = '', value = '') {
  return `
    <div class="pos-req-row" style="display:flex; gap:10px; align-items:center;">
      <input type="text" class="form-control pos-req-label" placeholder="Field Label (e.g. Qualification)" value="${escapeHTML(label)}" style="flex: 1;" required>
      <input type="text" class="form-control pos-req-val" placeholder="Field Value (e.g. ITI / Diploma)" value="${escapeHTML(value)}" style="flex: 2;" required>
      <button type="button" class="btn-icon delete" onclick="this.closest('.pos-req-row').remove()" title="Delete Field" style="height:36px; width:36px; min-width:36px; display:flex; justify-content:center; align-items:center;"><i class="fa-solid fa-xmark"></i></button>
    </div>
  `;
}

function addRequirementFieldToCard(cardId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const container = card.querySelector('.pos-reqs-inputs-container');
  if (!container) return;
  
  const div = document.createElement('div');
  div.innerHTML = createReqInputRowHTML('', '');
  container.appendChild(div.firstElementChild);
}

function execMiniCommand(cardId, command, value = null) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const editor = card.querySelector('.pos-description-input');
  if (!editor) return;
  
  editor.focus();
  restoreCardRange(cardId);
  document.execCommand(command, false, value);
  saveCardRange(cardId);
}

function applyLineHeight(cardId, value) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const editor = card.querySelector('.pos-description-input');
  if (!editor) return;
  
  editor.focus();
  restoreCardRange(cardId);
  
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    let node = selection.focusNode;
    let foundBlock = false;
    while (node && node !== editor) {
      if (node.nodeType === 1 && ['P', 'DIV', 'H1', 'H2', 'H3', 'LI', 'TD'].includes(node.tagName)) {
        node.style.lineHeight = value;
        foundBlock = true;
        break;
      }
      node = node.parentNode;
    }
    
    if (!foundBlock) {
      document.execCommand('formatBlock', false, 'p');
      // Re-evaluate after wrapping
      let newNode = window.getSelection().focusNode;
      while (newNode && newNode !== editor) {
        if (newNode.nodeType === 1 && newNode.tagName === 'P') {
          newNode.style.lineHeight = value;
          break;
        }
        newNode = newNode.parentNode;
      }
    }
  }
  
  saveCardRange(cardId);
}

let currentCardForTable = null;

function openTableCreatorForCard(cardId) {
  currentCardForTable = cardId;
  const dialog = document.getElementById('table-creator-dialog');
  if(dialog) dialog.classList.add('active');
  const rowsInput = document.getElementById('table-rows');
  if (rowsInput) {
    rowsInput.value = '3';
    document.getElementById('table-cols').value = '3';
    rowsInput.focus();
  }
}

function handleTableActionForCard(cardId, action) {
  if (!action) return;
  
  const card = document.getElementById(cardId);
  if (!card) return;
  const canvas = card.querySelector('.pos-description-input');
  if (!canvas) return;
  
  canvas.focus();
  restoreCardRange(cardId);
  
  const cell = getSelectedTableCell(canvas);
  if (!cell) {
    alert("Please place your cursor inside a table cell to modify the table.");
    return;
  }
  
  const row = cell.closest('tr');
  const table = cell.closest('table');
  
  switch (action) {
    case 'addRowAbove': insertTableRow(row, true); break;
    case 'addRowBelow': insertTableRow(row, false); break;
    case 'deleteRow': deleteTableRow(row, table); break;
    case 'addColumnLeft': insertTableColumn(table, cell.cellIndex, true); break;
    case 'addColumnRight': insertTableColumn(table, cell.cellIndex, false); break;
    case 'deleteColumn': deleteTableColumn(table, cell.cellIndex); break;
  }
  saveCardRange(cardId);
}

function insertZebraTableForCard(cardId, rows, cols) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const canvas = card.querySelector('.pos-description-input');
  if (!canvas) return;
  
  canvas.focus();
  restoreCardRange(cardId);
  
  let tableHTML = '<table class="gowell-striped-table" style="width: 100%; border-collapse: collapse; margin: 15px 0;">';
  tableHTML += '<thead><tr>';
  for (let c = 1; c <= cols; c++) {
    tableHTML += `<th>Heading ${c}</th>`;
  }
  tableHTML += '</tr></thead>';
  tableHTML += '<tbody>';
  for (let r = 1; r <= rows; r++) {
    tableHTML += '<tr>';
    for (let c = 1; c <= cols; c++) {
      tableHTML += `<td>Cell Row ${r} - Col ${c}</td>`;
    }
    tableHTML += '</tr>';
  }
  tableHTML += '</tbody></table><p><br></p>';
  
  document.execCommand('insertHTML', false, tableHTML);
  saveCardRange(cardId);
}

function toggleSourceModeForCard(cardId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const canvas = card.querySelector('.pos-description-input');
  const sourceTextarea = card.querySelector('.pos-description-source');
  const sourceBtn = card.querySelector('.source-btn-' + cardId);
  
  if (!canvas || !sourceTextarea) return;
  
  const isSourceMode = canvas.style.display === 'none';
  
  if (!isSourceMode) {
    sourceTextarea.value = canvas.innerHTML;
    canvas.style.display = 'none';
    sourceTextarea.style.display = 'block';
    if (sourceBtn) sourceBtn.classList.add('active');
    
    // Disable other buttons
    card.querySelectorAll('.editor-toolbar button:not(.source-btn-' + cardId + ')').forEach(btn => {
      btn.style.opacity = '0.5';
      btn.style.pointerEvents = 'none';
    });
    card.querySelectorAll('.editor-toolbar select').forEach(select => {
      select.disabled = true;
    });
  } else {
    canvas.innerHTML = sourceTextarea.value;
    sourceTextarea.style.display = 'none';
    canvas.style.display = 'block';
    if (sourceBtn) sourceBtn.classList.remove('active');
    
    // Enable other buttons
    card.querySelectorAll('.editor-toolbar button:not(.source-btn-' + cardId + ')').forEach(btn => {
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    });
    card.querySelectorAll('.editor-toolbar select').forEach(select => {
      select.disabled = false;
    });
  }
}

function setMiniFontSize(cardId, sizePx) {
  if (!sizePx) return;
  const card = document.getElementById(cardId);
  if (!card) return;
  const editor = card.querySelector('.pos-description-input');
  if (!editor) return;
  
  editor.focus();
  restoreCardRange(cardId);
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  
  const range = selection.getRangeAt(0);
  if (range.collapsed) return;
  
  // Strip preexisting inline font sizes from any elements inside the selection range
  const allElements = editor.querySelectorAll('*');
  allElements.forEach(el => {
    if (range.intersectsNode(el)) {
      el.style.fontSize = '';
      el.removeAttribute('size');
    }
  });
  
  // Use native execCommand font size tagger, then replace with inline styled span
  document.execCommand('fontSize', false, '7');
  const fontTags = editor.querySelectorAll('font[size="7"]');
  fontTags.forEach(font => {
    const span = document.createElement('span');
    span.style.fontSize = sizePx;
    span.innerHTML = font.innerHTML;
    font.parentNode.replaceChild(span, font);
  });
  
  saveCardRange(cardId);
}

function setMiniLineHeight(cardId, lineHeight) {
  if (!lineHeight) return;
  const card = document.getElementById(cardId);
  if (!card) return;
  const editor = card.querySelector('.pos-description-input');
  if (!editor) return;
  
  editor.focus();
  restoreCardRange(cardId);
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  
  const range = selection.getRangeAt(0);
  const blockTypes = ['P', 'LI', 'DIV', 'H1', 'H2', 'H3', 'H4'];
  const allElements = Array.from(editor.querySelectorAll('*'));
  
  // Strip preexisting inline line heights from any nested child elements inside the selection range
  allElements.forEach(el => {
    if (range.intersectsNode(el)) {
      el.style.lineHeight = '';
    }
  });
  
  let appliedCount = 0;
  allElements.forEach(el => {
    if (blockTypes.includes(el.nodeName) && range.intersectsNode(el)) {
      el.style.lineHeight = lineHeight;
      appliedCount++;
    }
  });
  
  if (appliedCount === 0) {
    let element = selection.anchorNode;
    if (element.nodeType === 3) {
      element = element.parentNode;
    }
    while (element && element !== editor && !blockTypes.includes(element.nodeName)) {
      element = element.parentNode;
    }
    if (element && element !== editor) {
      element.style.lineHeight = lineHeight;
    } else {
      if (editor.childNodes.length > 0) {
        const div = document.createElement('div');
        div.style.lineHeight = lineHeight;
        while (editor.firstChild) {
          div.appendChild(editor.firstChild);
        }
        editor.appendChild(div);
      } else {
        editor.style.lineHeight = lineHeight;
      }
    }
  }
  
  saveCardRange(cardId);
}

function saveCardRange(cardId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const editor = card.querySelector('.pos-description-input');
    if (editor && editor.contains(range.commonAncestorContainer)) {
      card._savedRange = range.cloneRange();
    }
  }
}

function restoreCardRange(cardId) {
  const card = document.getElementById(cardId);
  if (!card || !card._savedRange) return false;
  
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(card._savedRange);
  return true;
}
