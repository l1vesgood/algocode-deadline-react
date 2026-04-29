import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';

interface Contest {
  title: string;
  solved: number;
  total: number;
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
            className={`contest-item ${contest.solved > 0 ? 'completed' : ''}`}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {contest.solved > 0 ? (
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
        ))}
      </div>
    </div>
  );
};

export default ContestList;
