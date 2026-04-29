import React, { useState } from 'react';

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
    }[];
  }[];
}

interface StandingsTableProps {
  users: UserData[];
  requiredTasks: number;
  onUserClick: (user: UserData) => void;
  currentUser?: UserData | null;
}

const StandingsTable: React.FC<StandingsTableProps> = ({ users, requiredTasks, onUserClick, currentUser }) => {
  const [showAll, setShowAll] = useState(false);
  
  // Показываем первые 20 или всех
  const displayedUsers = showAll ? users : users.slice(0, 20);

  const getRowClass = (user: UserData) => {
    let classes = "table-row";
    if (currentUser && user.id === currentUser.id) classes += " current-user";
    if (user.solved >= requiredTasks) classes += " completed-row";
    return classes;
  };

  return (
    <div className="card standings-card">
      <div className="table-header-row">
        <h3>Общий зачет</h3>
        <span className="text-secondary">{users.length} участников</span>
      </div>
      
      <div className="table-container">
        <table className="standings-table">
          <thead>
            <tr>
              <th style={{ width: '50px' }}>#</th>
              <th>Имя</th>
              <th style={{ textAlign: 'center' }}>Решено</th>
              <th style={{ textAlign: 'center' }}>Прогресс</th>
            </tr>
          </thead>
          <tbody>
            {displayedUsers.map((user, index) => {
              const percentage = Math.round((user.solved / requiredTasks) * 100);
              return (
                <tr 
                  key={user.id} 
                  className={getRowClass(user)}
                  onClick={() => onUserClick(user)}
                >
                  <td className="rank">{index + 1}</td>
                  <td className="name">{user.name}</td>
                  <td className="solved-count">{user.solved} / {requiredTasks}</td>
                  <td className="progress-cell">
                    <div className="mini-progress-bg">
                      <div 
                        className="mini-progress-fill" 
                        style={{ 
                          width: `${Math.min(percentage, 100)}%`,
                          backgroundColor: percentage >= 100 ? 'var(--success-color)' : (percentage >= 50 ? 'var(--warning-color)' : 'var(--danger-color)')
                        }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {users.length > 20 && (
        <button 
          className="btn-show-more"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? 'Свернуть' : `Показать всех (${users.length})`}
        </button>
      )}
    </div>
  );
};

export default StandingsTable;
