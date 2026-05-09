# Проблема с временем посылок в стене активности

## Суть бага

Посылка отображается как "час назад" сразу после решения задачи.

## Причина

В `server/index.js` время каждой посылки вычисляется как:

```js
const startTime = new Date(contest.date + 'T18:00:00+03:00').getTime();
timestamp: startTime + (result.time * 1000)
```

`result.time` — секунды от начала контеста до момента решения (приходит от Algocode/Ejudge).  
`startTime` захардкожен на **18:00 МСК**, но преподаватели открывают контест после лекции — время каждый раз разное (обычно ~19:00, иногда позже). Разница в 1 час и даёт сдвиг.

## Почему нельзя взять реальное время из Ejudge API

Ejudge предоставляет REST API: `GET /ej/api/v1/client/contest-status-json?contest_id=<id>`.  
Ответ содержит поле `start_time: integer` в структуре `EjudgeContestStatus` — именно то, что нужно.

**Но:** авторизация через API-ключ участника (`Authorization: Bearer <token>`) возвращает `ERR_PERMISSION_DENIED` для всех контестов (75016–75028).

Выяснено экспериментально:
- `Bearer <token>` — формат распознаётся (ответ JSON), но доступ запрещён
- `master/contest-status-json` — требует роли admin/judge, не студента
- `client/contest-status-json` — тоже `ERR_PERMISSION_DENIED`, вероятно, на algocode.ru отключён доступ через API-ключи для участников
- CGI (`/cgi-bin/new-client?api_key=...`) — не принимает API-ключ как метод авторизации
- `contest_info` в данных Algocode (`/standings_data/c_spring_2025/`) — пустой объект `{}`

Для работы через API нужен ключ с правами **преподавателя/администратора** контеста.

## Ejudge API — справочно

- Сервер: `https://ejudge.algocode.ru`
- Swagger (эталонный): `https://ejudge.ru/swagger/index.html` / `doc.json`
- Авторизация: `Authorization: Bearer <token>` (тип `apiKey`, `in: header`)
- Нужный endpoint: `GET /ej/api/v1/client/contest-status-json?contest_id=<ejudge_id>`
- Нужное поле ответа: `result.contest.start_time` (Unix timestamp, секунды)
- ejudge_id каждого контеста есть в данных Algocode: поле `ejudge_id` в объекте контеста

## Варианты решения

### 1. Получить ключ с правами преподавателя
Если преподаватель выдаст API-ключ admin-уровня — можно вызывать `master/contest-status-json` и получать точное `start_time`. Это **лучшее решение**.

### 2. seenSubmissions — запоминать момент первого обнаружения посылки
```js
// При первом появлении посылки в данных API:
seenSubmissions[key] = Date.now();
// Для старых контестов (date < today): fallback на дату + 20:00 МСК
```
Точность: ±5 минут (интервал кэша). Хранить в `seen_submissions.json` для переживания рестартов.

### 3. Инференс start_time из имеющихся данных
Если `seenSubmissions[key]` известно хотя бы для одной посылки контеста:
```
start_time_estimate = seenSubmissions[key] - result.time * 1000
```
Медиана по всем известным посылкам даёт хорошую оценку. Тогда для всех посылок того же контеста:
```
timestamp = start_time_estimate + result.time * 1000
```
Даёт корректный **относительный порядок** посылок внутри контеста.
