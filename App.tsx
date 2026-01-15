import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { AppStatus, AspectRatio, VideoResult, AppMode, VideoModel, ImageModel, ImageQuality, VideoQuality, PendingOperation } from './types';
import { generateNanoImage, generateVeoVideo } from './services/geminiService';
import { saveGalleryItem, loadGalleryItems, deleteGalleryItem, savePendingOperation, loadPendingOperations, deletePendingOperation } from './services/storageService';
import ApiKeyGuard from './components/ApiKeyGuard';

export interface ImagePrompt {
  id: string;
  text: string;
  refImage?: { data: string, mimeType: string };
}

export interface VideoPrompt {
  id: string;
  text: string;
}

export interface GenerationMetadata {
  mode: AppMode;
  aspectRatio: AspectRatio;
  model: VideoModel | ImageModel;
  quality: ImageQuality | VideoQuality;
  style?: string;
  baseIterationImage?: { data: string, mimeType: string } | null;
  maskImage?: { data: string, mimeType: string } | null;
  imagePreviewStart?: string | null;
  imagePreviewEnd?: string | null;
  videoRefImages?: { id: string, data: string, mimeType: string }[];
  videoPrompt?: string; 
  videoPrompts?: VideoPrompt[];
  imagePrompts?: ImagePrompt[];
  referenceImages?: { id: string, data: string, mimeType: string }[];
  characterAnchors?: { id: string, data: string, mimeType: string }[];
  backgroundRef?: { data: string, mimeType: string } | null;
}

export interface GalleryItem {
  id: string;
  uri: string;
  timestamp: number;
  prompt: string;
  type: 'VIDEO' | 'IMAGE';
  aspectRatio: AspectRatio;
  metadata: GenerationMetadata;
  isHidden?: boolean; // 숨김 상태 추가
}

interface BackgroundJob {
  id: string;
  type: 'IMAGE' | 'VIDEO' | 'EDIT';
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  message: string;
  progress: number;
  error?: string;
}

const IMAGE_STYLES = [
  '시네마틱', '사실화', '애니메이션', '3D', '웹툰', '유화', '수채화', '흑백', '동양화'
];

const CHARACTER_LIB = {
  "인종": ["동양인", "한국인", "서양인", "흑인", "히스패닉", "중동인", "북유럽인", "남미인", "혼혈"],
  "성별": ["남성", "여성", "소년", "소녀", "중성적인", "노인", "중년"],
  "헤어스타일": ["숏컷", "단발", "롱헤어", "포니테일", "트윈테일", "삭발", "아프로", "웨이브", "생머리", "모히칸", "리젠트", "펌헤어", "가르마펌"],
  "연령대": ["갓난아기", "영아기", "유아기", "초등 저학년", "초등 고학년", "중학생", "고등학생", "20대", "30대", "40대", "50대", "60대", "70대 이상"],
  "카메라 구도/앵글": ["클로즈업", "바스트 샷", "웨이스트 샷", "니 샷", "풀 샷", "롱 샷", "익스트림 롱 샷", "하이 앵글", "로우 앵글", "아이 레벨", "버드 아이 뷰", "웜즈 아이 뷰", "오버 더 숄더", "광각", "망원", "더치 틸트"],
  "행동/포즈": ["핸드폰으로 통화하는", "기도하는", "웃고 있는", "달리는", "앉아 있는", "명상하는", "춤추는", "손을 흔드는", "책을 읽는", "요리하는", "점프하는", "누워있는", "셀카 찍는", "울고 있는", "화난 표정"],
  "얼굴": ["큰 눈", "오똑한 코", "미소 짓는 입", "진지한 표정", "놀란 표정", "윙크하는", "주근깨", "수염", "짙은 눈썹", "보조개"],
  "의상": ["정장", "비즈니스 캐주얼", "스트릿 웨어", "한복", "전통 의상", "교복", "스포츠웨어", "화려한 드레스", "안경", "모자", "비니", "코트", "후드티", "수영복", "유니폼"]
};

const BACKGROUND_LIB = {
  "국가별": ["한국", "일본", "미국", "영국", "프랑스", "이탈리아", "중국", "이집트", "브라질", "스위스", "캐나다", "호주"],
  "지역별": ["서울", "뉴욕", "파리", "도쿄", "런던", "강남", "홍대", "명동", "시골마을", "어촌", "강원도 산골", "동해안"],
  "교통": ["지하철", "고속버스", "시내버스", "오토바이", "고급승용차", "경차", "트럭", "응급차", "경찰차", "비행기", "비즈니스석", "이코노미석", "1등석", "기차", "KTX", "SRT"],
  "세계명소": ["에펠탑", "자유의 여신상", "타지마할", "콜로세움", "피라미드", "빅벤", "마추픽추", "산토리니", "그랜드 캐년"],
  "한국명소": ["양양 앞바다", "설악산", "고성 앞바다", "전통한옥", "남이섬", "경복궁", "남산타워", "해운대", "한라산", "불국사", "광화문", "동대문디자인플라자", "독도", "울릉도", "전주 한옥마을", "보성 녹차밭", "첨성대", "정동진"],
  "카메라 구도/앵글": ["클로즈업", "바스트 샷", "웨이스트 샷", "니 샷", "풀 샷", "롱 샷", "익스트림 롱 샷", "하이 앵글", "로우 앵글", "아이 레벨", "버드 아이 뷰", "웜즈 아이 뷰", "오버 더 숄더", "광각", "망원", "더치 틸트"],
  "장소/공간별": ["카페", "사무실", "공원", "우주 정거장", "해변", "숲속", "도서관", "거실", "연구소", "학교 복도", "지하철", "옥상", "클럽", "캠핑장", "놀이공원"],
  "조명": ["자연광", "스튜디오 조명", "네온 사인", "촛불 조명", "황혼의 빛", "시네마틱 라이팅", "무대 조명", "하이키", "로우키", "역광", "소프트 박스", "레인보우 조명"],
  "날씨": ["맑은 하늘", "비 오는 날", "눈 내리는", "노을 지는", "한밤중", "안개 낀", "태풍이 부는", "구름 한 점 없는", "천둥 번개"],
  "시간": ["새벽녘", "이른 아침", "정오", "늦은 오후", "해질녘", "매직 아워", "깊은 밤", "황혼"],
  "분위기": ["몽환적인", "신비로운", "따뜻한", "차가운", "긴박한", "평화로운", "장엄한", "빈티지한", "호러틱한", "동화 같은", "사이버펑크", "레트로"]
};

type PanelId = 'NOTE' | 'LIBRARY' | 'GENERATOR' | 'LATEST' | 'ARCHIVE';

