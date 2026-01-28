import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const updateFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    updateFullscreen();
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => document.removeEventListener('fullscreenchange', updateFullscreen);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans">
      {!isFullscreen && <Sidebar />}
      <main className={`flex-1 overflow-y-auto ${isFullscreen ? 'p-0' : 'p-8'}`}>
        <div className={`${isFullscreen ? '' : 'max-w-6xl mx-auto'}`}>
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
