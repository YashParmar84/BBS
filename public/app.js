let currentUser = null;
let allTasks = [];
let currentTaskIndex = 0;
let timerInterval = null;
let timeLeft = 0;
let extractionInterval = null;

// --- PERSISTENT TIMER UTILS ---
function getPersistentEndTime(type, id) {
    const key = `bbs_timer_${type}_${currentUser.username}_${id}`;
    return localStorage.getItem(key);
}

function setPersistentEndTime(type, id, seconds) {
    const key = `bbs_timer_${type}_${currentUser.username}_${id}`;
    const endTime = Date.now() + (seconds * 1000);
    localStorage.setItem(key, endTime);
    return endTime;
}

function clearPersistentTimer(type, id) {
    const key = `bbs_timer_${type}_${currentUser.username}_${id}`;
    localStorage.removeItem(key);
}

// Admin data storage
let adminUsers = [];
let adminTasks = [];

// --- CORE NAVIGATION ---
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    setTimeout(() => {
        const target = document.getElementById(screenId);
        if (target) {
            target.classList.add('active');
            target.scrollTop = 0; // Scroll to top on transition
            // Navbar visibility
            const navInfo = document.getElementById('nav-user-info');
            if (screenId === 'login-screen' || screenId === 'welcome-screen') {
                navInfo.style.display = 'none';
            } else {
                navInfo.style.display = 'flex';
                document.getElementById('user-name-display').innerText = `OPERATIVE: ${currentUser ? currentUser.username.toUpperCase() : 'ADMIN'}`;
            }
        }
    }, 50);
}

// --- SYSTEM DIALOGS (Modal) ---
function showSystemModal(title, message, isConfirm = false, icon = '⚠️') {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-modal');
        const titleEl = document.getElementById('modal-title');
        const messageEl = document.getElementById('modal-message');
        const iconEl = document.getElementById('modal-icon');
        const confirmBtn = document.getElementById('modal-confirm-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');

        titleEl.innerText = title.toUpperCase();
        messageEl.innerText = message;
        iconEl.innerText = icon;

        cancelBtn.style.display = isConfirm ? 'block' : 'none';
        confirmBtn.innerText = isConfirm ? 'CONFIRM' : 'OK, UNDERSTOOD';

        const handleConfirm = () => {
            modal.classList.remove('active');
            cleanup();
            resolve(true);
        };

        const handleCancel = () => {
            modal.classList.remove('active');
            cleanup();
            resolve(false);
        };

        const cleanup = () => {
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
        };

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);

        modal.classList.add('active');
    });
}

function showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.style.borderColor = type === 'error' ? 'var(--neon-red)' : 'var(--neon-blue)';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// --- AUTHENTICATION ---
document.getElementById('login-btn').addEventListener('click', async () => {
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();

    if (!user || !pass) return showToast('ENTER CREDENTIALS', 'error');

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        const data = await res.json();

        if (data.success) {
            currentUser = { username: user, role: data.role, ...data.userData };
            sessionStorage.setItem('bbs_user', JSON.stringify(currentUser));

            if (data.role === 'admin') {
                initAdminPanel();
            } else {
                startWelcomeSequence();
            }
        } else {
            showToast(data.message || 'ACCESS DENIED', 'error');
        }
    } catch (err) {
        showToast('CONNECTION FAILURE', 'error');
    }
});

function startWelcomeSequence() {
    showScreen('welcome-screen');
    setTimeout(() => {
        showHome();
    }, 4000); // 4 seconds welcome
}

async function showHome(forceHome = false) {
    stopTimer();
    const res = await fetch('/api/tasks');
    allTasks = await res.json();

    renderTasks();
    showScreen('home-screen');

    // Restore any active extraction timer on home screen
    allTasks.forEach((task, index) => {
        const extractionEnd = getPersistentEndTime('extraction', index);
        if (extractionEnd) {
            const remaining = Math.ceil((parseInt(extractionEnd) - Date.now()) / 1000);
            if (remaining > 0) {
                startExtractionTimer(remaining, index, true);
            } else {
                clearPersistentTimer('extraction', index);
            }
        }
    });
}

