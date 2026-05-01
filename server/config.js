const CONFIG = {
    // Дата дедлайна в формате ISO
    DEADLINE_DATE: process.env.DEADLINE_DATE || "2026-05-02T23:59:00+03:00", 
    // Гифка при окончании дедлайна
    DEADLINE_PASSED_GIF: process.env.DEADLINE_PASSED_GIF || "https://media1.tenor.com/m/0mNUIKf8XpkAAAAd/%D0%BA%D0%BE%D0%BC%D0%B0%D1%80%D1%83-%D0%BA%D0%BE%D1%82-%D0%BA%D0%BE%D0%BC%D0%B0%D1%80%D1%83.gif",
    // Требуемое количество задач
    REQUIRED_TASKS: parseInt(process.env.REQUIRED_TASKS) || 67,
    // Названия контестов, которые учитываются
    TARGET_CONTESTS: process.env.TARGET_CONTESTS ? process.env.TARGET_CONTESTS.split(',') : [
        "Основы теории графов и DFS",
        "BFS",
        "Make DFS Great Again",
        "Кратчайшие пути 1",
        "Кратчайшие пути 2",
        "Битовые операции",
        "Строчечки 1",
        "Строчечки 2",
        "Демоническое программирование - 3",
        "Куча мала"
    ],
    // Эндпоинт algocode
    ALGOCODE_URL: process.env.ALGOCODE_URL || "https://algocode.ru/standings_data/c_spring_2025/",
    // Ejudge API settings
    EJUDGE_API: {
        TOKEN: process.env.EJUDGE_API_TOKEN || "", // Укажите API-ключ в переменных окружения
        BASE_URL: "https://ejudge.algocode.ru/ej/api/v1"
    }
};

module.exports = CONFIG;
