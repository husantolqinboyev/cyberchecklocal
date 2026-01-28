import * as faceapi from '@vladmandic/face-api';

const MODEL_URL = '/models';
const CACHE_NAME = 'face-api-models-v1';

const MODEL_FILES = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
];

let modelsLoaded = false;

// Pre-cache models using Cache API (similar to IndexedDB but for files)
async function preCacheModels(): Promise<void> {
  if (!('caches' in window)) return;

  try {
    const cache = await caches.open(CACHE_NAME);
    
    // Check if files are already cached
    const cachedRequests = await cache.keys();
    if (cachedRequests.length >= MODEL_FILES.length) {
      console.log('Modellar keshdan topildi.');
      return;
    }

    console.log('Modellarni keshga yuklash boshlandi...');
    await cache.addAll(MODEL_FILES.map(file => `${MODEL_URL}/${file}`));
    console.log('Modellar muvaffaqiyatli keshlandi.');
  } catch (error) {
    console.warn('Keshga yuklashda xatolik (lekin davom etaveradi):', error);
  }
}

export const loadFaceApiModels = async (): Promise<boolean> => {
  if (modelsLoaded) return true;
  
  try {
    // Backgroundda keshga yuklashni boshlaymiz
    await preCacheModels();

    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
    return true;
  } catch (error) {
    console.error('Face API models loading error:', error);
    return false;
  }
};

export const detectFace = async (
  video: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): Promise<faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>> | null> => {
  try {
    const detection = await faceapi
      .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptor();
    
    return detection || null;
  } catch (error) {
    console.error('Face detection error:', error);
    return null;
  }
};

export const getFaceEmbedding = async (
  video: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): Promise<number[] | null> => {
  const detection = await detectFace(video);
  
  if (!detection) {
    return null;
  }
  
  // Convert Float32Array to regular array for JSON storage
  return Array.from(detection.descriptor);
};

export const compareFaceEmbeddings = (
  embedding1: number[],
  embedding2: number[]
): { match: boolean; distance: number } => {
  if (embedding1.length !== 128 || embedding2.length !== 128) {
    return { match: false, distance: 1 };
  }
  
  // Calculate Euclidean distance
  let sum = 0;
  for (let i = 0; i < 128; i++) {
    sum += Math.pow(embedding1[i] - embedding2[i], 2);
  }
  const distance = Math.sqrt(sum);
  
  // Threshold for face match (0.6 is standard, lower is stricter)
  const threshold = 0.5;
  
  return {
    match: distance < threshold,
    distance: parseFloat(distance.toFixed(4)),
  };
};

// Liveness detection - check for natural movement
export const checkLiveness = async (
  video: HTMLVideoElement,
  previousDetection: faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>> | null
): Promise<{ isLive: boolean; reason?: string }> => {
  const currentDetection = await detectFace(video);
  
  if (!currentDetection) {
    return { isLive: false, reason: 'Yuz aniqlanmadi' };
  }
  
  // Check if face is too small (might be a photo from distance)
  const box = currentDetection.detection.box;
  if (box.width < 100 || box.height < 100) {
    return { isLive: false, reason: 'Yuzingizni kameraga yaqinroq olib keling' };
  }
  
  // Check face detection confidence
  if (currentDetection.detection.score < 0.8) {
    return { isLive: false, reason: 'Yuz aniq ko\'rinmayapti' };
  }
  
  // If we have previous detection, check for natural micro-movements
  if (previousDetection) {
    const prevLandmarks = previousDetection.landmarks.positions;
    const currLandmarks = currentDetection.landmarks.positions;
    
    // Calculate average movement of facial landmarks
    let totalMovement = 0;
    for (let i = 0; i < prevLandmarks.length; i++) {
      const dx = currLandmarks[i].x - prevLandmarks[i].x;
      const dy = currLandmarks[i].y - prevLandmarks[i].y;
      totalMovement += Math.sqrt(dx * dx + dy * dy);
    }
    const avgMovement = totalMovement / prevLandmarks.length;
    
    // Real faces have micro-movements, photos don't
    if (avgMovement < 0.1) {
      return { isLive: false, reason: 'Harakatlanmayapsiz - boshingizni biroz qimirlatib turing' };
    }
  }
  
  return { isLive: true };
};
