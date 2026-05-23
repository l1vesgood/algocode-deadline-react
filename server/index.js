require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const CONFIG = require('./config');

const app = express();
const PORT = process.env.PORT || 5001;

// Кэш для времени начала контестов
const CONTEST_TIMES_FILE = path.join(__dirname, 'contest_start_times.json');
let contestStartTimes = {};

// Кэш для времени первого обнаружения посылок (для инференса)
const SEEN_SUBMISSIONS_FILE = path.join(__dirname, 'seen_submissions.json');
let seenSubmissions = {};

if (fs.existsSync(CONTEST_TIMES_FILE)) {
    try {
        contestStartTimes = JSON.parse(fs.readFileSync(CONTEST_TIMES_FILE, 'utf8'));
    } catch (e) {
        console.error('Error loading contest_start_times.json:', e.message);
    }
}

if (fs.existsSync(SEEN_SUBMISSIONS_FILE)) {
    try {
        seenSubmissions = JSON.parse(fs.readFileSync(SEEN_SUBMISSIONS_FILE, 'utf8'));
    } catch (e) {
        console.error('Error loading seen_submissions.json:', e.message);
    }
}

function saveCache(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(`Error saving ${file}:`, e.message);
    }
}

async function resolveStartTime(contest, contestSubmissions) {
    const ejudgeId = contest.ejudge_id;
    if (!ejudgeId) return new Date(contest.date + 'T18:00:00+03:00').getTime();

    // 1. Проверяем кэш
    if (contestStartTimes[ejudgeId]) {
        return contestStartTimes[ejudgeId];
    }

    // 2. Запрашиваем Ejudge API (Самый точный источник)
    if (CONFIG.EJUDGE_API.TOKEN) {
        try {
            console.log(`Fetching start time for contest ${ejudgeId} from Ejudge API...`);
            const response = await axios.get(`${CONFIG.EJUDGE_API.BASE_URL}/client/contest-status-json`, {
                params: { contest_id: ejudgeId },
                headers: { 
                    'Authorization': `Bearer AQAA${CONFIG.EJUDGE_API.TOKEN}`,
                    'Accept': 'application/json'
                },
                timeout: 3000
            });

            if (response.data && response.data.ok && response.data.result.contest) {
                const startTime = response.data.result.contest.start_time * 1000;
                if (startTime > 0) {
                    contestStartTimes[ejudgeId] = startTime;
                    saveCache(CONTEST_TIMES_FILE, contestStartTimes);
                    console.log(`Resolved start time for ${contest.title} from API: ${new Date(startTime).toISOString()}`);
                    return startTime;
                }
            }
        } catch (error) {
            console.error(`Failed to fetch start time for contest ${ejudgeId}:`, error.message);
        }
    }

    // 3. Пытаемся инферить из времени обнаружения посылок (fallback)
    if (contestSubmissions && contestSubmissions.length >= 3) {
        const estimates = contestSubmissions.map(s => s.discoveryTime - (s.relativeTime * 1000));
        estimates.sort((a, b) => a - b);
        const inferredStart = estimates[0];
        
        const defaultStart = new Date(contest.date + 'T18:00:00+03:00').getTime();
        if (Math.abs(inferredStart - defaultStart) < 6 * 60 * 60 * 1000) {
            contestStartTimes[ejudgeId] = inferredStart;
            saveCache(CONTEST_TIMES_FILE, contestStartTimes);
            console.log(`Inferred start time for ${contest.title}: ${new Date(inferredStart).toISOString()}`);
            return inferredStart;
        }
    }

    // 4. Fallback на 18:00
    return new Date(contest.date + 'T18:00:00+03:00').getTime();
}

// Security: Helmet for basic headers
app.use(helmet({
    contentSecurityPolicy: false, // Disabled for simplicity, enable in high-security prod
}));

// Security: Rate limiting to prevent abuse
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

app.use(cors());
app.use(express.json());

// Serving static files in production
const staticPath = process.env.STATIC_PATH || path.join(__dirname, '../client/dist');
app.use(express.static(staticPath));

// Simple memory cache
let cache = {
    data: null,
    lastFetched: null
};

