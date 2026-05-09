require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const crypto = require('crypto');
const { parse } = require('csv-parse/sync');
const CONFIG = require('./config');

const app = express();
const PORT = process.env.PORT || 5001;

// Кэш для маппинга ФИО -> CF Login
let nameToCfHandle = {};
let cfContestsData = {}; // contestId -> { title, problems: [] }

// Кэш для решенных задач на CF (handle -> { contestId -> Set of solved problem indices })
let cfSolvedCache = {};
let lastCfFetch = 0;

function getCFUrl(method, params) {
    const time = Math.floor(Date.now() / 1000);
    const allParams = { ...params, apiKey: CONFIG.CF_API_KEY, time };
    const sortedKeys = Object.keys(allParams).sort();
    
    // Signature base string should use raw values
    const sigBaseQuery = sortedKeys.map(k => `${k}=${allParams[k]}`).join('&');
    const rand = Math.random().toString(36).substring(2, 8);
    const sigBase = `${rand}/${method}?${sigBaseQuery}#${CONFIG.CF_API_SECRET}`;
    const hash = crypto.createHash('sha512').update(sigBase).digest('hex');
    
    // URL query string MUST be encoded
    const urlQuery = sortedKeys.map(k => `${k}=${encodeURIComponent(allParams[k])}`).join('&');
    
    return `https://codeforces.com/api/${method}?${urlQuery}&apiSig=${rand}${hash}`;
}

// Кэш для времени начала контестов
const CONTEST_TIMES_FILE = path.join(__dirname, 'contest_start_times.json');

async function fetchSpreadsheetData() {
    if (Object.keys(nameToCfHandle).length > 0) return nameToCfHandle;

    console.log('Fetching spreadsheet data (one-time)...');
    try {
        const response = await axios.get(CONFIG.SPREADSHEET_URL);
        const records = parse(response.data, {
            columns: false,
            skip_empty_lines: true
        });
        
        if (records.length <= 1) return nameToCfHandle;

        const header = records[0];
        const nameIdx = header.findIndex(h => h.toLowerCase().includes('фио'));
        const cfIdx = header.findIndex(h => h.toLowerCase().includes('логин'));

        if (nameIdx === -1 || cfIdx === -1) {
            console.error('Could not find FIO or CF columns in spreadsheet');
            return nameToCfHandle;
        }

        const newMap = {};
        for (let i = 1; i < records.length; i++) {
            const cols = records[i];
            if (cols.length <= Math.max(nameIdx, cfIdx)) continue;
            
            const name = cols[nameIdx].trim().replace(/\s+/g, ' ');
            const handle = cols[cfIdx].trim().replace(/^@/, '');
            if (name && handle) {
                newMap[name.toLowerCase()] = handle;
            }
        }
        
        nameToCfHandle = newMap;
        console.log(`Mapped ${Object.keys(nameToCfHandle).length} users from spreadsheet`);
        return nameToCfHandle;
    } catch (e) {
        console.error('Error fetching spreadsheet:', e.message);
        return nameToCfHandle;
    }
}

