import React from 'react';
import { CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import type { Submission } from '../types';

interface SubmissionWallProps {
  submissions: Submission[];
}

const SubmissionWall: React.FC<SubmissionWallProps> = ({ submissions = [] }) => {
  if (!submissions || submissions.length === 0) {
    return (
      <div className="submission-wall">
        <h3 className="wall-title">Активность</h3>
        <div className="text-secondary" style={{ fontSize: '0.8rem', textAlign: 'center', padding: '1rem' }}>
          Нет данных об активности
        </div>
      </div>
    );
  }

  const getVerdictIcon = (verdict: string) => {
    switch (verdict) {
      case 'OK':
        return <CheckCircle2 size={16} className="text-success" />;
      case 'WA':
      case 'RE':
      case 'CE':
      case 'TL':
      case 'ML':
        return <XCircle size={16} className="text-danger" />;
      case 'PR':
      case 'RJ':
        return <AlertCircle size={16} className="text-warning" />;
      default:
        return <Clock size={16} className="text-secondary" />;
    }
  };

  const getVerdictClass = (verdict: string) => {
    switch (verdict) {
      case 'OK': return 'verdict-ok';
      case 'WA':
      case 'TL':
      case 'RE':
      case 'CE':
      case 'ML':
        return 'verdict-danger';
      case 'PR':
      case 'RJ':
        return 'verdict-warning';
      default: return 'verdict-other';
    }
  };

  const formatName = (fullName: string) => {
    return fullName.split(' ').slice(0, 2).join(' ');
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'только что';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}м назад`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}ч назад`;
    
    return new Date(timestamp).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short'
    });
  };

  return (
    <div className="submission-wall">
      <h3 className="wall-title">Активность</h3>
      <div className="submission-list">
        {submissions.map((sub, index) => (
          <div 
            key={`${sub.userName}-${sub.timestamp}-${index}`} 
            className="submission-card-wrapper"
          >
            <div className="submission-card">
              <div className="sub-header">
                <span className="sub-user">{formatName(sub.userName)}</span>
                <span className="sub-time">{formatTime(sub.timestamp)}</span>
              </div>
              <div className="sub-body">
                <div className={`sub-verdict-icon ${getVerdictClass(sub.verdict)}`}>
                  {getVerdictIcon(sub.verdict)}
                </div>
                <div className="sub-info">
                  <span className="sub-prob">
                    {sub.problemShort}. {sub.problemTitle}
                  </span>
                  <span className="sub-verdict-text">{sub.verdict}</span>
                </div>
              </div>
            </div>
            <div className="problem-tooltip">
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{sub.contestTitle}</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{sub.problemTitle}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SubmissionWall;