async function fetchAlgocodeData() {
    const now = Date.now();
    if (cache.data && cache.lastFetched && (now - cache.lastFetched < 5 * 60 * 1000)) {
        console.log('Serving from cache');
        return cache.data;
    }

    console.log('Fetching new data from Algocode...');
    try {
        const response = await axios.get(CONFIG.ALGOCODE_URL, {
            timeout: 10000, // 10 seconds timeout
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        console.log(`Received data from Algocode, size: ${JSON.stringify(response.data).length} bytes`);
        const rawData = response.data;
        const processedData = await processData(rawData);
        
        cache.data = processedData;
        cache.lastFetched = now;
        return processedData;
    } catch (error) {
        console.error('Error fetching from Algocode:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
        }
        throw error;
    }
}

async function processData(data) {
    const { contests, users } = data;
    
    // Карта пользователей для быстрого поиска по ID
    const userMap = {};
    users.forEach(u => {
        userMap[u.id] = u.name;
    });

    // Индексы целевых контестов
    const isWildcard = CONFIG.TARGET_CONTESTS.includes('*');
    const targetContestIndices = contests
        .map((c, index) => ({ title: c.title, index }))
        .filter(c => isWildcard || CONFIG.TARGET_CONTESTS.some(target => c.title.includes(target)))
        .map(c => c.index);

    const totalUsers = users.length;
    const submissions = [];

    // Сначала посчитаем количество решений для каждой задачи в каждом контесте
    const contestSolveStats = {}; // contestTitle -> { probId -> count }
    let needsSave = false;
    const now = Date.now();
    
    for (const idx of targetContestIndices) {
        const contest = contests[idx];
        const stats = {};
        const contestSubmissions = [];

        // Собираем данные о посылках для этого контеста
        contest.problems.forEach((prob, pIdx) => {
            users.forEach(user => {
                const results = contest.users[user.id] || [];
                const result = results[pIdx];
                
                if (result && result.verdict) {
                    const subKey = `${user.id}-${contest.ejudge_id}-${prob.id}-${result.time}`;
                    
                    // Если мы видим эту посылку впервые - запоминаем время
                    // Это нужно для инференса времени начала контеста, если нет API токена
                    if (!seenSubmissions[subKey]) {
                        const contestDate = new Date(contest.date).getTime();
                        const isRecent = Math.abs(now - contestDate) < 24 * 60 * 60 * 1000;
                        
                        seenSubmissions[subKey] = isRecent ? now : (new Date(contest.date + 'T18:00:00+03:00').getTime() + result.time * 1000);
                        needsSave = true;
                    }

                    if (!CONFIG.DISABLE_ACTIVITY_WALL) {
                        contestSubmissions.push({
                            userName: user.name,
                            probShort: prob.short,
                            probTitle: prob.long || prob.short,
                            verdict: result.verdict,
                            relativeTime: result.time,
                            discoveryTime: seenSubmissions[subKey]
                        });
                    }
                }
            });
        });

        // Получаем точное время начала контеста (используя API или инференс)
        const startTime = await resolveStartTime(contest, contestSubmissions);

        // Формируем итоговые посылки и статсы
        contest.problems.forEach((prob, pIdx) => {
            let solvedCount = 0;
            users.forEach(user => {
                const results = contest.users[user.id] || [];
                const result = results[pIdx];
                if (result && result.verdict) {
                    if (!CONFIG.DISABLE_ACTIVITY_WALL) {
                        submissions.push({
                            userName: user.name,
                            contestTitle: contest.title,
                            problemShort: prob.short,
                            problemTitle: prob.long || prob.short,
                            verdict: result.verdict,
                            time: result.time,
                            timestamp: startTime + (result.time * 1000)
                        });
                    }
                    if (result.verdict === 'OK') solvedCount++;
                }
            });
            stats[prob.id] = solvedCount;
        });
        
        contestSolveStats[contest.title] = stats;
    }

    if (needsSave) saveCache(SEEN_SUBMISSIONS_FILE, seenSubmissions);

    // Сортируем посылки по времени (последние сверху)
    const latestSubmissions = CONFIG.DISABLE_ACTIVITY_WALL ? [] : submissions
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 50);

    const processedUsers = users.map(user => {
        let solvedInTarget = 0;
        const contestDetails = [];

        targetContestIndices.forEach(idx => {
            const contest = contests[idx];
            const userResults = contest.users[user.id] || [];
            
            // Map individual problems to their status
            const problemsStatus = contest.problems.map((prob, pIdx) => {
                const result = userResults[pIdx] || { verdict: null, penalty: 0 };
                const isSolved = result.verdict === 'OK';
                
                return {
                    id: prob.id,
                    short: prob.short,
                    solved: isSolved,
                    verdict: result.verdict,
                    penalty: result.penalty || 0,
                    globalSolvedCount: contestSolveStats[contest.title][prob.id]
                };
            });

            const solvedCount = problemsStatus.filter(p => p.solved).length;
            
            solvedInTarget += solvedCount;
            contestDetails.push({
                title: contest.title,
                solved: solvedCount,
                total: contest.problems.length,
                problems: problemsStatus
            });
        });

        return {
            id: user.id,
            name: user.name,
            solved: solvedInTarget,
            details: contestDetails
        };
    });

    // Сортируем по количеству решенных задач
    processedUsers.sort((a, b) => b.solved - a.solved);

    return {
        deadline: CONFIG.DEADLINE_DATE,
        deadlinePassedGif: CONFIG.DEADLINE_PASSED_GIF,
        requiredTasks: CONFIG.REQUIRED_TASKS,
        users: processedUsers,
        submissions: latestSubmissions,
        contestsCount: targetContestIndices.length,
        totalUsers
    };
}

app.get('/api/deadline', async (req, res) => {
    try {
        const data = await fetchAlgocodeData();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
