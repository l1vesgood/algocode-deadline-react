import { useState, useEffect } from 'react';
import axios from 'axios';
import { ExternalLink } from 'lucide-react';
import Countdown from './components/Countdown';
import UserSearch from './components/UserSearch';
import ProgressCard from './components/ProgressCard';
import ContestList from './components/ContestList';
import StandingsTable from './components/StandingsTable';
import './styles/main.css';

interface UserData {
  id: number;
  name: string;
  solved: number;
  details: {
    title: string;
    solved: number;
    total: number;
    problems: {
      id: string;
      short: string;
      solved: boolean;
      verdict: string | null;
      penalty: number;
      globalSolvedCount: number;
    }[];
  }[];
}

interface DeadlineData {
  deadline: string;
  deadlinePassedGif: string;
  requiredTasks: number;
  users: UserData[];
  contestsCount: number;
  totalUsers: number;
}

const API_URL = '/api/deadline';

function App() {
  const [data, setData] = useState<DeadlineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get(API_URL);
        setData(response.data);
        
        const savedUserId = localStorage.getItem('algocode_user_id');
        if (savedUserId && response.data.users) {
          const user = response.data.users.find((u: UserData) => u.id.toString() === savedUserId);
          if (user) {
            setSelectedUser(user);
            setSearchTerm(user.name);
          }
        }
        
        setLoading(false);
      } catch (err) {
        setError('Не удалось загрузить данные. Убедитесь, что сервер запущен.');
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    if (data && term.length > 2) {
      const found = data.users.find(u => 
        u.name.toLowerCase().includes(term.toLowerCase())
      );
      if (found) {
        setSelectedUser(found);
        localStorage.setItem('algocode_user_id', found.id.toString());
      }
    }
  };

  const handleUserSelect = (user: UserData) => {
    setSelectedUser(user);
    setSearchTerm(user.name);
    localStorage.setItem('algocode_user_id', user.id.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) return <div className="loading">Загрузка данных из Algocode...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!data) return null;

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      }) + ' (МСК)';
    } catch (e) {
      return dateStr;
    }
  };

  const isDeadlinePassed = new Date(data.deadline).getTime() < new Date().getTime();

  return (
    <div className="container">
      <header className="header">
        <h1>Яндекс. Кружок</h1>
        <div className="deadline-info">
          Дедлайн: {formatDate(data.deadline)} • {data.contestsCount} контестов
        </div>
      </header>

      {isDeadlinePassed ? (
        <div className="deadline-passed-container">
          <img src={data.deadlinePassedGif} alt="Deadline passed" className="deadline-gif" />
          <h2 className="deadline-passed-text">Дедлайн окончен!</h2>
        </div>
      ) : (
        <Countdown deadline={data.deadline} />
      )}

      <UserSearch value={searchTerm} onChange={handleSearch} />

      {selectedUser && (
        <>
          <h2 style={{ marginBottom: '1rem' }}>{selectedUser.name}</h2>
          <ProgressCard
            solved={selectedUser.solved}
            required={data.requiredTasks}
          />
          <ContestList 
            contests={selectedUser.details} 
            totalUsers={data.totalUsers}
          />
          <div style={{ height: '3rem' }} />
        </>
      )}

      <StandingsTable
        users={data.users}
        requiredTasks={data.requiredTasks}
        onUserClick={handleUserSelect}
        currentUser={selectedUser}
      />

      <footer className="footer">
        <p>Данные обновляются каждые 5 минут. Учитываются только задачи из целевых контестов ({data.contestsCount}).</p>
        <a 
          href="https://github.com/l1vesgood/algocode-deadline-react" 
          target="_blank" 
          rel="noopener noreferrer"
          className="github-link"
        >
          <ExternalLink size={16} />
          <span>GitHub</span>
        </a>
      </footer>
    </div>
  );
}

export default App;
