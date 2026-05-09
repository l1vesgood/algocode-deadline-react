import React from 'react';

interface ProgressCardProps {
  solved: number;
  required: number;
  algocodeSolved?: number;
  cfSolved?: number;
}

const ProgressCard: React.FC<ProgressCardProps> = ({ solved, required, algocodeSolved, cfSolved }) => {
  const percentage = Math.min((solved / required) * 100, 100);
  
  const getProgressColor = () => {
    if (percentage >= 100) return 'var(--success-color)';
    if (percentage >= 50) return 'var(--warning-color)';
    return 'var(--danger-color)';
  };

  return (
    <div className="card">
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value" style={{ color: getProgressColor() }}>
            {solved}
          </div>
          <div className="stat-label">Решено</div>
          {(cfSolved !== undefined && cfSolved > 0) && (
            <div className="stat-sublabel" style={{ fontSize: '0.75rem', opacity: 0.8 }}>
              {algocodeSolved} + {cfSolved} CF
            </div>
          )}
        </div>
        <div className="stat-card">
          <div className="stat-value">{required}</div>
          <div className="stat-label">Цель</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{Math.round(percentage)}%</div>
          <div className="stat-label">Прогресс</div>
        </div>
      </div>
      
      <div className="progress-bar-container">
        <div 
          className="progress-bar-fill" 
          style={{ 
            width: `${percentage}%`,
            backgroundColor: getProgressColor()
          }}
        />
      </div>
      
      <div style={{ textAlign: 'center', marginTop: '1rem', color: 'var(--text-secondary)' }}>
        {solved >= required 
          ? '🎉 Дедлайн выполнен! Красавчик!' 
          : `Осталось решить ${required - solved} задач`}
      </div>
    </div>
  );
};

export default ProgressCard;
