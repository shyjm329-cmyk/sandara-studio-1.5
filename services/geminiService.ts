
import { GoogleGenAI, VideoGenerationReferenceType, GenerateContentResponse } from "@google/genai";
import { VideoGenerationParams, AspectRatio, VideoModel, ImageModel, ImageQuality, VideoQuality } from "../types";

/**
 * 이미지 생성 및 편집 서비스
 */
export const generateNanoImage = async (
  prompt: string,
  aspectRatio: AspectRatio,
  model: ImageModel,
  quality: ImageQuality,
  referenceImages?: { data: string; mimeType: string }[],
  isCharacterLocked?: boolean,
  backgroundRef?: { data: string; mimeType: string } | null,
  promptRefImage?: { data: string; mimeType: string } | null,
  baseIterationImage?: { data: string; mimeType: string } | null,
  maskImage?: { data: string; mimeType: string } | null
): Promise<{ base64: string; mimeType: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const parts: any[] = [];

  if (baseIterationImage) {
    if (maskImage) {
      parts.push({ text: "TASK: IMAGE EDITING (INPAINTING)" });
      parts.push({ text: "[ORIGINAL IMAGE TO MODIFY]" });
      parts.push({ inlineData: { data: baseIterationImage.data, mimeType: baseIterationImage.mimeType } });
      parts.push({ text: "[MASK IMAGE] The white pixels in this mask indicate the area that MUST be replaced or added to. The black pixels MUST remain unchanged." });
      parts.push({ inlineData: { data: maskImage.data, mimeType: maskImage.mimeType } });
    } else {
      parts.push({ text: "TASK: IMAGE VARIATION / EVOLUTION" });
      parts.push({ text: "[BASE CANVAS] Create a new image heavily inspired by this one." });
      parts.push({ inlineData: { data: baseIterationImage.data, mimeType: baseIterationImage.mimeType } });
    }
  }
  
  if (promptRefImage) {
    parts.push({ text: "[COMPOSITION REFERENCE] Match the layout and composition of this image." });
    parts.push({ inlineData: { data: promptRefImage.data, mimeType: promptRefImage.mimeType } });
  }

  if (backgroundRef) {
    parts.push({ text: "[ENVIRONMENT REFERENCE] Use the background/lighting/atmosphere from this image." });
    parts.push({ inlineData: { data: backgroundRef.data, mimeType: backgroundRef.mimeType } });
  }

  if (referenceImages && referenceImages.length > 0) {
    referenceImages.forEach((img, index) => {
      parts.push({ text: `[SUBJECT IDENTITY #${index + 1}] Maintain the visual identity of this person/object.` });
      parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
    });
  }
  
  parts.push({ 
    text: `SCENE TO GENERATE: ${prompt}\n\nPlease generate a highly detailed, professional cinematic result.` 
  });
  
  const config: any = { imageConfig: { aspectRatio: aspectRatio } };
  if (model === 'gemini-3-pro-image-preview') config.imageConfig.imageSize = quality;
  
  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: model,
      contents: { parts: parts },
      config: config
    });

    if (!response.candidates?.[0]?.content?.parts) throw new Error("이미지 생성 결과가 없습니다.");

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) return { base64: part.inlineData.data, mimeType: part.inlineData.mimeType };
    }
    throw new Error("결과물에서 이미지 데이터를 찾을 수 없습니다.");
  } catch (error: any) {
    if (error?.message?.includes("Requested entity was not found") || error?.message?.includes("404")) throw new Error("API_KEY_EXPIRED");
    throw error;
  }
};

/**
 * Veo 영상 생성 서비스
 */
export const generateVeoVideo = async (
  params: VideoGenerationParams,
  onProgress: (status: string) => void,
  existingOperationName?: string,
  onOperationStarted?: (name: string) => void
): Promise<{ url: string; blob: Blob }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    let operation;

    if (existingOperationName) {
      onProgress(`이전 작업 복구 중...`);
      operation = { name: existingOperationName, done: false };
    } else {
      onProgress(`영상 생성 요청 중...`);
      
      // 모델별 제약 조건 적용
      let finalResolution = params.resolution;
      let finalAspectRatio = params.aspectRatio;
      
      // Veo Pro 모델에서 참조 이미지를 사용할 경우의 강제 제약 조건
      if (params.model === 'veo-3.1-generate-preview' && params.referenceImages && params.referenceImages.length > 0) {
        finalResolution = '720p';
        finalAspectRatio = '16:9';
      }

      const videoConfig: any = {
        numberOfVideos: 1,
        resolution: finalResolution,
        aspectRatio: finalAspectRatio,
      };

      if (params.lastFrameBytes && params.lastFrameMimeType) {
        videoConfig.lastFrame = { imageBytes: params.lastFrameBytes, mimeType: params.lastFrameMimeType };
      }

      if (params.referenceImages && params.referenceImages.length > 0) {
        videoConfig.referenceImages = params.referenceImages.map(img => ({
          image: { imageBytes: img.data, mimeType: img.mimeType },
          referenceType: VideoGenerationReferenceType.ASSET,
        }));
      }

      operation = await ai.models.generateVideos({
        model: params.model,
        prompt: params.prompt || 'Create a smooth cinematic video with natural motion',
        image: { imageBytes: params.imageBytes, mimeType: params.mimeType },
        config: videoConfig
      });
      
      if (onOperationStarted) onOperationStarted(operation.name);
    }

    const progressMessages = [
      "장면 구성 분석 중...", "객체 움직임 계산 중...", "AI 렌더링 진행 중...", "최종 인코딩 중..."
    ];
    let msgIdx = 0;

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      onProgress(progressMessages[msgIdx % progressMessages.length]);
      msgIdx++;
      
      try {
        operation = await ai.operations.getVideosOperation({ operation: operation });
      } catch (pollError: any) { 
        console.warn("Polling error, retrying...", pollError);
        continue; 
      }
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("결과 영상의 다운로드 링크를 찾을 수 없습니다.");

    const finalUrl = `${downloadLink}${downloadLink.includes('?') ? '&' : '?'}key=${process.env.API_KEY}`;
    const videoResponse = await fetch(finalUrl);
    
    if (videoResponse.ok) {
      const videoBlob = await videoResponse.blob();
      return { url: URL.createObjectURL(videoBlob), blob: videoBlob };
    }

    throw new Error(`영상 파일 다운로드 실패`);
  } catch (error: any) {
    if (error?.message?.includes("Requested entity was not found") || error?.message?.includes("404")) throw new Error("API_KEY_EXPIRED");
    throw error;
  }
};
