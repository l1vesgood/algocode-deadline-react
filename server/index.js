const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const CONFIG = require('./config');

const app = express();
const PORT = process.env.PORT || 5001;

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
        const processedData = processData(rawData);
        
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

function processData(data) {
    const { contests, users } = data;
    
    // Карта пользователей для быстрого поиска по ID
    const userMap = {};
    users.forEach(u => {
        userMap[u.id] = u.name;
    });

    // Индексы целевых контестов
    const targetContestIndices = contests
        .map((c, index) => ({ title: c.title, index }))
        .filter(c => CONFIG.TARGET_CONTESTS.some(target => c.title.includes(target)))
        .map(c => c.index);

    const totalUsers = users.length;
    const submissions = [];

    // Сначала посчитаем количество решений для каждой задачи в каждом контесте
    const contestSolveStats = {}; // contestTitle -> { probId -> count }
    
    targetContestIndices.forEach(idx => {
        const contest = contests[idx];
        const stats = {};
        
        // Базовое время начала контеста (предполагаем 18:00 MSK, если нет точного времени)
        // Для относительного порядка внутри одного контеста это не критично
        const startTime = new Date(contest.date + 'T18:00:00+03:00').getTime();

        contest.problems.forEach((prob, pIdx) => {
            let solvedCount = 0;
            users.forEach(user => {
                const results = contest.users[user.id] || [];
                const result = results[pIdx];
                
                if (result && result.verdict) {
                    // Добавляем в список всех посылок
                    submissions.push({
                        userName: user.name,
                        contestTitle: contest.title,
                        problemShort: prob.short,
                        problemTitle: prob.long || prob.short,
                        verdict: result.verdict,
                        time: result.time,
                        timestamp: startTime + (result.time * 1000)
                    });

                    if (result.verdict === 'OK') {
                        solvedCount++;
                    }
                }
            });
            stats[prob.id] = solvedCount;
        });
        
        contestSolveStats[contest.title] = stats;
    });

    // Сортируем посылки по времени (последние сверху)
    const latestSubmissions = submissions
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
