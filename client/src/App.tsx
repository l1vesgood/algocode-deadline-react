import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Countdown from './components/Countdown';
import UserSearch from './components/UserSearch';
import ProgressCard from './components/ProgressCard';
import ContestList from './components/ContestList';
import './styles/main.css';

interface UserData {
  id: number;
  name: string;
  solved: number;
  details: {
    title: string;
    solved: number;
    total: number;
  }[];
}

interface DeadlineData {
  deadline: string;
  requiredTasks: number;
  users: UserData[];
  contestsCount: number;
}

const API_URL = 'http://localhost:5001/api/deadline';

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
        
        // Попробуем найти пользователя из localStorage если он там есть
        const savedUserId = localStorage.getItem('algocode_user_id');
        if (savedUserId && response.data.users) {
          const user = response.data.users.find((u: UserData) => u.id.toString() === savedUserId);
          if (user) setSelectedUser(user);
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

  if (loading) return <div className="loading">Загрузка данных из Algocode...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!data) return null;

  return (
    <div className="container">
      <header className="header">
        <h1>Яндекс. Кружок</h1>
        <div className="deadline-info">
          Дедлайн: 2 мая 23:59 (МСК) • {data.contestsCount} контестов
        </div>
      </header>

      <Countdown deadline={data.deadline} />

      <UserSearch value={searchTerm} onChange={handleSearch} />

      {selectedUser ? (
        <>
          <h2 style={{ marginBottom: '1rem' }}>{selectedUser.name}</h2>
          <ProgressCard 
            solved={selectedUser.solved} 
            required={data.requiredTasks} 
          />
          <ContestList contests={selectedUser.details} />
        </>
      ) : (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          Начните вводить свое имя, чтобы увидеть прогресс
        </div>
      )}
      
      <footer style={{ textAlign: 'center', marginTop: '4rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
        Данные обновляются каждые 5 минут. Учитываются только задачи из первых 11 контестов.
      </footer>
    </div>
  );
}

export default App;
