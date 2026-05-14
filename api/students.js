// api/students.js
const GITHUB_API_TOKEN = process.env.GITHUB_API_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const GITHUB_REPO = process.env.GITHUB_REPO_NAME;
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const DATA_PATH = 'data/students.json';

async function getFileContent() {
    const url = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${DATA_PATH}?ref=${BRANCH}`;
    const res = await fetch(url, { headers: { Authorization: `token ${GITHUB_API_TOKEN}`, Accept: 'application/vnd.github.v3+json' } });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error('GitHub fetch failed');
    const data = await res.json();
    return JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
}

async function updateFileContent(array, message) {
    const url = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${DATA_PATH}`;
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

function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({length:30}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        let students = await getFileContent();
        if (req.method === 'GET') return res.json(students);

        if (req.method === 'POST') {
            const { name, fatherName, class: cls, section, rollNumber } = req.body;
            if (!name || !fatherName || !cls || !section || !rollNumber) return res.status(400).json({ message: 'Missing fields' });
            if (students.find(s => s.class == cls && s.section === section && s.rollNumber == rollNumber))
                return res.status(409).json({ message: 'Duplicate roll number' });
            const newStudent = {
                id: students.length ? Math.max(...students.map(s=>s.id)) + 1 : 1,
                name, fatherName, class: cls, section, rollNumber,
                secretCode: generateCode(),
                createdAt: new Date().toISOString()
            };
            students.push(newStudent);
            await updateFileContent(students, `Add ${name}`);
            return res.status(201).json({ message: 'Added', student: newStudent });
        }

        if (req.method === 'DELETE') {
            const id = parseInt(req.url.split('/').pop());
            if (isNaN(id)) return res.status(400).json({ message: 'Invalid ID' });
            const idx = students.findIndex(s => s.id === id);
            if (idx === -1) return res.status(404).json({ message: 'Not found' });
            students.splice(idx, 1);
            await updateFileContent(students, `Delete ID ${id}`);
            return res.status(200).json({ message: 'Deleted' });
        }

        return res.status(405).json({ message: 'Method not allowed' });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: 'Server error' });
    }
};