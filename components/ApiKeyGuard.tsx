
import React, { useEffect, useState } from 'react';

interface ApiKeyGuardProps {
  children: React.ReactNode;
}

const ApiKeyGuard: React.FC<ApiKeyGuardProps> = ({ children }) => {
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  const checkKey = async () => {
    try {
      const selected = await window.aistudio?.hasSelectedApiKey();
      setHasKey(!!selected);
    } catch (e) {
      setHasKey(false);
    }
  };

  useEffect(() => {
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    await window.aistudio?.openSelectKey();
    setHasKey(true);
  };

  if (hasKey === null) return null;

  if (!hasKey) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
        <div className="max-w-md w-full bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 rounded-3xl shadow-2xl text-center space-y-6">
          <div className="w-20 h-20 bg-indigo-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-indigo-500/20">
            <svg className="w-10 h-10 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white">Veo 활성화</h1>
          <p className="text-slate-400 leading-relaxed">
            Veo 3.1을 사용하여 고화질 영상을 생성하려면 유료 GCP 프로젝트의 유효한 API 키를 선택해야 합니다.
          </p>
          <div className="pt-4">
            <button
              onClick={handleSelectKey}
              className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98]"
            >
              API 키 선택하기
            </button>
          </div>
          <p className="text-xs text-slate-500">
            자세히 알아보기: <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">결제 및 API 사용 가이드</a>.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ApiKeyGuard;
