
export type AspectRatio = '16:9' | '9:16' | '1:1' | '3:4' | '4:3' | '21:9' | '9:21';
export type AppMode = 'UPLOAD' | 'GENERATE' | 'AD_EXPERT';

export type VideoModel = 'veo-3.1-fast-generate-preview' | 'veo-3.1-generate-preview';
export type ImageModel = 'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview';

export type ImageQuality = '1K' | '2K' | '4K';
export type VideoQuality = '720p' | '1080p';

export interface VideoGenerationParams {
  prompt?: string;
  imageBytes: string;
  mimeType: string;
  lastFrameBytes?: string;
  lastFrameMimeType?: string;
  referenceImages?: { data: string; mimeType: string }[];
  aspectRatio: AspectRatio;
  model: VideoModel;
  resolution: VideoQuality;
}

export interface PendingOperation {
  id: string; // Job ID
  operationName: string; // From Gemini API
  type: 'VIDEO';
  params: any;
  timestamp: number;
}

export enum AppStatus {
  IDLE = 'IDLE',
  GENERATING_IMAGE = 'GENERATING_IMAGE',
  GENERATING_VIDEO = 'GENERATING_VIDEO',
  CHATTING = 'CHATTING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export interface VideoResult {
  id: string;
  uri: string;
  timestamp: number;
  prompt?: string;
  aspectRatio: AspectRatio;
}

// Window interface augmentation for AI Studio SDK
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}
