
import React from 'react';

interface LoadingOverlayProps {
  message: string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-6">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="relative inline-block">
          {/* 애니메이션 링 */}
          <div className="absolute inset-0 rounded-full border-4 border-t-indigo-500 border-r-transparent border-b-purple-500 border-l-transparent animate-spin duration-1000"></div>
          <div className="absolute inset-2 rounded-full border-4 border-t-transparent border-r-pink-500 border-b-transparent border-l-cyan-500 animate-spin-reverse duration-700"></div>
          
          <div className="w-24 h-24 rounded-full bg-slate-900 flex items-center justify-center relative z-10">
            <svg className="w-10 h-10 text-white animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-white tracking-tight">콘텐츠를 생성하는 중입니다</h2>
          <p className="text-slate-400 font-medium animate-pulse">{message}</p>
        </div>

        <div className="flex justify-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.3s]"></div>
          <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce [animation-delay:-0.15s]"></div>
          <div className="w-2 h-2 rounded-full bg-pink-500 animate-bounce"></div>
        </div>
      </div>
    </div>
  );
};

export default LoadingOverlay;