const App: React.FC = () => {
  const [backgroundJobs, setBackgroundJobs] = useState<BackgroundJob[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<GalleryItem | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const [layout, setLayout] = useState<{
    left: PanelId[];
    center: PanelId[];
    right: PanelId[];
    leftWidth: number;
    rightWidth: number;
    panelHeights: Record<PanelId, number | string>;
    collapsed: PanelId[];
  }>(() => {
    const saved = localStorage.getItem('studio_layout_v4');
    if (saved) return JSON.parse(saved);
    return {
      left: ['NOTE', 'LIBRARY'],
      center: ['GENERATOR'],
      right: ['LATEST', 'ARCHIVE'],
      leftWidth: 25,
      rightWidth: 25,
      panelHeights: {
        NOTE: '300px',
        LIBRARY: '400px',
        GENERATOR: '100%',
        LATEST: '300px',
        ARCHIVE: '100%'
      },
      collapsed: []
    };
  });

  useEffect(() => {
    localStorage.setItem('studio_layout_v4', JSON.stringify(layout));
  }, [layout]);

  const startResizing = (e: React.MouseEvent, type: 'COLUMN_LEFT' | 'COLUMN_RIGHT') => {
    const startX = e.clientX;
    const initialWidth = type === 'COLUMN_LEFT' ? layout.leftWidth : layout.rightWidth;
    
    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const percentDelta = (deltaX / window.innerWidth) * 100;
      if (type === 'COLUMN_LEFT') {
        setLayout(prev => ({ ...prev, leftWidth: Math.max(10, Math.min(45, initialWidth + percentDelta)) }));
      } else {
        setLayout(prev => ({ ...prev, rightWidth: Math.max(10, Math.min(45, initialWidth - percentDelta)) }));
      }
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const movePanel = (id: PanelId, from: 'left' | 'center' | 'right', to: 'left' | 'center' | 'right') => {
    if (from === to) {
      const list = [...layout[from]];
      const idx = list.indexOf(id);
      if (idx !== -1) {
        list.splice(idx, 1);
        list.push(id); 
        setLayout(prev => ({ ...prev, [from]: list }));
      }
      return;
    }
    setLayout(prev => ({
      ...prev,
      [from]: prev[from].filter(p => p !== id),
      [to]: [...prev[to], id]
    }));
  };

  const toggleCollapse = (id: PanelId) => {
    setLayout(prev => ({
      ...prev,
      collapsed: prev.collapsed.includes(id) 
        ? prev.collapsed.filter(p => p !== id) 
        : [...prev.collapsed, id]
    }));
  };

  const [note, setNote] = useState(() => localStorage.getItem('studio_note') || '');
  const [selectedStyle, setSelectedStyle] = useState('시네마틱');
  const [openLibCategory, setOpenLibCategory] = useState<string | null>(null);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GalleryItem | null>(null);
  const [brushSize, setBrushSize] = useState(40);
  const [isDrawing, setIsDrawing] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [editRefImage, setEditRefImage] = useState<{data: string, mimeType: string} | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);

  const [dashboardTab, setDashboardTab] = useState<'IMAGE' | 'VIDEO'>('IMAGE');

  const [imagePreviewStart, setImagePreviewStart] = useState<string | null>(null);
  const [imagePreviewEnd, setImagePreviewEnd] = useState<string | null>(null);
  const [baseIterationImage, setBaseIterationImage] = useState<{data: string, mimeType: string} | null>(null);
  const [videoRefImages, setVideoRefImages] = useState<{id: string, data: string, mimeType: string}[]>([]);
  const [characterAnchors, setCharacterAnchors] = useState<{id: string, data: string, mimeType: string}[]>([]);
  const [backgroundRef, setBackgroundRef] = useState<{data: string, mimeType: string} | null>(null);
  const [imagePrompts, setImagePrompts] = useState<ImagePrompt[]>([{ id: crypto.randomUUID(), text: '' }]);
  const [videoPrompts, setVideoPrompts] = useState<VideoPrompt[]>([{ id: crypto.randomUUID(), text: '' }]);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [videoModel, setVideoModel] = useState<VideoModel>('veo-3.1-fast-generate-preview');
  const [imageModel, setImageModel] = useState<ImageModel>('gemini-3-pro-image-preview');
  const [imageQuality, setImageQuality] = useState<ImageQuality>('2K');
  const [videoQuality, setVideoQuality] = useState<VideoQuality>('1080p');

  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [latestResult, setLatestResult] = useState<GalleryItem | null>(null);
  
  const startFileInputRef = useRef<HTMLInputElement>(null);
  const endFileInputRef = useRef<HTMLInputElement>(null);
  const refFileInputRef = useRef<HTMLInputElement>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const videoRefFileInputRef = useRef<HTMLInputElement>(null);
  const promptRefFileInputRef = useRef<HTMLInputElement>(null);
  const editRefFileInputRef = useRef<HTMLInputElement>(null);
  const activePromptIdRef = useRef<string | null>(null);

  useEffect(() => {
    const initApp = async () => {
      try {
        const savedGallery = await loadGalleryItems();
        setGalleryItems(savedGallery);
        const pendingOps = await loadPendingOperations();
        pendingOps.forEach(op => { if (op.type === 'VIDEO') resumeVideoGeneration(op); });
      } catch (err) { console.error("초기화 오류:", err); }
    };
    initApp();
  }, []);

  useEffect(() => {
    localStorage.setItem('studio_note', note);
  }, [note]);

  const resumeVideoGeneration = async (op: PendingOperation) => {
    try {
      const { url } = await generateVeoVideo(op.params, (msg) => updateJob(op.id, { status: 'RUNNING', message: `복구됨: ${msg}`, progress: 50 }), op.operationName);
      const newItem: GalleryItem = { id: crypto.randomUUID(), uri: url, timestamp: Date.now(), prompt: op.params.prompt, type: 'VIDEO', aspectRatio: op.params.aspectRatio, metadata: { ...op.params, videoPrompt: op.params.prompt } };
      setGalleryItems(prev => [newItem, ...prev]);
      setLatestResult(newItem);
      await saveGalleryItem(newItem);
      updateJob(op.id, { status: 'COMPLETED', message: `영상 완료!`, progress: 100 });
      await deletePendingOperation(op.id);
      setTimeout(() => removeJob(op.id), 5000);
    } catch (err: any) {
      if (err.message.includes("API_KEY_EXPIRED")) {
        await window.aistudio?.openSelectKey();
        updateJob(op.id, { status: 'FAILED', message: `인증 필요` });
      } else {
        updateJob(op.id, { status: 'FAILED', message: `복구 실패`, error: err.message, progress: 100 });
      }
      await deletePendingOperation(op.id);
    }
  };

  const updateJob = (id: string, updates: Partial<BackgroundJob> | ((job: BackgroundJob) => Partial<BackgroundJob>)) => {
    setBackgroundJobs(prev => prev.map(job => {
      if (job.id === id) {
        const nextUpdates = typeof updates === 'function' ? updates(job) : updates;
        return { ...job, ...nextUpdates };
      }
      return job;
    }));
  };

  const removeJob = (id: string) => setBackgroundJobs(prev => prev.filter(job => job.id !== id));

  const fileToBase64 = (file: File): Promise<{ data: string, mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const match = result.match(/^data:(.+);base64,(.+)$/);
        if (match) resolve({ mimeType: match[1], data: match[2] });
        else reject(new Error("Base64 분석 오류"));
      };
      reader.readAsDataURL(file);
    });
  };

  const handlePasteImage = async (e: React.ClipboardEvent, target: 'START' | 'END') => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const res = await fileToBase64(file);
          const dataUrl = `data:${res.mimeType};base64,${res.data}`;
          if (target === 'START') setImagePreviewStart(dataUrl);
          else setImagePreviewEnd(dataUrl);
        }
      }
    }
  };

  const getDownloadFilename = (prompt: string, timestamp: number) => {
    const safePrompt = prompt.substring(0, 10).replace(/[^\uAC00-\uD7A3a-zA-Z0-9\s]/g, '').trim() || 'asset';
    const d = new Date(timestamp);
    const datePart = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const timePart = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
    return `${safePrompt}_${datePart}_${timePart}`;
  };

  const handleReusePrompt = (prompt: string) => {
    if (dashboardTab === 'IMAGE') {
      setImagePrompts(prev => prev.map((p, i) => i === 0 ? { ...p, text: prompt } : p));
    } else {
      setVideoPrompts(prev => prev.map((p, i) => i === 0 ? { ...p, text: prompt } : p));
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const sendToInput = (uri: string, target: 'START' | 'END' | 'ID' | 'BG' | 'BASE' | 'GUIDE') => {
    const match = uri.match(/^data:(.+);base64,(.+)$/);
    switch(target) {
      case 'START': setImagePreviewStart(uri); setDashboardTab('VIDEO'); break;
      case 'END': setImagePreviewEnd(uri); setDashboardTab('VIDEO'); break;
      case 'ID': 
        if (match) setCharacterAnchors(prev => [...prev, { id: crypto.randomUUID(), mimeType: match[1], data: match[2] }]);
        setDashboardTab('IMAGE');
        break;
      case 'BG':
        if (match) setBackgroundRef({ mimeType: match[1], data: match[2] });
        setDashboardTab('IMAGE');
        break;
      case 'BASE':
        if (match) setBaseIterationImage({ mimeType: match[1], data: match[2] });
        setDashboardTab('IMAGE');
        break;
      case 'GUIDE':
        if (match) setImagePrompts(prev => prev.map((p, i) => i === 0 ? { ...p, refImage: { data: match[2], mimeType: match[1] } } : p));
        setDashboardTab('IMAGE');
        break;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const addTagToPrompt = (tag: string, type: 'IMAGE' | 'VIDEO') => {
    const keyword = `[${tag}]`;
    if (type === 'IMAGE') {
      setImagePrompts(prev => prev.map((p, i) => i === 0 ? { ...p, text: `${p.text} ${keyword}` } : p));
    } else {
      setVideoPrompts(prev => prev.map((p, i) => i === 0 ? { ...p, text: `${p.text} ${keyword}` } : p));
    }
  };

  const openEditor = (item: GalleryItem) => {
    setEditingItem(item);
    setIsEditorOpen(true);
    setEditPrompt(item.prompt);
    setTimeout(() => initEditorCanvas(item), 100);
  };

  const initEditorCanvas = (item: GalleryItem) => {
    const canvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!canvas || !maskCanvas) return;
    const ctx = canvas.getContext('2d');
    const mCtx = maskCanvas.getContext('2d');
    if (!ctx || !mCtx) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const maxWidth = canvas.parentElement?.clientWidth || 800;
      const ratio = Math.min(maxWidth / img.width, 500 / img.height);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      maskCanvas.width = canvas.width;
      maskCanvas.height = canvas.height;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      mCtx.fillStyle = "black";
      mCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    };
    img.src = item.uri;
  };

  const drawMask = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !maskCanvasRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const mCtx = maskCanvasRef.current.getContext('2d');
    const ctx = canvas.getContext('2d');
    if (!mCtx || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;
    mCtx.fillStyle = "white";
    mCtx.beginPath(); mCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2); mCtx.fill();
    ctx.globalAlpha = 0.3; ctx.fillStyle = "#6366f1";
    ctx.beginPath(); ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1.0;
  };

  /**
   * 숨김 상태 토글 핸들러
   */
  const handleToggleHide = async (e: React.MouseEvent, item: GalleryItem) => {
    e.preventDefault();
    e.stopPropagation();
    
    const nextHiddenState = !item.isHidden;
    const updatedItem = { ...item, isHidden: nextHiddenState };
    
    // 1. 낙관적 업데이트
    setGalleryItems(prev => prev.map(i => i.id === item.id ? updatedItem : i));
    if (latestResult?.id === item.id) setLatestResult(updatedItem);

    // 2. DB 업데이트
    try {
      await saveGalleryItem(updatedItem);
    } catch (err) {
      console.error("숨김 상태 저장 실패:", err);
      const items = await loadGalleryItems();
      setGalleryItems(items);
    }
  };

  /**
   * 아카이브 아이템용 스마트 호버 메뉴 렌더링
   */
  const renderSmartHoverMenu = (item: GalleryItem) => (
    <div className="absolute inset-0 bg-slate-950/90 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center p-3 transition-opacity overflow-y-auto custom-scrollbar z-50">
       <div className="mb-2 text-[8px] text-slate-400 text-center space-y-0.5 pointer-events-none">
          <div>{new Date(item.timestamp).toLocaleString('ko-KR')}</div>
          <div className="line-clamp-1 font-bold">"{item.prompt}"</div>
       </div>

       <div className="grid grid-cols-2 gap-1.5 w-full">
          {item.type === 'VIDEO' ? (
            <>
              <button onClick={(e) => { e.stopPropagation(); handleRegenerate(item); }} className="py-1.5 bg-slate-700 hover:bg-slate-600 text-[8px] font-bold text-white rounded-lg transition-all">다시 생성하기</button>
              <button onClick={(e) => { e.stopPropagation(); handleReusePrompt(item.prompt); }} className="py-1.5 bg-slate-700 hover:bg-slate-600 text-[8px] font-bold text-white rounded-lg transition-all">프롬프트 재사용</button>
              <button onClick={(e) => { e.stopPropagation(); setPreviewItem(item); }} className="py-1.5 bg-slate-800 hover:bg-slate-700 text-[8px] font-bold text-white rounded-lg transition-all">확대</button>
              <a href={item.uri} download={getDownloadFilename(item.prompt, item.timestamp)} onClick={(e) => e.stopPropagation()} className="py-1.5 bg-emerald-600 hover:bg-emerald-500 text-[8px] font-bold text-white rounded-lg transition-all text-center flex items-center justify-center">다운로드</a>
              <button onClick={(e) => handleToggleHide(e, item)} className="py-1.5 bg-pink-600 hover:bg-pink-500 text-[8px] font-bold text-white rounded-lg transition-all col-span-2">숨김</button>
            </>
          ) : (
            <>
              <button onClick={(e) => { e.stopPropagation(); sendToInput(item.uri, 'START'); }} className="py-1.5 bg-indigo-600 hover:bg-indigo-500 text-[8px] font-bold text-white rounded-lg transition-all">영상 시작</button>
              <button onClick={(e) => { e.stopPropagation(); sendToInput(item.uri, 'END'); }} className="py-1.5 bg-indigo-600 hover:bg-indigo-500 text-[8px] font-bold text-white rounded-lg transition-all">영상 종료</button>
              <button onClick={(e) => { e.stopPropagation(); sendToInput(item.uri, 'ID'); }} className="py-1.5 bg-purple-600 hover:bg-purple-500 text-[8px] font-bold text-white rounded-lg transition-all">인물 고정</button>
              <button onClick={(e) => { e.stopPropagation(); sendToInput(item.uri, 'BG'); }} className="py-1.5 bg-purple-600 hover:bg-purple-500 text-[8px] font-bold text-white rounded-lg transition-all">배경 참조</button>
              <button onClick={(e) => { e.stopPropagation(); sendToInput(item.uri, 'BASE'); }} className="py-1.5 bg-cyan-600 hover:bg-cyan-500 text-[8px] font-bold text-white rounded-lg transition-all">추가 요청하기</button>
              <button onClick={(e) => { e.stopPropagation(); sendToInput(item.uri, 'GUIDE'); }} className="py-1.5 bg-cyan-600 hover:bg-cyan-500 text-[8px] font-bold text-white rounded-lg transition-all">가이드 이미지</button>
              <button onClick={(e) => { e.stopPropagation(); handleRegenerate(item); }} className="py-1.5 bg-slate-700 hover:bg-slate-600 text-[8px] font-bold text-white rounded-lg transition-all">다시 생성하기</button>
              <button onClick={(e) => { e.stopPropagation(); handleReusePrompt(item.prompt); }} className="py-1.5 bg-slate-700 hover:bg-slate-600 text-[8px] font-bold text-white rounded-lg transition-all">프롬프트 재사용</button>
              {item.type === 'IMAGE' && <button onClick={(e) => { e.stopPropagation(); openEditor(item); }} className="py-1.5 bg-indigo-900/40 hover:bg-indigo-700 text-[8px] font-bold text-indigo-300 rounded-lg transition-all">부분 수정</button>}
              <button onClick={(e) => { e.stopPropagation(); setPreviewItem(item); }} className="py-1.5 bg-slate-800 hover:bg-slate-700 text-[8px] font-bold text-white rounded-lg transition-all">확대</button>
              <a href={item.uri} download={getDownloadFilename(item.prompt, item.timestamp)} onClick={(e) => e.stopPropagation()} className="py-1.5 bg-emerald-600 hover:bg-emerald-500 text-[8px] font-bold text-white rounded-lg transition-all text-center flex items-center justify-center">다운로드</a>
              <button onClick={(e) => handleToggleHide(e, item)} className="py-1.5 bg-pink-600 hover:bg-pink-500 text-[8px] font-bold text-white rounded-lg transition-all">숨김</button>
            </>
          )}
       </div>
    </div>
  );

  const applyEdit = async () => {
    if (!editingItem || !maskCanvasRef.current) return;
    const jobId = crypto.randomUUID();
    setIsEditorOpen(false);
    setBackgroundJobs(prev => [{ id: jobId, type: 'EDIT', status: 'RUNNING', message: `스마트 편집 중...`, progress: 10 }, ...prev]);
    try {
      const maskBase64 = maskCanvasRef.current.toDataURL("image/png").split(',')[1];
      const match = editingItem.uri.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!match) throw new Error("원본 오류");
      const { base64, mimeType } = await generateNanoImage(editPrompt, editingItem.aspectRatio, imageModel, imageQuality, [], false, null, null, { data: match[2], mimeType: match[1] }, { data: maskBase64, mimeType: "image/png" });
      const newItem: GalleryItem = { id: crypto.randomUUID(), uri: `data:${mimeType};base64,${base64}`, timestamp: Date.now(), prompt: editPrompt, type: 'IMAGE', aspectRatio: editingItem.aspectRatio, metadata: { ...editingItem.metadata, baseIterationImage: { data: match[2], mimeType: match[1] } } };
      setGalleryItems(prev => [newItem, ...prev]);
      setLatestResult(newItem);
      await saveGalleryItem(newItem);
      updateJob(jobId, { status: 'COMPLETED', message: `편집 완료!`, progress: 100 });
      setTimeout(() => removeJob(jobId), 4000);
    } catch (err: any) {
      if (err.message.includes("API_KEY_EXPIRED")) {
        await window.aistudio?.openSelectKey();
        updateJob(jobId, { status: 'FAILED', message: `인증 필요` });
      } else {
        updateJob(jobId, { status: 'FAILED', message: `편집 실패`, error: err.message, progress: 100 });
      }
    }
  };

  const handleGenerateImage = async () => {
    const validPrompts = imagePrompts.filter(p => p.text.trim() !== '');
    if (validPrompts.length === 0) { alert("프롬프트를 입력하세요."); return; }
    const finalIdentityRefs = characterAnchors.map(a => ({ data: a.data, mimeType: a.mimeType }));

    validPrompts.forEach(async (promptObj, i) => {
      const jobId = crypto.randomUUID();
      setBackgroundJobs(prev => [{ id: jobId, type: 'IMAGE', status: 'RUNNING', message: `장면 #${i + 1} 생성 중...`, progress: 10 }, ...prev]);
      try {
        const fullPrompt = `(Style: ${selectedStyle}) ${promptObj.text}`;
        const { base64, mimeType } = await generateNanoImage(fullPrompt, aspectRatio, imageModel, imageQuality, finalIdentityRefs, finalIdentityRefs.length > 0, backgroundRef, promptObj.refImage, baseIterationImage);
        const newItem: GalleryItem = { id: crypto.randomUUID(), uri: `data:${mimeType};base64,${base64}`, timestamp: Date.now(), prompt: promptObj.text, type: 'IMAGE', aspectRatio: aspectRatio, metadata: { mode: 'AD_EXPERT', style: selectedStyle, aspectRatio, model: imageModel, quality: imageQuality, imagePrompts: [promptObj], characterAnchors, backgroundRef, baseIterationImage } };
        setGalleryItems(prev => [newItem, ...prev]);
        setLatestResult(newItem);
        await saveGalleryItem(newItem);
        updateJob(jobId, { status: 'COMPLETED', message: `장면 #${i + 1} 완료!`, progress: 100 });
        setTimeout(() => removeJob(jobId), 4000);
      } catch (err: any) {
        if (err.message.includes("API_KEY_EXPIRED")) {
          await window.aistudio?.openSelectKey();
          updateJob(jobId, { status: 'FAILED', message: `인증 필요` });
        } else {
          updateJob(jobId, { status: 'FAILED', message: `생성 실패`, error: err.message, progress: 100 });
        }
      }
    });
  };

  const handleGenerateVideo = async () => {
    if (!imagePreviewStart) { alert("시작 이미지를 업로드하세요."); return; }
    const startMatch = imagePreviewStart.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!startMatch) return;
    const endMatch = imagePreviewEnd?.match(/^data:(image\/\w+);base64,(.+)$/);
    const validPrompts = videoPrompts.filter(p => p.text.trim() !== '');
    const finalPrompts = validPrompts.length > 0 ? validPrompts : [{ id: 'default', text: 'Cinematic motion' }];

    const sanitizedRefImages = videoRefImages.map(img => ({ data: img.data, mimeType: img.mimeType }));

    finalPrompts.forEach(async (promptObj, i) => {
      const jobId = crypto.randomUUID();
      setBackgroundJobs(prev => [{ id: jobId, type: 'VIDEO', status: 'RUNNING', message: `영상 #${i+1} 준비 중...`, progress: 5 }, ...prev]);
      try {
        const params = { 
          prompt: promptObj.text, 
          imageBytes: startMatch[2], 
          mimeType: startMatch[1], 
          lastFrameBytes: endMatch?.[2], 
          lastFrameMimeType: endMatch?.[1], 
          referenceImages: sanitizedRefImages, 
          aspectRatio, 
          model: videoModel, 
          resolution: videoQuality 
        };
        const { url } = await generateVeoVideo(params, (msg) => updateJob(jobId, (prev) => ({ message: `[${i+1}] ${msg}`, progress: Math.min(95, (prev.progress || 0) + 5) })), undefined, async (opName) => {
             await savePendingOperation({ id: jobId, operationName: opName, type: 'VIDEO', params, timestamp: Date.now() });
        });
        const newItem: GalleryItem = { id: crypto.randomUUID(), uri: url, timestamp: Date.now(), prompt: promptObj.text, type: 'VIDEO', aspectRatio: aspectRatio, metadata: { mode: 'AD_EXPERT', aspectRatio, model: videoModel, quality: videoQuality, imagePreviewStart, imagePreviewEnd, videoRefImages, videoPrompts: [promptObj], videoPrompt: promptObj.text } };
        setGalleryItems(prev => [newItem, ...prev]);
        setLatestResult(newItem);
        await saveGalleryItem(newItem);
        updateJob(jobId, { status: 'COMPLETED', message: `영상 #${i+1} 완성!`, progress: 100 });
        await deletePendingOperation(jobId);
        setTimeout(() => removeJob(jobId), 5000);
      } catch (err: any) {
        if (err.message.includes("API_KEY_EXPIRED")) {
          alert("API 키가 유효하지 않거나 만료되었습니다. 다시 선택해주세요.");
          await window.aistudio?.openSelectKey();
          updateJob(jobId, { status: 'FAILED', message: `인증 필요` });
        } else {
          updateJob(jobId, { status: 'FAILED', message: `생성 실패`, error: err.message, progress: 100 });
        }
        await deletePendingOperation(jobId);
      }
    });
  };

  const handleRegenerate = (item: GalleryItem) => {
    if (item.type === 'IMAGE') handleGenerateImage();
    else handleGenerateVideo();
  };

  const renderPanelHeader = (id: PanelId, title: string, from: 'left' | 'center' | 'right', icon: React.ReactNode) => {
    const isCollapsed = layout.collapsed.includes(id);
    return (
      <div className={`p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80 sticky top-0 z-20 ${isCollapsed ? 'rounded-3xl border-none' : ''}`}>
        <h2 className="text-xs font-bold text-white uppercase tracking-widest flex items-center space-x-2">
          {icon}
          <span>{title}</span>
        </h2>
        <div className="flex items-center space-x-1">
          <button onClick={() => toggleCollapse(id)} className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-500" title={isCollapsed ? "펼치기" : "접기"}>
            <svg className={`w-3.5 h-3.5 transition-transform ${isCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 9l-7 7-7-7" /></svg>
          </button>
          {!isCollapsed && (
            <>
              <button onClick={() => movePanel(id, from, from)} className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-500" title="순서 변경"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg></button>
              {from !== 'left' && <button onClick={() => movePanel(id, from, 'left')} className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-500" title="왼쪽으로 이동"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M15 19l-7-7 7-7" /></svg></button>}
              {from !== 'center' && <button onClick={() => movePanel(id, from, 'center')} className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-500" title="중앙으로 이동"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>}
              {from !== 'right' && <button onClick={() => movePanel(id, from, 'right')} className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-500" title="오른쪽으로 이동"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M9 5l7 7-7 7" /></svg></button>}
            </>
          )}
        </div>
      </div>
    );
  };

  const renderPanelContent = (id: PanelId, from: 'left' | 'center' | 'right') => {
    const isCollapsed = layout.collapsed.includes(id);
    const height = isCollapsed ? 'auto' : layout.panelHeights[id];
    
    switch (id) {
      case 'NOTE':
        return (
          <div key="NOTE" className={`bg-slate-900/50 border border-slate-800 rounded-3xl flex flex-col overflow-hidden shadow-xl transition-all ${!isCollapsed ? 'resize-y' : ''}`} style={{ height }}>
            {renderPanelHeader('NOTE', '전략 메모장', from, <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>)}
            {!isCollapsed && <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="광고 기획, 가사, 아이디어를 자유롭게 메모하세요..." className="flex-grow bg-transparent p-6 text-sm text-slate-300 resize-none focus:ring-0 leading-relaxed custom-scrollbar" />}
          </div>
        );
      case 'LIBRARY':
        return (
          <div key="LIBRARY" className={`bg-slate-900/50 border border-slate-800 rounded-3xl flex flex-col overflow-hidden shadow-xl transition-all ${!isCollapsed ? 'resize-y' : ''}`} style={{ height }}>
            {renderPanelHeader('LIBRARY', '라이브러리', from, <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>)}
            {!isCollapsed && (
              <div className="flex-grow overflow-y-auto p-4 space-y-2 custom-scrollbar">
                <div className="mb-4">
                  <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2 px-1">인물 에셋</h4>
                  {Object.entries(CHARACTER_LIB).map(([cat, tags]) => (
                    <div key={cat} className="mb-1 border border-slate-800/50 rounded-xl overflow-hidden">
                      <button onClick={() => setOpenLibCategory(openLibCategory === cat ? null : cat)} className="w-full flex items-center justify-between p-3 bg-slate-800/30 hover:bg-slate-800 transition-colors">
                        <span className="text-[10px] font-bold text-slate-300">{cat}</span>
                        <svg className={`w-3 h-3 text-slate-500 transition-transform ${openLibCategory === cat ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 9l-7 7-7-7" /></svg>
                      </button>
                      {openLibCategory === cat && (
                        <div className="p-3 bg-slate-950/30 flex flex-wrap gap-1.5 animate-in slide-in-from-top-2 duration-200">
                          {tags.map(tag => <button key={tag} onClick={() => addTagToPrompt(tag, dashboardTab)} className="px-1.5 py-0.5 bg-slate-800 hover:bg-indigo-600 text-[9px] rounded-md transition-colors">+{tag}</button>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div>
                  <h4 className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-2 px-1">배경 에셋</h4>
                  {Object.entries(BACKGROUND_LIB).map(([cat, tags]) => (
                    <div key={cat} className="mb-1 border border-slate-800/50 rounded-xl overflow-hidden">
                      <button onClick={() => setOpenLibCategory(openLibCategory === cat ? null : cat)} className="w-full flex items-center justify-between p-3 bg-slate-800/30 hover:bg-slate-800 transition-colors">
                        <span className="text-[10px] font-bold text-slate-300">{cat}</span>
                        <svg className={`w-3 h-3 text-slate-500 transition-transform ${openLibCategory === cat ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 9l-7 7-7-7" /></svg>
                      </button>
                      {openLibCategory === cat && (
                        <div className="p-3 bg-slate-950/30 flex flex-wrap gap-1.5 animate-in slide-in-from-top-2 duration-200">
                          {tags.map(tag => <button key={tag} onClick={() => addTagToPrompt(tag, dashboardTab)} className="px-1.5 py-0.5 bg-slate-800 hover:bg-purple-600 text-[9px] rounded-md transition-colors">+{tag}</button>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      case 'GENERATOR':
        return (
          <div key="GENERATOR" className={`bg-slate-900/40 border border-slate-800 rounded-[40px] flex flex-col h-full shadow-2xl overflow-hidden transition-all ${!isCollapsed ? 'flex-grow min-w-0' : 'h-16 flex-shrink-0'}`} style={{ height }}>
             {isCollapsed ? (
                <div className="p-4 flex items-center justify-between h-full bg-slate-900/80 rounded-[40px]">
                   <h2 className="text-xs font-bold text-white uppercase tracking-widest flex items-center space-x-2">
                     <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                     <span>생성기</span>
                   </h2>
                   <button onClick={() => toggleCollapse('GENERATOR')} className="p-1 hover:bg-slate-800 rounded text-slate-500"><svg className="w-4 h-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 9l-7 7-7-7" /></svg></button>
                </div>
             ) : (
                <>
                <div className="pt-8 text-center animate-in fade-in slide-in-from-top-4 duration-700">
                   <h1 className="text-xl font-black text-white tracking-widest drop-shadow-[0_2px_10px_rgba(99,102,241,0.5)]">산다라 AI콘텐츠 스튜디오</h1>
                </div>
                <div className="flex bg-slate-950 p-2 rounded-full border border-slate-800 w-fit mx-auto mt-6 items-center relative">
                  <button onClick={() => setShowHelp(true)} className="ml-2 mr-4 p-2 bg-slate-800 hover:bg-indigo-600 rounded-full transition-all group relative">
                    <svg className="w-4 h-4 text-slate-300 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </button>
                  <button onClick={() => setDashboardTab('IMAGE')} className={`px-10 py-2.5 rounded-full text-xs font-bold transition-all ${dashboardTab === 'IMAGE' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>이미지 (나노바나나)</button>
                  <button onClick={() => setDashboardTab('VIDEO')} className={`px-10 py-2.5 rounded-full text-xs font-bold transition-all ${dashboardTab === 'VIDEO' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>영상 (VEO)</button>
                  <button onClick={() => toggleCollapse('GENERATOR')} className="absolute -right-12 top-1/2 -translate-y-1/2 p-2 text-slate-600 hover:text-white transition-colors" title="접기"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 9l-7 7-7-7" /></svg></button>
                </div>
                <div className="flex-grow overflow-y-auto p-8 custom-scrollbar space-y-8">
                  {dashboardTab === 'IMAGE' ? (
                    <div className="space-y-8 animate-in fade-in zoom-in-95">
                      <div className="grid grid-cols-4 gap-4 bg-slate-950/50 p-4 rounded-3xl border border-slate-800">
                        <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500">비율</label><select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as AspectRatio)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-2 text-xs text-white"><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option><option value="4:3">4:3</option><option value="3:4">3:4</option><option value="21:9">21:9</option><option value="9:21">9:21</option></select></div>
                        <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500">화질</label><select value={imageQuality} onChange={(e) => setImageQuality(e.target.value as ImageQuality)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-2 text-xs text-white"><option value="1K">1K</option><option value="2K">2K</option><option value="4K">4K</option></select></div>
                        <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500">스타일</label><select value={selectedStyle} onChange={(e) => setSelectedStyle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-2 text-xs text-white">{IMAGE_STYLES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                        <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500">모델</label><select value={imageModel} onChange={(e) => setImageModel(e.target.value as ImageModel)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-2 text-xs text-white"><option value="gemini-3-pro-image-preview">Pro (추천)</option><option value="gemini-2.5-flash-image">Flash</option></select></div>
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between"><h3 className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest">인물고정</h3><div className="flex space-x-2"><button onClick={() => refFileInputRef.current?.click()} className="text-[9px] text-white bg-slate-800 px-3 py-1 rounded-lg">추가</button></div></div>
                        <div className="grid grid-cols-4 gap-3">
                          {characterAnchors.map(anchor => (
                            <div key={anchor.id} className="relative aspect-square rounded-2xl overflow-hidden group border border-slate-800 bg-slate-950 flex-shrink-0 w-full min-w-[60px] min-h-[60px] h-full"><img src={`data:${anchor.mimeType};base64,${anchor.data}`} className="w-full h-full object-cover" /><button onClick={() => setCharacterAnchors(characterAnchors.filter(a => a.id !== anchor.id))} className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" /></svg></button></div>
                          ))}
                          {characterAnchors.length < 4 && <div onClick={() => refFileInputRef.current?.click()} className="aspect-square bg-slate-950 border border-dashed border-slate-800 rounded-2xl flex items-center justify-center text-slate-600 hover:bg-slate-900 cursor-pointer transition-colors flex-shrink-0 w-full min-w-[60px] min-h-[60px]"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 4v16m8-8H4" /></svg></div>}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <label className="text-[11px] font-bold text-purple-400 uppercase tracking-widest flex justify-between"><span>배경 참조</span></label>
                          <div className="h-28 bg-slate-950 border border-dashed border-slate-800 rounded-3xl overflow-hidden relative group flex-shrink-0 w-full min-h-[112px]">
                            {backgroundRef ? <><img src={`data:${backgroundRef.mimeType};base64,${backgroundRef.data}`} className="w-full h-full object-cover" /><button onClick={() => setBackgroundRef(null)} className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" /></svg></button></> : <div onClick={() => bgFileInputRef.current?.click()} className="w-full h-full flex items-center justify-center cursor-pointer text-slate-700 text-[10px] font-bold">배경 업로드</div>}
                          </div>
                        </div>
                        <div className="space-y-3">
                          <label className="text-[11px] font-bold text-cyan-400 uppercase tracking-widest flex justify-between"><span>추가 요청하기</span></label>
                          <div className="h-28 bg-slate-950 border border-dashed border-slate-800 rounded-3xl overflow-hidden relative group flex-shrink-0 w-full min-h-[112px]">
                            {baseIterationImage ? <><img src={`data:${baseIterationImage.mimeType};base64,${baseIterationImage.data}`} className="w-full h-full object-cover" /><button onClick={() => setBaseIterationImage(null)} className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" /></svg></button></> : <div className="w-full h-full flex items-center justify-center text-slate-700 text-[10px] font-bold italic">아카이브에서 전송하세요</div>}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between"><h3 className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest">장면 묘사</h3><button onClick={() => setImagePrompts([...imagePrompts, { id: crypto.randomUUID(), text: '' }])} className="text-[10px] text-white bg-slate-800 px-3 py-1 rounded-lg">장면 추가</button></div>
                        {imagePrompts.map((p, idx) => (
                          <div key={p.id} className="bg-slate-950/40 p-5 rounded-[32px] border border-slate-800 flex space-x-4 relative group">
                            <textarea value={p.text} onChange={(e) => setImagePrompts(imagePrompts.map(ip => ip.id === p.id ? { ...ip, text: e.target.value } : ip))} placeholder="생성할 장면에 대해 설명하세요..." className="flex-grow bg-transparent border-none text-sm text-white resize-none h-24 focus:ring-0 leading-relaxed min-w-0" />
                            <div className="flex flex-col items-center space-y-1 flex-shrink-0">
                              <div className="flex items-center justify-between w-full mb-1 px-1"><span className="text-[9px] text-slate-500 font-bold">가이드</span></div>
                              <div className="w-20 h-20 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden relative group/guide flex-shrink-0 min-w-[80px] min-h-[80px]">
                                {p.refImage ? <><img src={`data:${p.refImage.mimeType};base64,${p.refImage.data}`} className="w-full h-full object-cover" /><button onClick={() => setImagePrompts(imagePrompts.map(ip => ip.id === p.id ? { ...ip, refImage: undefined } : ip))} className="absolute inset-0 bg-red-600/60 opacity-0 group-hover/guide:opacity-100 flex items-center justify-center text-white"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" /></svg></button></> : <div onClick={() => { activePromptIdRef.current = p.id; promptRefFileInputRef.current?.click(); }} className="w-full h-full flex flex-col items-center justify-center cursor-pointer text-slate-700 hover:text-indigo-400 transition-colors"><svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2-2v12a2 2 0 002 2z" /></svg></div>}
                              </div>
                            </div>
                            {imagePrompts.length > 1 && <button onClick={() => setImagePrompts(imagePrompts.filter(ip => ip.id !== p.id))} className="absolute -top-2 -right-2 p-1.5 bg-slate-800 text-slate-500 rounded-full hover:text-red-500 opacity-0 group-hover:opacity-100"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" /></svg></button>}
                          </div>
                        ))}
                      </div>
                      <button onClick={handleGenerateImage} className="w-full py-6 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 bg-[length:200%_100%] hover:bg-right transition-all duration-500 text-white font-bold rounded-3xl shadow-2xl shadow-indigo-500/20 text-sm uppercase tracking-[0.2em]">이미지 생성 시작</button>
                    </div>
                  ) : (
                    <div className="space-y-8 animate-in fade-in zoom-in-95">
                      <div className="grid grid-cols-3 gap-4 bg-slate-950/50 p-4 rounded-3xl border border-slate-800">
                        <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500">영상 비율</label><select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as AspectRatio)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-2 text-xs text-white"><option value="16:9">16:9</option><option value="9:16">9:16</option></select></div>
                        <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500">영상 화질</label><select value={videoQuality} onChange={(e) => setVideoQuality(e.target.value as VideoQuality)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-2 text-xs text-white"><option value="1080p">1080p (Pro)</option><option value="720p">720p</option></select></div>
                        <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500">영상 모델</label><select value={videoModel} onChange={(e) => setVideoModel(e.target.value as VideoModel)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-2 text-xs text-white"><option value="veo-3.1-fast-generate-preview">Veo Fast</option><option value="veo-3.1-generate-preview">Veo Pro</option></select></div>
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <label className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest flex justify-between"><span>시작 프레임</span></label>
                          <div 
                            tabIndex={0}
                            onPaste={(e) => handlePasteImage(e, 'START')}
                            className="aspect-video bg-slate-950 border border-dashed border-slate-800 rounded-3xl overflow-hidden relative group flex-shrink-0 w-full min-h-[112px] focus:ring-2 focus:ring-indigo-500 outline-none"
                          >
                            {imagePreviewStart ? <><img src={imagePreviewStart} className="w-full h-full object-cover" /><button onClick={() => setImagePreviewStart(null)} className="absolute top-3 right-3 p-2 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" /></svg></button></> : <div onClick={() => startFileInputRef.current?.click()} className="w-full h-full flex flex-col items-center justify-center cursor-pointer text-slate-700 text-xs font-bold uppercase space-y-1"><span>이미지 업로드</span><span className="text-[8px] font-medium opacity-50">(클릭 또는 Ctrl+V)</span></div>}
                          </div>
                        </div>
                        <div className="space-y-3">
                          <label className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest flex justify-between"><span>종료 프레임</span></label>
                          <div 
                            tabIndex={0}
                            onPaste={(e) => handlePasteImage(e, 'END')}
                            className="aspect-video bg-slate-950 border border-dashed border-slate-800 rounded-3xl overflow-hidden relative group flex-shrink-0 w-full min-h-[112px] focus:ring-2 focus:ring-indigo-500 outline-none"
                          >
                            {imagePreviewEnd ? <><img src={imagePreviewEnd} className="w-full h-full object-cover" /><button onClick={() => setImagePreviewEnd(null)} className="absolute top-3 right-3 p-2 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" /></svg></button></> : <div onClick={() => endFileInputRef.current?.click()} className="w-full h-full flex flex-col items-center justify-center cursor-pointer text-slate-700 text-xs font-bold uppercase space-y-1"><span>이미지 업로드</span><span className="text-[8px] font-medium opacity-50">(클릭 또는 Ctrl+V)</span></div>}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between"><h3 className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest">동작 프롬프트</h3><button onClick={() => setVideoPrompts([...videoPrompts, { id: crypto.randomUUID(), text: '' }])} className="text-[10px] text-white bg-slate-800 px-3 py-1 rounded-lg">동작 추가</button></div>
                        {videoPrompts.map((p, idx) => (
                          <div key={p.id} className="bg-slate-950/40 p-5 rounded-[32px] border border-slate-800 relative group">
                            <textarea value={p.text} onChange={(e) => setVideoPrompts(videoPrompts.map(vp => vp.id === p.id ? { ...vp, text: e.target.value } : vp))} placeholder="카메라 워킹, 인물의 움직임 등을 상세히 설명하세요..." className="w-full bg-transparent border-none text-sm text-white resize-none h-24 focus:ring-0 leading-relaxed min-w-0" />
                            {videoPrompts.length > 1 && <button onClick={() => setVideoPrompts(videoPrompts.filter(vp => vp.id !== p.id))} className="absolute -top-2 -right-2 p-1.5 bg-slate-800 text-slate-500 rounded-full hover:text-red-500 opacity-0 group-hover:opacity-100"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" /></svg></button>}
                          </div>
                        ))}
                      </div>
                      <button onClick={handleGenerateVideo} className="w-full py-6 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 bg-[length:200%_100%] hover:bg-right transition-all duration-500 text-white font-bold rounded-3xl shadow-2xl shadow-indigo-500/20 text-sm uppercase tracking-[0.2em]">영상 생성 시작</button>
                    </div>
                  )}
                </div>
                </>
             )}
          </div>
        );
      case 'LATEST':
        return latestResult && (
          <div key="LATEST" className={`bg-slate-900/80 border border-indigo-500/30 rounded-3xl p-5 shadow-2xl animate-in slide-in-from-right-4 duration-500 flex flex-col overflow-hidden transition-all ${!isCollapsed ? 'resize-y' : ''}`} style={{ height }}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">최근 완성본</span>
              <div className="flex items-center space-x-2">
                 <button onClick={() => toggleCollapse('LATEST')} className="text-slate-600 hover:text-white" title={isCollapsed ? "펼치기" : "접기"}><svg className={`w-3.5 h-3.5 ${isCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 9l-7 7-7-7" /></svg></button>
                 <button onClick={() => movePanel('LATEST', from, 'left')} className="text-slate-600 hover:text-white"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M15 19l-7-7 7-7" /></svg></button>
                 <button onClick={() => setLatestResult(null)} className="text-slate-600 hover:text-white"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
            </div>
            {!isCollapsed && (
              <>
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-black group border border-slate-800 flex-grow min-h-0">
                {latestResult.type === 'VIDEO' ? <video src={latestResult.uri} autoPlay loop muted className="w-full h-full object-contain" /> : <img src={latestResult.uri} className="w-full h-full object-contain" />}
                {renderSmartHoverMenu(latestResult)}
              </div>
              <div className="mt-4 flex flex-col space-y-2 flex-shrink-0">
                <a href={latestResult.uri} download={getDownloadFilename(latestResult.prompt, latestResult.timestamp)} className="w-full py-3 bg-white text-black font-bold rounded-xl text-[10px] uppercase tracking-widest text-center shadow-lg transition-all hover:bg-slate-200">에셋 다운로드</a>
              </div>
              </>
            )}
          </div>
        );
      case 'ARCHIVE':
        return (
          <div key="ARCHIVE" className={`bg-slate-900/50 border border-slate-800 rounded-3xl flex flex-col overflow-hidden shadow-xl relative transition-all ${!isCollapsed ? 'resize-y' : ''}`} style={{ height }}>
            {renderPanelHeader('ARCHIVE', '제작 아카이브', from, <span className="text-[9px] text-amber-500 font-bold uppercase px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full">세션 전용</span>)}
            {!isCollapsed && (
              <div className="flex-grow overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {galleryItems.length === 0 ? <div className="h-full flex flex-col items-center justify-center text-slate-700 italic text-xs space-y-2 opacity-50"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9l-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg><span>아카이브가 비어있습니다.</span></div> : (
                  galleryItems.map(item => (
                    item.isHidden ? (
                      <div key={item.id} className="bg-slate-800/20 border border-slate-800 rounded-xl p-3 flex items-center justify-between transition-all hover:bg-slate-800/40">
                        <div className="flex items-center space-x-3 overflow-hidden">
                          <div className={`w-2 h-2 rounded-full ${item.type === 'VIDEO' ? 'bg-indigo-600' : 'bg-purple-600'}`}></div>
                          <span className="text-[10px] text-slate-500 font-medium truncate italic line-clamp-1">{item.prompt || "프롬프트 없음"}</span>
                        </div>
                        <button onClick={(e) => handleToggleHide(e, item)} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 px-2 py-1 bg-indigo-500/10 rounded-lg transition-colors flex-shrink-0 ml-2">보이기</button>
                      </div>
                    ) : (
                      <div key={item.id} className="group relative aspect-video bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-lg transition-all hover:border-indigo-500 flex-shrink-0 w-full min-h-[120px]">
                        {item.type === 'VIDEO' ? <video src={item.uri} muted className="w-full h-full object-cover" /> : <img src={item.uri} className="w-full h-full object-cover" />}
                        <div className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-bold text-white z-10 shadow-lg ${item.type === 'VIDEO' ? 'bg-indigo-600' : 'bg-purple-600'}`}>{item.type === 'VIDEO' ? '영상' : '이미지'}</div>
                        {renderSmartHoverMenu(item)}
                      </div>
                    )
                  ))
                )}
              </div>
            )}
          </div>
        );
      default: return null;
    }
  };

  return (
    <ApiKeyGuard>
      <div className="min-h-screen relative overflow-hidden bg-slate-950 text-slate-200 flex flex-col">
        <div className="fixed top-0 left-0 w-full h-1 z-[300] bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600"></div>
        
        <div className="w-full bg-red-600/90 py-2 px-6 text-center text-white text-[10px] font-bold z-[200] flex items-center justify-center space-x-2">
           <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
           <span>새로고침 시 모든 결과물이 삭제됩니다. 중요한 작업물은 즉시 다운로드하세요.</span>
        </div>

        <main className="flex-grow max-w-[1920px] w-full mx-auto p-4 md:p-6 flex flex-col lg:flex-row gap-0 overflow-hidden relative">
          
          <section className="flex flex-col space-y-4 h-full overflow-hidden flex-shrink-0" style={{ width: `${layout.leftWidth}%`, display: layout.leftWidth > 0 ? 'flex' : 'none' }}>
             {layout.left.map(id => renderPanelContent(id, 'left'))}
          </section>

          <div onMouseDown={(e) => startResizing(e, 'COLUMN_LEFT')} className="hidden lg:flex w-6 cursor-col-resize group items-center justify-center h-full z-30 flex-shrink-0">
            <div className="w-1 h-20 bg-slate-800 rounded-full group-hover:bg-indigo-500 transition-colors"></div>
          </div>

          <section className="flex-grow flex flex-col space-y-4 h-full min-w-0">
             {layout.center.map(id => renderPanelContent(id, 'center'))}
          </section>

          <div onMouseDown={(e) => startResizing(e, 'COLUMN_RIGHT')} className="hidden lg:flex w-6 cursor-col-resize group items-center justify-center h-full z-30 flex-shrink-0">
            <div className="w-1 h-20 bg-slate-800 rounded-full group-hover:bg-indigo-500 transition-colors"></div>
          </div>

          <section className="flex flex-col space-y-4 h-full overflow-hidden flex-shrink-0" style={{ width: `${layout.rightWidth}%`, display: layout.rightWidth > 0 ? 'flex' : 'none' }}>
             {layout.right.map(id => renderPanelContent(id, 'right'))}
          </section>
        </main>

        {showHelp && (
          <div className="fixed inset-0 z-[600] bg-slate-950/95 backdrop-blur-2xl p-6 flex items-center justify-center animate-in fade-in duration-300" onClick={() => setShowHelp(false)}>
             <div className="w-full max-w-5xl bg-slate-900 border border-slate-700 rounded-[40px] shadow-5xl overflow-hidden flex flex-col max-h-[95vh]" onClick={(e) => e.stopPropagation()}>
                <div className="p-8 border-b border-slate-800 flex items-center justify-between bg-slate-900/80 sticky top-0 z-10">
                   <h2 className="text-2xl font-bold text-white flex items-center space-x-3">
                      <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <span>Sandara AI Studio 통합 가이드 (v1.5.0)</span>
                   </h2>
                   <button onClick={() => setShowHelp(false)} className="p-2 hover:bg-slate-800 rounded-full text-slate-500 hover:text-white transition-all"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
                <div className="flex-grow overflow-y-auto p-8 space-y-12 custom-scrollbar">
                   
                   <section className="space-y-4">
                      <h3 className="text-xl font-black text-indigo-400 border-l-4 border-indigo-500 pl-4">1. 전략 메모장 (Strategy Notepad)</h3>
                      <p className="text-sm text-slate-300 leading-relaxed">
                        창의적인 아이디어와 광고 전략을 기록하는 독립된 공간입니다. 
                        <strong>시나리오 구성, 핵심 키워드 조합, 프로젝트 기획안</strong> 등을 미리 작성해두고 생성 시 복사하여 사용할 수 있습니다. 
                        브라우저 로컬 저장소에 실시간 저장되어, 작업 도중 페이지를 새로고침해도 내용이 유지됩니다.
                      </p>
                   </section>

                   <section className="space-y-4">
                      <h3 className="text-xl font-black text-indigo-400 border-l-4 border-indigo-500 pl-4">2. 에셋 라이브러리 (Asset Library)</h3>
                      <p className="text-sm text-slate-300 leading-relaxed">
                        검증된 전문가 키워드 데이터베이스입니다. <strong>인종, 성별, 연령대, 의상, 카메라 앵글, 지역별 배경, 날씨</strong> 등 16개 이상의 세부 카테고리를 제공합니다. 
                        태그 버튼을 클릭하면 현재 활성화된 생성기의 프롬프트 입력창 끝에 키워드가 즉시 추가되어 문장 구성을 돕습니다.
                      </p>
                   </section>

                   <section className="space-y-4">
                      <h3 className="text-xl font-black text-indigo-400 border-l-4 border-indigo-500 pl-4">3. 고화질 이미지 생성 (Nano Banana Series)</h3>
                      <div className="bg-slate-950/40 p-6 rounded-3xl border border-slate-800 space-y-3">
                        <ul className="text-xs text-slate-400 space-y-3 leading-relaxed">
                           <li><strong className="text-white">모델 선택:</strong> Pro(고품질/대형 사이즈)와 Flash(빠른 속도) 중 선택 가능합니다.</li>
                           <li><strong className="text-white">인물 고정:</strong> 특정 인물 사진을 업로드하면, 생성되는 모든 결과물에 해당 인물의 이목구비와 특징이 일관되게 반영됩니다.</li>
                           <li><strong className="text-white">배경 참조:</strong> 특정 장소나 색감이 포함된 이미지를 참조로 넣어 전체적인 톤앤매너를 일치시킵니다.</li>
                           <li><strong className="text-white">가이드 이미지:</strong> 각 장면별 프롬프트 우측의 업로드 칸을 통해 구도와 피사체 위치를 직접 지시할 수 있습니다.</li>
                           <li><strong className="text-white">추가 요청하기:</strong> 아카이브에서 전송된 이미지를 캔버스로 삼아 내용을 변형하거나 디테일을 강화합니다.</li>
                        </ul>
                      </div>
                   </section>

                   <section className="space-y-4">
                      <h3 className="text-xl font-black text-indigo-400 border-l-4 border-indigo-500 pl-4">4. 시네마틱 영상 제작 (Veo 3.1)</h3>
                      <div className="bg-slate-950/40 p-6 rounded-3xl border border-slate-800 space-y-3">
                        <ul className="text-xs text-slate-400 space-y-3 leading-relaxed">
                           <li><strong className="text-white">시작/종료 프레임:</strong> 이미지를 직접 클릭하여 업로드하거나, 해당 칸을 클릭한 후 <strong>Ctrl+V</strong>를 눌러 클립보드 이미지를 즉시 붙여넣을 수 있습니다.</li>
                           <li><strong className="text-white">동작 프롬프트:</strong> "카메라가 천천히 줌인되며 인물이 웃는다"와 같이 구체적인 움직임을 서술하세요.</li>
                        </ul>
                      </div>
                   </section>

                   <section className="space-y-4">
                      <h3 className="text-xl font-black text-indigo-400 border-l-4 border-indigo-500 pl-4">5. 아카이브 및 스마트 호버 메뉴 (핵심 기능)</h3>
                      <p className="text-sm text-slate-300">아카이브의 결과물에 마우스를 올리면 나타나는 퀵 메뉴 가이드입니다:</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[10px]">
                         <div className="bg-slate-800/30 p-3 rounded-xl border border-slate-700/50"><span className="text-indigo-400 font-bold block mb-1">영상 시작/종료</span>이미지를 VEO 생성기의 프레임으로 즉시 전송</div>
                         <div className="bg-slate-800/30 p-3 rounded-xl border border-slate-700/50"><span className="text-purple-400 font-bold block mb-1">인물 고정/배경 참조</span>이미지의 인물이나 환경 특징을 참조로 설정</div>
                         <div className="bg-slate-800/30 p-3 rounded-xl border border-slate-700/50"><span className="text-cyan-400 font-bold block mb-1">추가 요청/가이드 이미지</span>결과물을 바탕으로 다음 세대 생성을 준비</div>
                         <div className="bg-slate-800/30 p-3 rounded-xl border border-slate-700/50"><span className="text-white font-bold block mb-1">부분 수정 (Smart Brush)</span>이미지의 특정 영역만 칠해서 내용을 변경</div>
                         <div className="bg-slate-800/30 p-3 rounded-xl border border-slate-700/50"><span className="text-emerald-400 font-bold block mb-1">다시 생성하기</span>동일한 설정값으로 즉시 재생성 시도</div>
                         <div className="bg-slate-800/30 p-3 rounded-xl border border-slate-700/50"><span className="text-yellow-400 font-bold block mb-1">프롬프트 재사용</span>생성에 사용된 텍스트를 입력창으로 복구</div>
                         <div className="bg-slate-800/30 p-3 rounded-xl border border-slate-700/50"><span className="text-slate-200 font-bold block mb-1">확대/전체화면</span>결과물을 고화질로 크게 보기</div>
                         <div className="bg-slate-800/30 p-3 rounded-xl border border-slate-700/50"><span className="text-green-400 font-bold block mb-1">다운로드</span>로컬 저장소에 에셋 파일로 저장</div>
                         <div className="bg-slate-800/30 p-3 rounded-xl border border-slate-700/50"><span className="text-pink-400 font-bold block mb-1">숨김</span>결과물을 리스트에서 아코디언 형태로 축소</div>
                      </div>
                   </section>

                   <section className="space-y-4">
                      <h3 className="text-xl font-black text-indigo-400 border-l-4 border-indigo-500 pl-4">6. 레이아웃 커스터마이징 가이드</h3>
                      <p className="text-sm text-slate-300 leading-relaxed">
                        사용자의 작업 스타일에 맞춰 화면을 최적화할 수 있습니다:
                      </p>
                      <ul className="text-xs text-slate-400 space-y-3 ml-4 leading-relaxed">
                         <li><strong className="text-white">창 접기/펼치기:</strong> 헤더의 <strong>V 아이콘</strong>을 클릭해 현재 보지 않는 창을 축소합니다.</li>
                         <li><strong className="text-white">위치 이동:</strong> 헤더의 <strong>좌/우/중앙 화살표</strong>를 클릭해 다른 열로 창을 이동하거나 순서를 바꿉니다.</li>
                         <li><strong className="text-white">너비 조절:</strong> 열 사이의 <strong>수직 바</strong>를 드래그해 각 컬럼의 가로폭을 조정합니다.</li>
                         <li><strong className="text-white">높이 조절:</strong> 창의 <strong>하단 경계선</strong>을 위아래로 드래그해 세로 크기를 자유롭게 변경합니다.</li>
                      </ul>
                   </section>

                </div>
                <div className="p-8 bg-slate-950/80 border-t border-slate-800 text-center text-[10px] text-slate-500 font-bold">
                   Powered by Gemini 3.1 & Veo 3.1 | Sandara AI Studio v1.5.0 | © 2025 Sandara AI
                </div>
             </div>
          </div>
        )}

        <div className={`fixed bottom-6 right-6 z-[120] transition-all duration-500 transform ${backgroundJobs.length > 0 ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}>
           <div className="w-80 bg-slate-900/90 backdrop-blur-2xl border border-slate-700 rounded-3xl shadow-3xl overflow-hidden flex flex-col">
              <div className="p-4 bg-gradient-to-r from-indigo-900/40 to-purple-900/40 border-b border-slate-800 flex items-center justify-between">
                 <div className="flex items-center space-x-3"><div className={`w-2.5 h-2.5 rounded-full ${backgroundJobs.some(j => j.status === 'RUNNING') ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`}></div><span className="text-[10px] font-bold text-white uppercase tracking-widest">실시간 작업 현황</span></div>
                 <span className="bg-slate-800 text-white text-[9px] px-2 py-0.5 rounded-full">{backgroundJobs.length}</span>
              </div>
              <div className="max-h-60 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                 {backgroundJobs.map(job => (
                   <div key={job.id} className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800/50 space-y-2">
                      <div className="flex items-center justify-between"><span className={`px-1.5 py-0.5 rounded-md text-[8px] font-bold text-white ${job.type === 'IMAGE' ? 'bg-purple-600' : job.type === 'VIDEO' ? 'bg-indigo-600' : 'bg-cyan-600'}`}>{job.type === 'IMAGE' ? '이미지' : job.type === 'VIDEO' ? '영상' : '편집'}</span><span className="text-[10px] text-slate-300 truncate max-w-[140px]">{job.message}</span>{job.status !== 'RUNNING' && <button onClick={() => removeJob(job.id)} className="text-slate-600 hover:text-white"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" /></svg></button></div>
                      <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden"><div className={`h-full transition-all duration-500 ${job.status === 'FAILED' ? 'bg-red-500' : 'bg-indigo-500'}`} style={{ width: `${job.progress}%` }}></div></div>
                   </div>
                 ))}
              </div>
           </div>
        </div>

        {isEditorOpen && editingItem && (
          <div className="fixed inset-0 z-[400] bg-slate-950/95 backdrop-blur-3xl p-6 flex items-center justify-center animate-in fade-in duration-300">
             <div className="w-full max-w-6xl bg-slate-900 border border-slate-800 rounded-[40px] shadow-5xl overflow-hidden flex flex-col lg:flex-row h-[90vh]">
                <div className="flex-grow p-8 bg-black flex items-center justify-center relative cursor-crosshair">
                   <canvas ref={canvasRef} onMouseDown={() => setIsDrawing(true)} onMouseUp={() => setIsDrawing(false)} onMouseMove={drawMask} onTouchStart={() => setIsDrawing(true)} onTouchEnd={() => setIsDrawing(false)} onTouchMove={drawMask} className="rounded-2xl shadow-2xl touch-none" />
                   <canvas ref={maskCanvasRef} className="hidden" />
                   <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur-md px-6 py-3 rounded-2xl border border-slate-700 flex items-center space-x-6">
                      <div className="flex flex-col"><span className="text-[10px] text-slate-500 font-bold uppercase mb-1">브러시 크기</span><input type="range" min="10" max="100" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="w-32 accent-indigo-500" /></div>
                   </div>
                </div>
                <div className="w-full lg:w-96 p-8 border-l border-slate-800 bg-slate-900 flex flex-col">
                   <div className="flex items-center justify-between mb-8"><h2 className="text-xl font-bold text-white">스마트 브러시 편집</h2><button onClick={() => setIsEditorOpen(false)} className="text-slate-500 hover:text-white"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" /></svg></button></div>
                   <div className="space-y-6 flex-grow overflow-y-auto custom-scrollbar">
                      <div className="space-y-2"><label className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">참조 이미지</label><div onClick={() => editRefFileInputRef.current?.click()} className="aspect-video bg-slate-950 border border-dashed border-slate-800 rounded-2xl flex items-center justify-center overflow-hidden cursor-pointer flex-shrink-0 w-full min-h-[120px]">{editRefImage ? <img src={`data:${editRefImage.mimeType};base64,${editRefImage.data}`} className="w-full h-full object-cover" /> : <span className="text-slate-700 text-xs">클릭하여 추가</span>}</div></div>
                      <div className="space-y-2"><label className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">편집 지침</label><textarea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} placeholder="칠해진 영역을 어떻게 바꿀까요?" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-sm text-white h-32 focus:ring-1 focus:ring-indigo-600" /></div>
                   </div>
                   <button onClick={applyEdit} className="w-full py-5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-2xl shadow-xl mt-6">스마트 편집 적용</button>
                </div>
             </div>
          </div>
        )}

        {previewItem && (
          <div className="fixed inset-0 z-[500] bg-slate-950/98 backdrop-blur-3xl flex items-center justify-center p-8 animate-in fade-in duration-300" onClick={() => setPreviewItem(null)}>
            <div className="relative max-w-full max-h-full flex flex-col items-center justify-center animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
              {previewItem.type === 'VIDEO' ? <video src={previewItem.uri} controls autoPlay loop className="max-w-full max-h-[85vh] rounded-[40px] shadow-5xl border border-white/5" /> : <img src={previewItem.uri} className="max-w-full max-h-[85vh] rounded-[40px] shadow-5xl border border-white/5 object-contain" />}
              <div className="mt-10 flex flex-col items-center space-y-4 bg-slate-900/50 p-6 rounded-3xl border border-white/10 backdrop-blur-xl max-w-2xl">
                 <div className="text-center">
                    <div className="text-[10px] text-slate-500 font-bold mb-1">{new Date(previewItem.timestamp).toLocaleString('ko-KR')} 제작</div>
                    <p className="text-slate-300 text-[11px] font-medium italic">"{previewItem.prompt}"</p>
                 </div>
                 <div className="flex items-center space-x-4">
                    <a href={previewItem.uri} download={getDownloadFilename(previewItem.prompt, previewItem.timestamp)} className="px-8 py-3 bg-white text-black rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all shadow-2xl">에셋 다운로드</a>
                    <button onClick={() => setPreviewItem(null)} className="p-3 bg-slate-800 text-white rounded-xl hover:bg-slate-700"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" /></svg></button>
                 </div>
              </div>
            </div>
          </div>
        )}

      </div>

      <input type="file" ref={startFileInputRef} className="hidden" accept="image/*" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { const res = await fileToBase64(file); setImagePreviewStart(`data:${res.mimeType};base64,${res.data}`); e.target.value = ''; } }} />
      <input type="file" ref={endFileInputRef} className="hidden" accept="image/*" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { const res = await fileToBase64(file); setImagePreviewEnd(`data:${res.mimeType};base64,${res.data}`); e.target.value = ''; } }} />
      <input type="file" ref={refFileInputRef} className="hidden" accept="image/*" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { const res = await fileToBase64(file); setCharacterAnchors([...characterAnchors, { id: crypto.randomUUID(), ...res }]); e.target.value = ''; } }} />
      <input type="file" ref={bgFileInputRef} className="hidden" accept="image/*" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { const res = await fileToBase64(file); setBackgroundRef(res); e.target.value = ''; } }} />
      <input type="file" ref={videoRefFileInputRef} className="hidden" accept="image/*" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { const res = await fileToBase64(file); setVideoRefImages(prev => prev.length < 3 ? [...prev, { id: crypto.randomUUID(), ...res }] : prev); e.target.value = ''; } }} />
      <input type="file" ref={promptRefFileInputRef} className="hidden" accept="image/*" onChange={async (e) => { const file = e.target.files?.[0]; if (file && activePromptIdRef.current) { const res = await fileToBase64(file); setImagePrompts(imagePrompts.map(p => p.id === activePromptIdRef.current ? { ...p, refImage: res } : p)); activePromptIdRef.current = null; e.target.value = ''; } }} />
      <input type="file" ref={editRefFileInputRef} className="hidden" accept="image/*" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { const res = await fileToBase64(file); setEditRefImage(res); e.target.value = ''; } }} />
    </ApiKeyGuard>
  );
};

export default App;