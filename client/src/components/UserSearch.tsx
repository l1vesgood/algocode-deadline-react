import React from 'react';
import { Search } from 'lucide-react';

interface UserSearchProps {
  value: string;
  onChange: (value: string) => void;
}

const UserSearch: React.FC<UserSearchProps> = ({ value, onChange }) => {
  return (
    <div className="search-container">
      <Search className="search-icon" size={20} />
      <input
        type="text"
        className="search-input"
        placeholder="Введите имя или фамилию..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
};

export default UserSearch;