function renderTasks() {
    const list = document.getElementById('task-list');
    list.innerHTML = '';

    const isGameFinished = currentUser.completedTasks >= allTasks.length;

    allTasks.forEach((task, index) => {
        const isLocked = !isGameFinished && index > currentUser.completedTasks;
        const isCompleted = index < currentUser.completedTasks || isGameFinished;

        const card = document.createElement('div');
        card.className = `task-card ${isLocked ? 'locked-status' : ''}`;
        card.innerHTML = `
            <div style="font-size: 0.7rem; color: var(--accent-cyan); margin-bottom: 10px; font-weight: 800;">MISSION 0${index + 1}</div>
            <h3>${task.title}</h3>
            <p>${task.description.substring(0, 100)}...</p>
            <div class="card-footer" style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.8rem; font-weight: 700; color: ${isGameFinished ? 'var(--accent-cyan)' : (isCompleted ? 'var(--accent-cyan)' : (isLocked ? 'rgba(255,255,255,0.2)' : 'var(--accent-cyan)'))}">
                    ${isGameFinished ? 'RE-WATCH' : (isCompleted ? '✓ ACCOMPLISHED' : (isLocked ? '🔐 ENCRYPTED' : 'READY TO START'))}
                </span>
                <button class="btn btn-primary" style="padding: 10px 20px; font-size: 0.7rem;" 
                        onclick="openTask(${index})">
                    ${isGameFinished ? 'REVIEW' : (isCompleted ? 'RE-OPEN' : (isLocked ? 'DECRYPT' : 'OPEN MISSION'))}
                </button>
            </div>
        `;
        list.appendChild(card);
    });
}

