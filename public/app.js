let currentUser = null;
let allTasks = [];
let currentTaskIndex = 0;
let timerInterval = null;
let timeLeft = 0;

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

// --- TOAST FUNCTION (UPDATED) ---
function showToast(message) {
    const toastEl = document.getElementById("toast");
    if (!toastEl) return;

    toastEl.innerText = message;
    toastEl.style.display = "block";

    setTimeout(() => {
        toastEl.style.display = "none";
    }, 3000);
}

// --- AUTHENTICATION ---
document.getElementById('login-btn').addEventListener('click', async () => {
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();

    if (!user || !pass) return showToast('ENTER CREDENTIALS');

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
            showToast(data.message || 'ACCESS DENIED');
        }
    } catch (err) {
        showToast('CONNECTION FAILURE');
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
    stopExtractionTimer();
    const res = await fetch('/api/tasks');
    allTasks = await res.json();

    renderTasks();
    showScreen('home-screen');
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

// ... rest of your code remains unchanged ...