async function fetchCFData(handles) {
    const now = Date.now();
    if (Object.keys(cfSolvedCache).length > 0 && (now - lastCfFetch < 30 * 60 * 1000)) {
        return cfSolvedCache;
    }

    console.log(`Fetching CF data for ${CONFIG.CF_CONTEST_IDS.length} contests...`);
    const newCfCache = {}; // handle -> { contestId -> Set }
    const newContestsData = {};

    for (const contestId of CONFIG.CF_CONTEST_IDS) {
        let contestProblems = [];
        let contestTitle = `CF Contest ${contestId}`;
        let contestFetchedViaStandings = false;

        try {
            console.log(`Fetching CF contest ${contestId} via contest.standings...`);
            let url;
            if (CONFIG.CF_API_KEY && CONFIG.CF_API_SECRET) {
                url = getCFUrl('contest.standings', { contestId, showGhost: true });
            } else {
                url = `https://codeforces.com/api/contest.standings?contestId=${contestId}&showGhost=true`;
            }

            const response = await axios.get(url, { timeout: 10000 });

            if (response.data && response.data.status === 'OK') {
                const { contest, problems, rows } = response.data.result;
                
                contestTitle = contest.name;
                contestProblems = problems.map(p => ({ index: p.index, name: p.name }));

                if (rows && rows.length > 0) {
                    rows.forEach(row => {
                        const handle = row.party.members[0].handle;
                        if (!newCfCache[handle]) newCfCache[handle] = {};
                        
                        const solvedIndices = new Set();
                        row.problemResults.forEach((res, pIdx) => {
                            if (res.points > 0 || res.verdict === 'OK' || res.result === 'OK') {
                                solvedIndices.add(problems[pIdx].index);
                            }
                        });
                        newCfCache[handle][contestId] = solvedIndices;
                    });
                    contestFetchedViaStandings = true;
                    console.log(`Fetched CF contest ${contestId} via standings: ${rows.length} participants`);
                } else {
                    console.log(`CF contest ${contestId} standings returned 0 participants. Trying fallback...`);
                }
            }
        } catch (e) {
            console.error(`Error fetching CF contest ${contestId} via standings:`, e.message);
        }

        // Fallback: fetch via user.status if standings failed or returned no participants
        if (!contestFetchedViaStandings && handles && handles.length > 0) {
            console.log(`Falling back to user.status for ${handles.length} handles (Contest ${contestId})...`);
            const globalSolvedMap = {}; // index -> count

            for (let i = 0; i < handles.length; i++) {
                const handle = handles[i];
                try {
                    await new Promise(resolve => setTimeout(resolve, 250)); // Respect rate limits
                    let url;
                    if (CONFIG.CF_API_KEY && CONFIG.CF_API_SECRET) {
                        url = getCFUrl('user.status', { handle });
                    } else {
                        url = `https://codeforces.com/api/user.status?handle=${handle}`;
                    }

                    const response = await axios.get(url, { timeout: 5000 });
                    if (response.data && response.data.status === 'OK') {
                        const submissions = response.data.result;
                        const solvedIndices = new Set();
                        
                        submissions.forEach(sub => {
                            if (sub.contestId.toString() === contestId.toString()) {
                                // Собираем список задач, если он еще не собран из standings
                                if (contestProblems.length === 0 || !contestProblems.some(p => p.index === sub.problem.index)) {
                                    if (!contestProblems.some(p => p.index === sub.problem.index)) {
                                        contestProblems.push({ index: sub.problem.index, name: sub.problem.name });
                                    }
                                }
                                if (sub.verdict === 'OK') {
                                    solvedIndices.add(sub.problem.index);
                                }
                            }
                        });
                        
                        // Добавляем в глобальную статистику
                        solvedIndices.forEach(idx => {
                            globalSolvedMap[idx] = (globalSolvedMap[idx] || 0) + 1;
                        });

                        if (!newCfCache[handle]) newCfCache[handle] = {};
                        newCfCache[handle][contestId] = solvedIndices;
                    }
                } catch (e) {
                    console.error(`Error fetching CF user.status for ${handle}:`, e.message);
                    if (cfSolvedCache[handle] && cfSolvedCache[handle][contestId]) {
                        if (!newCfCache[handle]) newCfCache[handle] = {};
                        newCfCache[handle][contestId] = cfSolvedCache[handle][contestId];
                        // Stats for old data are harder to aggregate accurately without keeping more state
                    }
                }
            }
            
            // Обновляем количество решивших для каждой задачи
            contestProblems = contestProblems.map(p => ({
                ...p,
                globalSolvedCount: globalSolvedMap[p.index] || 0
            }));

            // Sort problems if they were collected from user.status
            contestProblems.sort((a, b) => a.index.localeCompare(b.index));
        } else if (contestFetchedViaStandings) {
            // Если данные пришли через standings, тоже посчитаем globalSolvedCount
            const globalSolvedMap = {};
            Object.values(newCfCache).forEach(userData => {
                if (userData[contestId]) {
                    userData[contestId].forEach(idx => {
                        globalSolvedMap[idx] = (globalSolvedMap[idx] || 0) + 1;
                    });
                }
            });
            contestProblems = contestProblems.map(p => ({
                ...p,
                globalSolvedCount: globalSolvedMap[p.index] || 0
            }));
        }

        if (contestProblems.length > 0) {
            newContestsData[contestId] = {
                title: contestTitle,
                problems: contestProblems
            };
        }
    }

    cfSolvedCache = newCfCache;
    cfContestsData = newContestsData;
    lastCfFetch = now;
    return cfSolvedCache;
}
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
        const [algocodeResponse, mapping] = await Promise.all([
            axios.get(CONFIG.ALGOCODE_URL, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            }),
            fetchSpreadsheetData()
        ]);
        
        console.log(`Received data from Algocode, size: ${JSON.stringify(algocodeResponse.data).length} bytes`);
        const rawData = algocodeResponse.data;
        
        // Fetch CF data for mapped users
        const handles = Object.values(mapping);
        const cfData = await fetchCFData(handles);

        const processedData = await processData(rawData, mapping, cfData);
        
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

