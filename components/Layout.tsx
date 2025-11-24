import React from 'react';
import { LogOut, Activity } from 'lucide-react';
import { APP_CONFIG } from '../constants';
import { Role } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  role: Role;
  onLogout: () => void;
  title: string;
}

export const Layout: React.FC<LayoutProps> = ({ children, role, onLogout, title }) => {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-teal-700 text-white shadow-lg no-print">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-white p-2 rounded-full text-teal-700">
              <Activity size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold">{APP_CONFIG.branchName}</h1>
              <p className="text-xs text-teal-100 opacity-90">نظام إدارة عيادة السكر</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:block text-sm text-teal-50">
              {role === 'admin' && 'لوحة تحكم الإدارة'}
              {role === 'doctor' && 'بوابة الطبيب'}
              {role === 'pharmacist' && 'بوابة الصيدلية'}
            </div>
            <button 
              onClick={onLogout}
              className="flex items-center gap-2 bg-teal-800 hover:bg-teal-900 px-4 py-2 rounded-lg transition-colors text-sm"
            >
              <LogOut size={16} />
              <span>خروج</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow container mx-auto px-4 py-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-2 no-print">{title}</h2>
        {children}
      </main>

      {/* Footer - Strictly as requested */}
      <footer className="bg-gray-800 text-gray-300 py-6 text-center text-sm mt-auto no-print">
        <div className="container mx-auto px-4 space-y-2">
          <p className="font-semibold text-white">All rights reserved {APP_CONFIG.years}</p>
          <p>{APP_CONFIG.branchName}</p>
          <div className="flex flex-col md:flex-row justify-center gap-1 md:gap-4 text-xs md:text-sm text-gray-400">
            <span>Under Supervision of {APP_CONFIG.supervisor}</span>
            <span className="hidden md:inline">|</span>
            <span>Implemented by {APP_CONFIG.developer}</span>
            <span className="hidden md:inline">|</span>
            <span className="text-teal-500 font-bold">v2.0 Online</span>
          </div>
        </div>
      </footer>
    </div>
  );
};