// --- TASK EXECUTION ---
function openTask(index, forceOpen = false) {
    const task = allTasks[index];
    currentTaskIndex = index;

    // Check disqualification
    if (currentUser.disqualified) {
        showScreen('disqualified-screen');
        return;
    }

    // Allow opening if it's the current task, a completed task, or if user has the password
    const isLocked = index > currentUser.completedTasks;
    const isCompleted = index < currentUser.completedTasks;

    const hasActiveMissionTimer = getPersistentEndTime('mission', index);
    const hasActiveExtractionTimer = getPersistentEndTime('extraction', index);

    // Reset header timer visibility on opening
    document.getElementById('header-timer').style.display = 'none';
    const headerSubmit = document.getElementById('header-complete-task-btn');
    const footerSubmit = document.getElementById('complete-task-btn');

    if (isCompleted) {
        headerSubmit.style.display = 'none';
        footerSubmit.style.display = 'none';
    } else {
        headerSubmit.style.display = 'block';
        footerSubmit.style.display = 'block';
    }

    if (isLocked && task.password && !forceOpen && !hasActiveMissionTimer && !hasActiveExtractionTimer) {
        const attempts = (currentUser.wrongAttempts && currentUser.wrongAttempts[index]) || 0;
        document.getElementById('mission-pass-input').value = '';
        document.getElementById('password-feedback').innerText = '';
        document.getElementById('retry-counter').innerText = `ATTEMPTS REMAINING: ${5 - attempts}`;
        showScreen('password-screen');
        return;
    } else if (isLocked && !task.password) {
        showToast('MISSION LOCKED: SECURE PREVIOUS INTEL FIRST', 'error');
        return;
    }

    document.getElementById('task-view-title').innerText = task.title;
    document.getElementById('task-description').innerText = task.description;

    const qList = document.getElementById('task-questions');
    qList.innerHTML = '';

    if (task.questions) {
        task.questions.forEach((q, i) => {
            const isSecured = currentUser.itemsFound &&
                currentUser.itemsFound[index] &&
                currentUser.itemsFound[index].includes(i);

            const qDiv = document.createElement('div');
            qDiv.className = `question-item ${isSecured ? 'secured' : ''}`;
            qDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <div class="question-text">ITEM 0${i + 1}: ${q.text}</div>
                    <button class="btn btn-sm ${isSecured ? 'btn-save' : 'btn-add'}" 
                            onclick="toggleItemStatus(${index}, ${i})"
                            ${isCompleted ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
                        ${isSecured ? '✓ ITEM SECURED' : 'SECURE ITEM'}
                    </button>
                </div>
                <div class="images-row">
                    ${q.images ? q.images.map(img => `<img src="${img}" class="task-image" onclick="window.open('${img}')">`).join('') : ''}
                </div>
            `;
            qList.appendChild(qDiv);
        });
    }

    // Timer Logic
    if (task.timerEnabled && !isCompleted) {
        const persistentEnd = getPersistentEndTime('mission', index);
        if (persistentEnd) {
            const remaining = Math.ceil((parseInt(persistentEnd) - Date.now()) / 1000);
            if (remaining > 0) {
                startTimer(remaining, index, true);
            } else {
                handleTimeUp();
            }
        } else {
            startTimer(task.duration, index);
        }
    } else {
        stopTimer();
    }

    // Check for active extraction timer
    const extractionEnd = getPersistentEndTime('extraction', index);
    if (extractionEnd) {
        const remaining = Math.ceil((parseInt(extractionEnd) - Date.now()) / 1000);
        if (remaining > 0) {
            startExtractionTimer(remaining, index, true);
        }
    }

    const submitFn = () => submitTaskCompletion(index + 1);
    document.getElementById('complete-task-btn').onclick = submitFn;
    document.getElementById('header-complete-task-btn').onclick = submitFn;
    showScreen('task-screen');
}

async function verifyMissionPassword() {
    const input = document.getElementById('mission-pass-input').value;
    const task = allTasks[currentTaskIndex];

    if (input === task.password) {
        openTask(currentTaskIndex, true);
    } else {
        const currentAttempts = (currentUser.wrongAttempts && currentUser.wrongAttempts[currentTaskIndex]) || 0;
        const newAttempts = currentAttempts + 1;

        document.getElementById('password-feedback').innerText = 'INVALID SECURITY KEY';

        try {
            const res = await fetch('/api/update-attempts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: currentUser.username,
                    taskId: currentTaskIndex,
                    count: newAttempts
                })
            });
            const data = await res.json();

            if (data.disqualified) {
                currentUser.disqualified = true;
                sessionStorage.setItem('bbs_user', JSON.stringify(currentUser));
                showScreen('disqualified-screen');
            } else {
                if (!currentUser.wrongAttempts) currentUser.wrongAttempts = {};
                currentUser.wrongAttempts[currentTaskIndex] = newAttempts;
                sessionStorage.setItem('bbs_user', JSON.stringify(currentUser));
                document.getElementById('retry-counter').innerText = `ATTEMPTS REMAINING: ${5 - newAttempts}`;
            }
        } catch (err) {
            showToast('FAILED TO SYNC SECURITY LOGS', 'error');
        }
    }
}

async function toggleItemStatus(tIdx, qIdx) {
    try {
        const res = await fetch('/api/toggle-item', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUser.username,
                taskId: tIdx,
                itemIndex: qIdx
            })
        });
        const data = await res.json();
        if (data.success) {
            if (!currentUser.itemsFound) currentUser.itemsFound = {};
            currentUser.itemsFound[tIdx] = data.itemsFound;
            sessionStorage.setItem('bbs_user', JSON.stringify(currentUser));
            openTask(tIdx); // Re-render task view
            showToast(currentUser.itemsFound[tIdx].includes(qIdx) ? 'ITEM SECURED' : 'ITEM RELEASED');
        }
    } catch (err) {
        showToast('FAILED TO SYNC ITEM STATUS', 'error');
    }
}

// --- ADMIN TAB NAVIGATION ---
function switchAdminTab(tab) {
    document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));

    document.getElementById(`admin-page-${tab}`).classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
}

// --- TIMER SYSTEM ---
function startTimer(seconds, taskId, isResume = false) {
    stopTimer();
    timeLeft = seconds;

    if (!isResume && taskId !== undefined) {
        setPersistentEndTime('mission', taskId, seconds);
    }

    const box = document.getElementById('timer-box');
    box.style.display = 'block';

    updateTimerDisplay();

    timerInterval = setInterval(() => {
        const persistentEnd = getPersistentEndTime('mission', taskId !== undefined ? taskId : currentTaskIndex);
        if (persistentEnd) {
            timeLeft = Math.ceil((parseInt(persistentEnd) - Date.now()) / 1000);
        } else {
            timeLeft--;
        }

        if (timeLeft <= 0) {
            timeLeft = 0;
            updateTimerDisplay();
            clearInterval(timerInterval);
            clearPersistentTimer('mission', taskId !== undefined ? taskId : currentTaskIndex);
            handleTimeUp();
        } else {
            updateTimerDisplay();
        }
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    document.getElementById('timer-box').style.display = 'none';
}

function updateTimerDisplay() {
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    document.getElementById('timer-clock').innerText =
        `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function handleTimeUp() {
    showSystemModal("⏱ MISSION EXPIRED", "Time has run out for this operation. Moving to next mission parameters.", false, '⌛').then(() => {
        submitTaskCompletion(currentTaskIndex + 1);
    });
}

// --- ADMIN PANEL ---
async function initAdminPanel() {
    const res = await fetch('/api/admin/data');
    const data = await res.json();
    adminUsers = data.users;
    adminTasks = data.tasks;

    renderAdminStats();
    renderAdminTasks();
    showScreen('admin-screen');
}

function renderAdminStats() {
    const tbody = document.getElementById('user-stats-list');
    tbody.innerHTML = '';

    adminUsers.forEach(user => {
        let totalItemsFound = 0;
        if (user.itemsFound) {
            Object.values(user.itemsFound).forEach(items => {
                totalItemsFound += items.length;
            });
        }

        const isDisqualified = user.disqualified;
        const lastSubmitTime = user.submissionTimes && user.completedTasks > 0
            ? new Date(user.submissionTimes[user.completedTasks]).toLocaleTimeString()
            : '---';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="OPERATIVE" style="font-weight: 800; color: ${isDisqualified ? 'var(--neon-red)' : 'var(--accent-cyan)'};">${user.username.toUpperCase()}</td>
            <td data-label="ID" style="font-size: 0.75rem; color: var(--text-secondary);">BBS-${Math.random().toString(36).substr(2, 6).toUpperCase()}</td>
            <td data-label="STATUS">
                <span style="background: ${isDisqualified ? 'rgba(255, 59, 105, 0.1)' : 'rgba(0, 217, 255, 0.1)'}; padding: 4px 8px; border-radius: 6px; font-size: 0.7rem; color: ${isDisqualified ? 'var(--neon-red)' : 'var(--accent-cyan)'}; border: 1px solid ${isDisqualified ? 'var(--neon-red)' : 'var(--accent-cyan)'};">
                    ${isDisqualified ? 'DISQUALIFIED' : 'ONLINE'}
                </span>
            </td>
            <td data-label="MISSIONS">
                <div style="font-weight: 700;">${user.completedTasks} / ${adminTasks.length}</div>
            </td>
            <td data-label="ITEMS FOUND">
                <button class="btn btn-sm" style="background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); color: var(--accent-cyan);" 
                        onclick="showDiscoveryModal('${user.username}')">${totalItemsFound} ITEMS</button>
            </td>
            <td data-label="SUBMIT TIME" style="font-size: 0.8rem; font-family: 'Space Grotesk', monospace;">
                ${lastSubmitTime}
            </td>
            <td data-label="SECURITY">
                <button class="btn btn-sm ${isDisqualified ? 'btn-save' : 'btn-back'}" style="width: 110px;"
                        onclick="toggleDisqualification('${user.username}', ${!isDisqualified})">
                    ${isDisqualified ? 'REINSTATE' : 'DISQUALIFY'}
                </button>
            </td>
            <td data-label="ACTIONS" style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                <button class="btn btn-sm btn-back" onclick="resetUser('${user.username}')">RESET</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Discovery Modal Functions
let discoveryTargetUser = null;
async function showDiscoveryModal(username) {
    discoveryTargetUser = username;
    const user = adminUsers.find(u => u.username === username);
    document.getElementById('discovery-user-title').innerText = `INTEL CONTROL: ${username.toUpperCase()}`;
    renderDiscoveryDetails(user);
    document.getElementById('admin-user-discovery-modal').classList.add('active');
}

function closeDiscoveryModal() {
    discoveryTargetUser = null;
    document.getElementById('admin-user-discovery-modal').classList.remove('active');
}

function renderDiscoveryDetails(user) {
    const container = document.getElementById('discovery-missions-container');
    container.innerHTML = '';

    adminTasks.forEach((task, tIdx) => {
        const taskDiv = document.createElement('div');
        taskDiv.style.marginBottom = '2rem';
        taskDiv.style.background = 'rgba(255,255,255,0.02)';
        taskDiv.style.padding = '1rem';
        taskDiv.style.borderRadius = '12px';

        let itemsHtml = '';
        if (task.questions) {
            task.questions.forEach((q, qIdx) => {
                const isFound = user.itemsFound && user.itemsFound[tIdx] && user.itemsFound[tIdx].includes(qIdx);
                itemsHtml += `
                    <div class="discovery-item">
                        <span style="font-size: 0.8rem;">Item 0${qIdx + 1}: ${q.text}</span>
                        <button class="btn btn-sm ${isFound ? 'btn-save' : 'btn-add'}" style="padding: 2px 10px; font-size: 0.6rem;"
                                onclick="adminToggleUserItem('${user.username}', ${tIdx}, ${qIdx})">
                            ${isFound ? '✓ FOUND' : 'NOT FOUND'}
                        </button>
                    </div>
                `;
            });
        }

        taskDiv.innerHTML = `
            <div style="font-weight: 700; margin-bottom: 0.5rem; color: var(--accent-cyan);">MISSION 0${tIdx + 1}: ${task.title}</div>
            <div style="padding-left: 1rem;">${itemsHtml || '<span style="opacity: 0.5; font-size: 0.7rem;">NO ITEMS IN THIS MISSION</span>'}</div>
        `;
        container.appendChild(taskDiv);
    });
}

async function adminToggleUserItem(username, tIdx, qIdx) {
    const res = await fetch('/api/admin/toggle-user-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, taskId: tIdx, itemIndex: qIdx })
    });
    const data = await res.json();
    if (data.success) {
        const user = adminUsers.find(u => u.username === username);
        if (!user.itemsFound) user.itemsFound = {};
        user.itemsFound[tIdx] = data.itemsFound;
        renderDiscoveryDetails(user);
        renderAdminStats();
    }
}

async function toggleDisqualification(username, status) {
    const msg = status ? "SCRUB OPERATIVE?" : "REINSTATE OPERATIVE?";
    const confirm = await showSystemModal(msg, `Are you sure you want to ${status ? 'disqualify' : 'reinstate'} ${username.toUpperCase()}?`, true);
    if (confirm) {
        const res = await fetch('/api/admin/toggle-disqualification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, disqualified: status })
        });
        if (res.ok) {
            initAdminPanel();
            showToast(status ? 'OPERATIVE DISQUALIFIED' : 'OPERATIVE REINSTATED');
        }
    }
}

function renderAdminTasks() {
    const tbody = document.getElementById('mission-table-body');
    tbody.innerHTML = '';

    adminTasks.forEach((task, tIdx) => {
        const tr = document.createElement('tr');
        const isVisible = task.visible !== false;

        tr.innerHTML = `
            <td data-label="ID">#0${tIdx + 1}</td>
            <td data-label="TITLE" style="font-weight: 700;">${task.title}</td>
            <td data-label="STATUS">
                <span class="status-badge ${isVisible ? 'status-active' : 'status-hidden'}">
                    ${isVisible ? 'ACTIVE' : 'HIDDEN'}
                </span>
            </td>
            <td data-label="TIMER">${task.timerEnabled ? `${task.duration}s` : 'OFF'}</td>
            <td data-label="ACTIONS" class="admin-actions-cell" style="justify-content: flex-end;">
                <button class="btn btn-sm" style="background: rgba(255,255,255,0.05); border:1px solid var(--glass-border);" onclick="showMissionEditor(${tIdx})">EDIT</button>
                <button class="btn btn-sm btn-back" onclick="deleteTask(${tIdx})">DELETE</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function showMissionEditor(idx) {
    document.getElementById('admin-missions-list-view').style.display = 'none';
    document.getElementById('admin-mission-editor-view').style.display = 'block';

    if (idx === null) {
        // Adding new task
        const newIdx = adminTasks.length;
        adminTasks.push({
            title: "NEW MISSION",
            description: "ENTER INTEL HERE",
            timerEnabled: false,
            duration: 60,
            visible: true,
            questions: []
        });
        renderMissionEditor(newIdx);
        document.getElementById('editor-title').innerText = "CREATE NEW MISSION";
    } else {
        // Editing existing task
        renderMissionEditor(idx);
        document.getElementById('editor-title').innerText = `CONFIGURING MISSION #0${idx + 1}`;
    }
}

function hideMissionEditor() {
    document.getElementById('admin-mission-editor-view').style.display = 'none';
    document.getElementById('admin-missions-list-view').style.display = 'block';
    renderAdminTasks();
}

function renderMissionEditor(tIdx) {
    const container = document.getElementById('active-mission-editor');
    const task = adminTasks[tIdx];

    container.innerHTML = `
        <div class="admin-task-card" style="background: transparent; border: none; padding: 0;">
            <div class="editor-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
                <div class="input-group" style="margin-bottom: 0;">
                    <label>MISSION TITLE</label>
                    <input type="text" value="${task.title}" oninput="updateTaskField(${tIdx}, 'title', this.value)">
                </div>
                <div class="input-group" style="margin-bottom: 0;">
                    <label>ACCESS PASSWORD (OPTIONAL)</label>
                    <div class="password-wrapper">
                        <input type="password" id="admin-pass-${tIdx}" value="${task.password || ''}" placeholder="LEAVE BLANK FOR NO PASSWORD" 
                               oninput="updateTaskField(${tIdx}, 'password', this.value)">
                        <button type="button" class="toggle-password" onclick="togglePasswordVisibility('admin-pass-${tIdx}', this)" title="Toggle Password Visibility">
                            <svg class="eye-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="input-group">
                <label>MISSION DESCRIPTION</label>
                <textarea oninput="updateTaskField(${tIdx}, 'description', this.value)">${task.description}</textarea>
            </div>
            
            <div style="display: flex; gap: 2rem; margin-bottom: 2rem; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" style="width: auto; margin: 0;" ${task.timerEnabled ? 'checked' : ''} 
                           onchange="updateTaskField(${tIdx}, 'timerEnabled', this.checked); renderMissionEditor(${tIdx})">
                    <label style="margin: 0;">ENABLE TIMER</label>
                </div>
                
                <div style="display: flex; align-items: center; gap: 10px; opacity: ${task.timerEnabled ? 1 : 0.3}">
                    <label style="margin: 0;">SECONDS</label>
                    <input type="number" value="${task.duration}" style="width: 100px; margin: 0;" 
                           ${!task.timerEnabled ? 'disabled' : ''}
                           oninput="updateTaskField(${tIdx}, 'duration', parseInt(this.value))">
                </div>

                <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" style="width: auto; margin: 0;" ${task.visible !== false ? 'checked' : ''} 
                           onchange="updateTaskField(${tIdx}, 'visible', this.checked)">
                    <label style="margin: 0;">VISIBLE TO OPERATIVES</label>
                </div>
            </div>

            <div id="admin-questions-container">
                <h3 style="margin-bottom: 1.5rem; color: var(--accent-cyan); font-size: 1.1rem;">COLLECTION ITEMS</h3>
                <div id="admin-questions-list"></div>
                <button class="btn btn-add" style="width: 100%; margin-top: 1rem;" onclick="addQuestion(${tIdx})">+ ADD NEW ITEM</button>
            </div>
        </div>
    `;
    renderAdminQuestions(tIdx);
}

function renderAdminQuestions(tIdx) {
    const qList = document.getElementById('admin-questions-list');
    if (!qList) return;

    qList.innerHTML = '';
    const task = adminTasks[tIdx];

    task.questions.forEach((q, qIdx) => {
        const qDiv = document.createElement('div');
        qDiv.className = 'question-item';
        qDiv.style.background = 'rgba(255,255,255,0.02)';
        qDiv.innerHTML = `
            <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                <input type="text" value="${q.text}" placeholder="Enter item description..." style="margin: 0;" 
                       oninput="updateQuestionText(${tIdx}, ${qIdx}, this.value)">
                <button class="btn btn-sm btn-back" style="padding: 0 1rem;" onclick="deleteQuestion(${tIdx}, ${qIdx})">REMOVE</button>
            </div>
            
            <label style="font-size: 0.7rem; margin-bottom: 1rem; display: block;">INTEL IMAGES (MAX 5)</label>
            <div class="images-row" style="margin-bottom: 1rem;">
                ${q.images ? q.images.map((img, iIdx) => `
                    <div style="position: relative;">
                        <img src="${img}" class="task-image" style="width: 80px; height: 60px;">
                        <button style="position: absolute; top: -5px; right: -5px; background: var(--bg-primary); border: 1px solid var(--glass-border); border-radius: 50%; width: 20px; height: 20px; font-size: 10px; color: #fff; cursor: pointer;" 
                                onclick="deleteImage(${tIdx}, ${qIdx}, ${iIdx})">×</button>
                    </div>
                `).join('') : ''}
                <label class="btn btn-sm" style="height: 60px; width: 80px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.02); border: 1px dashed var(--glass-border); cursor: pointer;">
                    +
                    <input type="file" multiple hidden onchange="uploadImages(event, ${tIdx}, ${qIdx})">
                </label>
            </div>
        `;
        qList.appendChild(qDiv);
    });
}

// Admin Actions
function updateTaskField(idx, field, val) { adminTasks[idx][field] = val; }
function updateQuestionText(tIdx, qIdx, val) { adminTasks[tIdx].questions[qIdx].text = val; }
async function deleteTask(idx) {
    const confirmed = await showSystemModal("PERMANENT DELETE", "Are you sure you want to scrub this mission from the database? This cannot be undone.", true, '🗑️');
    if (confirmed) {
        adminTasks.splice(idx, 1);
        renderAdminTasks();
    }
}
function addQuestion(tIdx) {
    adminTasks[tIdx].questions.push({ text: "", images: [] });
    renderMissionEditor(tIdx);
}
function deleteQuestion(tIdx, qIdx) {
    adminTasks[tIdx].questions.splice(qIdx, 1);
    renderMissionEditor(tIdx);
}
function deleteImage(tIdx, qIdx, iIdx) {
    adminTasks[tIdx].questions[qIdx].images.splice(iIdx, 1);
    renderMissionEditor(tIdx);
}

async function uploadImages(e, tIdx, qIdx) {
    const files = e.target.files;
    showToast('UPLOADING INTEL...');
    for (let file of files) {
        const formData = new FormData();
        formData.append('image', file);
        const res = await fetch('/api/admin/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
            if (!adminTasks[tIdx].questions[qIdx].images) adminTasks[tIdx].questions[qIdx].images = [];
            adminTasks[tIdx].questions[qIdx].images.push(data.filePath);
        }
    }
    renderMissionEditor(tIdx);
}

async function saveAdminData() {
    const res = await fetch('/api/admin/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: adminTasks })
    });
    const data = await res.json();
    if (data.success) {
        showToast('CONFIGURATION SALVAGED');
        hideMissionEditor(); // Redirect back to mission list view
    }
}

async function resetUser(username) {
    const res = await fetch('/api/admin/reset-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
    });
    if (res.ok) initAdminPanel();
}

// --- UTILS ---
async function logout() {
    const confirmed = await showSystemModal("TERMINATE SESSION", "Warning: Are you sure you want to terminate this active session? Your classified progress will be synchronized.", true, '🔌');
    if (confirmed) {
        sessionStorage.removeItem('bbs_user');
        currentUser = null;
        location.reload();
    }
}

async function submitTaskCompletion(taskId) {
    const isAlreadyCompleted = (taskId - 1) < currentUser.completedTasks;
    if (isAlreadyCompleted) return;

    const confirmed = await showSystemModal("INITIALIZE UPLOAD", "Are you sure you want to finalize this mission's data? Current intel acquisition will be locked.", true, '📤');
    if (!confirmed) return;

    clearPersistentTimer('mission', taskId - 1);
    stopTimer();

    // Check if all items secured
    const taskIndex = taskId - 1;
    const task = allTasks[taskIndex];
    const itemsFound = (currentUser.itemsFound && currentUser.itemsFound[taskIndex]) || [];
    const allSecured = task.questions && itemsFound.length === task.questions.length;

    try {
        const res = await fetch('/api/complete-task', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser.username, taskId })
        });
        const data = await res.json();
        if (data.success) {
            currentUser.completedTasks = taskId;
            sessionStorage.setItem('bbs_user', JSON.stringify(currentUser));

            if (allSecured) {
                startExtractionTimer(60, taskIndex);
                openTask(taskIndex); // Re-render in read-only mode
            } else {
                showHome();
            }
        }
    } catch (err) {
        showToast('ERROR SUBMITTING DATA', 'error');
    }
}

function startExtractionTimer(seconds, taskId, isResume = false) {
    if (extractionInterval) clearInterval(extractionInterval);

    if (!isResume && taskId !== undefined) {
        setPersistentEndTime('extraction', taskId, seconds);
    }

    let time = seconds;
    const timerBox = document.getElementById('header-timer');
    const clock = document.getElementById('header-timer-clock');
    const headerSubmit = document.getElementById('header-complete-task-btn');

    headerSubmit.style.display = 'none';
    timerBox.style.display = 'flex';

    const updateDisplay = () => {
        const mins = Math.floor(time / 60);
        const secs = time % 60;
        clock.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    updateDisplay();

    extractionInterval = setInterval(() => {
        const persistentEnd = getPersistentEndTime('extraction', taskId);
        if (persistentEnd) {
            time = Math.ceil((parseInt(persistentEnd) - Date.now()) / 1000);
        } else {
            time--;
        }

        if (time <= 0) {
            time = 0;
            updateDisplay();
            clearInterval(extractionInterval);
            clearPersistentTimer('extraction', taskId);
            showSystemModal("TIME'S UP", "Extraction window closed. Returning to home roster.", false, '⌛').then(() => {
                showHome();
            });
        } else {
            updateDisplay();
        }
    }, 1000);
}

function showHomeManual() {
    showHome();
}

// --- INITIALIZATION ---
window.onload = () => {
    const saved = sessionStorage.getItem('bbs_user');
    if (saved) {
        currentUser = JSON.parse(saved);
        if (currentUser.role === 'admin') {
            initAdminPanel();
        } else {
            showHome();
        }
    }
};

// --- PASSWORD TOGGLE ---
function togglePasswordVisibility(inputId, button) {
    const input = document.getElementById(inputId);
    const svg = button.querySelector('svg');

    if (input.type === 'password') {
        input.type = 'text';
        // Eye-off icon
        svg.innerHTML = `
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
        `;
        button.title = "Hide Password";
    } else {
        input.type = 'password';
        // Eye icon
        svg.innerHTML = `
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
        `;
        button.title = "Show Password";
    }
}
