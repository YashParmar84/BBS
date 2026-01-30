const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer Config for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.use(cors());
app.use(bodyParser.json());

// Helper functions for data operations
const readData = () => {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return { users: [], tasks: [] };
    }
};

const writeData = (data) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

// --- API ENDPOINTS ---

// 1. Auth Endpoint
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const data = readData();

    // Admin login
    if (username === 'Admin18' && password === 'Admin@1805') {
        return res.json({ success: true, role: 'admin' });
    }

    // User login
    if (password === 'Tech2k26') {
        let user = data.users.find(u => u.username === username);
        if (!user) {
            user = {
                username,
                completedTasks: 0,
                itemsFound: {}, // { taskId: [qIdx1, qIdx2] }
                disqualified: false,
                wrongAttempts: {}, // { taskId: count }
                performance: 'Operative',
                startTime: new Date().toISOString()
            };
            data.users.push(user);
            writeData(data);
        }
        return res.json({ success: true, role: 'user', userData: user });
    }

    res.status(401).json({ success: false, message: 'Invalid credentials or access code' });
});

// 2. Task Fetching (Filtered for users)
app.get('/api/tasks', (req, res) => {
    const data = readData();
    const visibleTasks = data.tasks.filter(t => t.visible !== false);
    res.json(visibleTasks);
});

// 3. Complete Task
app.post('/api/complete-task', (req, res) => {
    const { username, taskId } = req.body;
    let data = readData();
    let user = data.users.find(u => u.username === username);

    if (user) {
        if (taskId > user.completedTasks) {
            user.completedTasks = taskId;
        }
        writeData(data);
        return res.json({ success: true, userData: user });
    }
    res.status(404).json({ success: false, message: 'User not found' });
});

// New: Toggle Item Status
app.post('/api/toggle-item', (req, res) => {
    const { username, taskId, itemIndex } = req.body;
    let data = readData();
    let user = data.users.find(u => u.username === username);

    if (user) {
        if (!user.itemsFound) user.itemsFound = {};
        if (!user.itemsFound[taskId]) user.itemsFound[taskId] = [];

        const index = user.itemsFound[taskId].indexOf(itemIndex);
        if (index > -1) {
            user.itemsFound[taskId].splice(index, 1); // Remove if exists
        } else {
            user.itemsFound[taskId].push(itemIndex); // Add if not
        }

        writeData(data);
        return res.json({ success: true, itemsFound: user.itemsFound[taskId] });
    }
    res.status(404).json({ success: false });
});

// 4. Admin: Get all data
app.get('/api/admin/data', (req, res) => {
    res.json(readData());
});

// 5. Admin: Save tasks
app.post('/api/admin/tasks', (req, res) => {
    const { tasks } = req.body;
    let data = readData();
    data.tasks = tasks;
    writeData(data);
    res.json({ success: true });
});

// 6. Admin: Reset User
app.post('/api/admin/reset-user', (req, res) => {
    const { username } = req.body;
    let data = readData();
    let user = data.users.find(u => u.username === username);
    if (user) {
        user.completedTasks = 0;
        writeData(data);
        return res.json({ success: true });
    }
    res.status(404).json({ success: false });
});

// 7. Admin: Toggle Item Status for User
app.post('/api/admin/toggle-user-item', (req, res) => {
    const { username, taskId, itemIndex } = req.body;
    let data = readData();
    let user = data.users.find(u => u.username === username);
    if (user) {
        if (!user.itemsFound) user.itemsFound = {};
        if (!user.itemsFound[taskId]) user.itemsFound[taskId] = [];
        const idx = user.itemsFound[taskId].indexOf(itemIndex);
        if (idx > -1) user.itemsFound[taskId].splice(idx, 1);
        else user.itemsFound[taskId].push(itemIndex);
        writeData(data);
        return res.json({ success: true, itemsFound: user.itemsFound[taskId] });
    }
    res.status(404).json({ success: false });
});

// 8. Admin: Disqualify/Reinstate User
app.post('/api/admin/toggle-disqualification', (req, res) => {
    const { username, disqualified } = req.body;
    let data = readData();
    let user = data.users.find(u => u.username === username);
    if (user) {
        user.disqualified = disqualified;
        if (!disqualified) user.wrongAttempts = {}; // Reset attempts if reinstated
        writeData(data);
        return res.json({ success: true });
    }
    res.status(404).json({ success: false });
});

// 9. User: Update Wrong Attempts
app.post('/api/update-attempts', (req, res) => {
    const { username, taskId, count } = req.body;
    let data = readData();
    let user = data.users.find(u => u.username === username);
    if (user) {
        if (!user.wrongAttempts) user.wrongAttempts = {};
        user.wrongAttempts[taskId] = count;
        if (count >= 5) user.disqualified = true;
        writeData(data);
        return res.json({ success: true, disqualified: user.disqualified });
    }
    res.status(404).json({ success: false });
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Fallback routes for logo and background images if they are in root
app.get('/logo.jpg', (req, res) => {
    res.sendFile(path.join(__dirname, 'technomatra logo.jpeg'));
});

app.get('/bg.jpg', (req, res) => {
    res.sendFile(path.join(__dirname, 'technomatra logo.jpeg'));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
