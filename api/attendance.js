// api/attendance.js
const GITHUB_API_TOKEN = process.env.GITHUB_API_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const GITHUB_REPO = process.env.GITHUB_REPO_NAME;
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const STUDENTS_PATH = 'data/students.json';
const ATTENDANCE_PATH = 'data/attendance.json';

async function getFileContent(path) {
    const url = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${path}?ref=${BRANCH}`;
    const res = await fetch(url, { headers: { Authorization: `token ${GITHUB_API_TOKEN}`, Accept: 'application/vnd.github.v3+json' } });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error('GitHub fetch failed');
    const data = await res.json();
    return JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
}

async function updateFileContent(path, array, message) {
    const url = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${path}`;
    const content = Buffer.from(JSON.stringify(array, null, 2)).toString('base64');
    let sha = null;
    try {
        const check = await fetch(url, { headers: { Authorization: `token ${GITHUB_API_TOKEN}`, Accept: 'application/vnd.github.v3+json' } });
        if (check.ok) { const d = await check.json(); sha = d.sha; }
    } catch(e){}
    const body = { message, content, branch: BRANCH };
    if (sha) body.sha = sha;
    const res = await fetch(url, {
        method: 'PUT',
        headers: { Authorization: `token ${GITHUB_API_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github.v3+json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('GitHub update failed');
}

function isSunday(dateStr) { return new Date(dateStr).getDay() === 0; }

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const students = await getFileContent(STUDENTS_PATH);
        let attendance = await getFileContent(ATTENDANCE_PATH);

        if (req.method === 'GET') {
            const { period, class: cls, section } = req.query;
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            let start, end;
            switch (period) {
                case 'weekly':
                    const day = today.getDay();
                    const mondayOffset = day === 0 ? -6 : 1 - day;
                    start = new Date(today.getFullYear(), today.getMonth(), today.getDate() + mondayOffset);
                    end = new Date(start.getTime() + 7 * 86400000);
                    break;
                case 'monthly':
                    start = new Date(now.getFullYear(), now.getMonth(), 1);
                    end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                    break;
                case 'yearly':
                    start = new Date(now.getFullYear(), 0, 1);
                    end = new Date(now.getFullYear() + 1, 0, 1);
                    break;
                default: // daily
                    start = today;
                    end = new Date(today.getTime() + 86400000);
            }

            const filtered = attendance.filter(a => {
                const d = new Date(a.date);
                if (d < start || d >= end) return false;
                const student = students.find(s => s.id === a.studentId);
                if (!student) return false;
                if (cls && student.class != cls) return false;
                if (section && student.section !== section) return false;
                return true;
            }).map(a => {
                const student = students.find(s => s.id === a.studentId);
                return { ...a, studentName: student.name, fatherName: student.fatherName, class: student.class, section: student.section, rollNumber: student.rollNumber };
            });
            return res.json(filtered);
        }

        if (req.method === 'POST') {
            const { secretCode, timestamp } = req.body;
            if (!secretCode) return res.status(400).json({ message: 'Secret code required' });
            const student = students.find(s => s.secretCode === secretCode);
            if (!student) return res.status(404).json({ message: 'Invalid code' });

            const now = new Date(timestamp || Date.now());
            const dateStr = now.toISOString().split('T')[0];
            const timeStr = now.toTimeString().split(' ')[0].substring(0, 5);
            const status = isSunday(dateStr) ? 'sunday' : 'present';

            if (attendance.find(a => a.studentId === student.id && a.date === dateStr))
                return res.json({ message: 'Already marked', studentName: student.name });

            const record = {
                id: attendance.length ? Math.max(...attendance.map(a=>a.id)) + 1 : 1,
                studentId: student.id,
                date: dateStr,
                time: timeStr,
                status,
                timestamp: now.toISOString()
            };
            attendance.push(record);
            await updateFileContent(ATTENDANCE_PATH, attendance, `Attendance: ${student.name}`);
            return res.status(201).json({ message: 'Marked', studentName: student.name, status });
        }

        return res.status(405).json({ message: 'Method not allowed' });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: 'Server error' });
    }
};