import React from 'react';
import RunnerGame from './components/RunnerGame';

const App: React.FC = () => {
  return (
    <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black min-h-screen text-white">
      <RunnerGame />
    </div>
  );
};

export default App;
