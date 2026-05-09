import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';

interface Problem {
  id: string;
  short: string;
  solved: boolean;
  verdict: string | null;
  penalty: number;
  globalSolvedCount: number;
}

interface Contest {
  title: string;
  solved: number;
  total: number;
  problems: Problem[];
}

interface ContestListProps {
  contests: Contest[];
  totalUsers: number;
}

const ContestList: React.FC<ContestListProps> = ({ contests, totalUsers }) => {
  const getProblemStatusText = (prob: Problem) => {
    if (prob.verdict === 'OK') {
      if (prob.penalty === 0) return '+';
      return prob.penalty > 9 ? '+∞' : `+${prob.penalty}`;
    }
    if (prob.verdict === 'PR') return '?';
    if (prob.verdict === 'RJ' || (prob.verdict && prob.verdict !== 'null')) {
      const attempts = prob.penalty + 1;
      return attempts > 9 ? '-∞' : `-${attempts}`;
    }
    return '';
  };

  const getProblemClass = (prob: Problem) => {
    if (prob.verdict === 'OK') return 'solved';
    if (prob.verdict === 'PR') return 'pending';
    if (prob.verdict === 'RJ' || (prob.verdict && prob.verdict !== 'null')) return 'rejected';
    return '';
  };

  return (
    <div className="card">
      <h3 style={{ marginBottom: '1.5rem' }}>Детали по контестам</h3>
      <div className="contest-list">
        {contests.map((contest, index) => (
          <div 
            key={index} 
            className={`contest-item-detailed ${contest.solved > 0 ? 'active' : ''}`}
          >
            <div className="contest-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {contest.solved === contest.total ? (
                  <CheckCircle2 size={18} color="var(--success-color)" />
                ) : (
                  <Circle size={18} color="var(--text-secondary)" />
                )}
                <span className="contest-title">{contest.title}</span>
              </div>
              <span className="contest-solved">
                {contest.solved} / {contest.total}
              </span>
            </div>
            
            <div className="problem-grid">
              {contest.problems.map((prob) => {
                const solvedCount = prob.globalSolvedCount || 0;
                const percentage = totalUsers > 0 ? Math.round((solvedCount / totalUsers) * 100) : 0;
                
                return (
                  <div 
                    key={prob.id} 
                    className={`problem-box ${getProblemClass(prob)}`}
                  >
                    <div className="problem-tooltip">
                      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Задача {prob.short}</div>
                      {prob.verdict && <div style={{ marginBottom: '2px', opacity: 0.8 }}>Вердикт: {prob.verdict}</div>}
                      {!contest.title.startsWith('CF:') && (
                        <div style={{ color: 'var(--accent-color)' }}>Решило: {solvedCount} ({percentage}%)</div>
                      )}
                    </div>
                    <span className="problem-letter">{prob.short}</span>
                    {prob.verdict && (
                      <span className="problem-status-sub">
                        {getProblemStatusText(prob)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ContestList;
