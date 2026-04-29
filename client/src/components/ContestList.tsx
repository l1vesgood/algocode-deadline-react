import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';

interface Problem {
  id: string;
  short: string;
  solved: boolean;
  verdict: string | null;
  penalty: number;
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
  const getProblemStatusText = (prob: Problem) => {
    if (prob.verdict === 'OK') {
      return prob.penalty > 0 ? `+${prob.penalty}` : '+';
    }
    if (prob.verdict === 'RJ' || (prob.verdict && prob.verdict !== 'null')) {
      return `-${prob.penalty + 1}`;
    }
    return '';
  };

  const getProblemClass = (prob: Problem) => {
    if (prob.verdict === 'OK') return 'solved';
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
              {contest.problems.map((prob) => (
                <div 
                  key={prob.id} 
                  className={`problem-box ${getProblemClass(prob)}`}
                  title={`Задача ${prob.short}${prob.verdict ? ` (${prob.verdict})` : ''}`}
                >
                  <span className="problem-letter">{prob.short}</span>
                  {prob.verdict && (
                    <span className="problem-status-sub">
                      {getProblemStatusText(prob)}
                    </span>
                  )}
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