async function processData(data, mapping = {}, cfData = {}) {
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
                    if (!seenSubmissions[subKey]) {
                        // Для старых контестов (прошлые дни) не имеет смысла ставить Date.now()
                        // Ставим Date.now() только если контест был недавно (в пределах 24ч)
                        const contestDate = new Date(contest.date).getTime();
                        const isRecent = Math.abs(now - contestDate) < 24 * 60 * 60 * 1000;
                        
                        seenSubmissions[subKey] = isRecent ? now : (new Date(contest.date + 'T18:00:00+03:00').getTime() + result.time * 1000);
                        needsSave = true;
                    }

                    contestSubmissions.push({
                        userName: user.name,
                        probShort: prob.short,
                        probTitle: prob.long || prob.short,
                        verdict: result.verdict,
                        relativeTime: result.time,
                        discoveryTime: seenSubmissions[subKey]
                    });
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
                    submissions.push({
                        userName: user.name,
                        contestTitle: contest.title,
                        problemShort: prob.short,
                        problemTitle: prob.long || prob.short,
                        verdict: result.verdict,
                        time: result.time,
                        timestamp: startTime + (result.time * 1000)
                    });
                    if (result.verdict === 'OK') solvedCount++;
                }
            });
            stats[prob.id] = solvedCount;
        });
        
        contestSolveStats[contest.title] = stats;
    }

    if (needsSave) saveCache(SEEN_SUBMISSIONS_FILE, seenSubmissions);

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

        const userNormalizedName = user.name.trim().replace(/\s+/g, ' ').toLowerCase();
        const cfHandle = mapping[userNormalizedName];
        const userCfData = cfHandle ? (cfData[cfHandle] || {}) : {};
        
        let cfTotalSolved = 0;

        // Добавляем виртуальные контесты CF в детали
        Object.keys(cfContestsData).forEach(contestId => {
            const contestInfo = cfContestsData[contestId];
            const solvedSet = userCfData[contestId] || new Set();
            const solvedCount = solvedSet.size;
            cfTotalSolved += solvedCount;

            contestDetails.push({
                title: `CF: ${contestInfo.title}`,
                solved: solvedCount,
                total: contestInfo.problems.length,
                problems: contestInfo.problems.map(p => ({
                    id: p.index,
                    short: p.index,
                    solved: solvedSet.has(p.index),
                    verdict: solvedSet.has(p.index) ? 'OK' : null,
                    penalty: 0,
                    globalSolvedCount: p.globalSolvedCount || 0
                }))
            });
        });

        return {
            id: user.id,
            name: user.name,
            solved: solvedInTarget + cfTotalSolved,
            algocodeSolved: solvedInTarget,
            cfSolved: cfTotalSolved,
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

app.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    if (CONFIG.CF_API_KEY && CONFIG.CF_API_SECRET) {
        console.log('CF API Keys: Configured (Key starts with: ' + CONFIG.CF_API_KEY.substring(0, 4) + '...)');
    } else {
        console.warn('CF API Keys: NOT CONFIGURED. Access to private Gym contests will fail.');
    }

    // Инициализируем данные при запуске
    try {
        await fetchSpreadsheetData();
        console.log('Initial spreadsheet data loaded');
    } catch (e) {
        console.error('Failed to load initial spreadsheet data:', e.message);
    }
});
