# Algocode Deadline Tracker

Interactive web dashboard for tracking student progress in the "Yandex Circle Parallel C" course based on [Algocode](https://algocode.ru/standings/c_spring_2025/).

## Architecture & Tech Stack
- **Frontend**: React (TypeScript) + Vite.
- **Backend**: Node.js (Express) acting as a proxy and cache for Algocode JSON data.
- **Styling**: Vanilla CSS (CSS Variables) with a dark theme.
- **DevOps**: Docker (multi-stage), Docker Compose, GitHub Actions CI.

## Project Structure
- `/server`: Express server, data processing logic, and configuration.
- `/client`: React application with TypeScript components.
- `/client/src/components`: UI components (Standings table, Progress cards, etc.).

## Core Workflows

### Changing the Deadline
To update the deadline or target task count, edit `server/config.js`:
- `DEADLINE_DATE`: ISO 8601 string (e.g., `2026-05-02T23:59:00+03:00`).
- `REQUIRED_TASKS`: Total number of tasks required for the deadline (default: 67).
- `TARGET_CONTESTS`: Array of contest titles to be included in the calculation.
- `SPREADSHEET_URL`: URL to the Google Spreadsheet CSV for CF handles mapping.
- `CF_CONTEST_ID`: Codeforces contest ID or a comma-separated list of IDs (e.g., `675501,105658`).
- `CF_API_KEY`: (Optional) Codeforces API Key for accessing private gyms.
- `CF_API_SECRET`: (Optional) Codeforces API Secret.

### Codeforces Integration
The system now integrates Codeforces (CF) results:
1.  **Mapping**: Uses a Google Spreadsheet to link student names with their CF handles. Parsing happens once on startup.
2.  **Fetching**: Automatically fetches solved tasks for all contests specified in `CF_CONTEST_ID`. 
    *   **Standings**: Uses `contest.standings` for efficiency (requires manager API keys for private gyms).
3.  **Virtual Contests**: Each CF contest is displayed as a separate entry in the user's detailed view, with its real title and problem list fetched from CF API.
4.  **Display**: CF tasks from all configured contests are added to the total count.
5.  **Caching**: CF data is cached for 30 minutes to respect API rate limits.

> **Note**: For private Gyms (like Circle contests), you must provide `CF_API_KEY` and `CF_API_SECRET` of a user who has access to the contest (preferably a manager) in the environment variables or `.env` file.

### Data Update Cycle
- The backend fetches data from Algocode every 5 minutes.
- To force an update, restart the backend service.

### Deployment
- **Docker**: `docker-compose up -d --build` (runs on port 5001).
- **GitHub Actions**: Every push to `main` triggers a Docker build test.

## Security Conventions
- All backend routes are protected by `helmet` and `express-rate-limit`.
- Docker containers run as a non-privileged `node` user.
- **Never** expose raw Algocode API keys or internal IDs if added in the future.
