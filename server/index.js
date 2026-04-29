const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const CONFIG = require('./config');

const app = express();
const PORT = process.env.PORT || 5001;

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
        return cache.data;
    }

    try {
        const response = await axios.get(CONFIG.ALGOCODE_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        const rawData = response.data;
        const processedData = processData(rawData);
        
        cache.data = processedData;
        cache.lastFetched = now;
        return processedData;
    } catch (error) {
        console.error('Error fetching from Algocode:', error.message);
        throw error;
    }
}

function processData(data) {
    const { contests, users } = data;
    
    // Индексы целевых контестов
    const targetContestIndices = contests
        .map((c, index) => ({ title: c.title, index }))
        .filter(c => CONFIG.TARGET_CONTESTS.some(target => c.title.includes(target)))
        .map(c => c.index);

    const processedUsers = users.map(user => {
        let solvedInTarget = 0;
        const contestDetails = [];

        targetContestIndices.forEach(idx => {
            const contest = contests[idx];
            const userResults = contest.users[user.id] || [];
            const solvedCount = userResults.filter(p => p.verdict === 'OK').length;
            
            solvedInTarget += solvedCount;
            contestDetails.push({
                title: contest.title,
                solved: solvedCount,
                total: contest.problems.length
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
        requiredTasks: CONFIG.REQUIRED_TASKS,
        users: processedUsers,
        contestsCount: targetContestIndices.length
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
