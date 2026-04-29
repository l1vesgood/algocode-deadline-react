import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';

interface Problem {
  id: string;
  short: string;
  solved: boolean;
}

interface Contest {
  title: string;
  solved: number;
  total: number;
  problems: Problem[];
}

interface ContestListProps {
  contests: Contest[];
}

const ContestList: React.FC<ContestListProps> = ({ contests }) => {
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
              {contest.problems.map((prob) => (
                <div 
                  key={prob.id} 
                  className={`problem-box ${prob.solved ? 'solved' : ''}`}
                  title={`Задача ${prob.short}`}
                >
                  {prob.short}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ContestList;
