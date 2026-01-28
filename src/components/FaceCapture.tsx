import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  loadFaceApiModels,
  detectFace,
  getFaceEmbedding,
  checkLiveness,
} from '@/lib/faceApi';
import {
  Camera,
  Loader2,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  User,
  X,
} from 'lucide-react';
import * as faceapi from '@vladmandic/face-api';

interface FaceCaptureProps {
  onCapture: (embedding: number[]) => void;
  onCancel?: () => void;
  onVerificationFailed?: () => void;
  mode: 'register' | 'verify';
  existingEmbedding?: number[] | null;
}

export const FaceCapture = ({
  onCapture,
  onCancel,
  onVerificationFailed,
  mode,
  existingEmbedding,
}: FaceCaptureProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previousDetectionRef = useRef<faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>> | null>(null);
  const livenessCheckCountRef = useRef(0);

  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<'loading' | 'ready' | 'detecting' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Modellar yuklanmoqda...');
  const [faceDetected, setFaceDetected] = useState(false);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      return true;
    } catch (error) {
      console.error('Camera error:', error);
      setStatus('error');
      setMessage('Kamera ochilmadi. Kamera ruxsatini tekshiring.');
      return false;
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const drawFaceOverlay = useCallback((detection: faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }> | null) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;

    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (detection) {
      const box = detection.detection.box;
      
      // Draw face rectangle
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 3;
      ctx.strokeRect(box.x, box.y, box.width, box.height);

      // Draw landmarks
      ctx.fillStyle = '#22c55e';
      detection.landmarks.positions.forEach((point) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI);
        ctx.fill();
      });
    }
  }, []);

  const processFrame = useCallback(async () => {
    if (!videoRef.current || status !== 'ready') return;

    const detection = await detectFace(videoRef.current);
    setFaceDetected(!!detection);
    drawFaceOverlay(detection);

    if (detection) {
      previousDetectionRef.current = detection;
    }
  }, [status, drawFaceOverlay]);

  const handleCapture = useCallback(async () => {
    if (!videoRef.current) return;

    setStatus('detecting');
    setMessage('Yuz tekshirilmoqda...');

    // Check liveness multiple times
    let livenessPass = 0;
    for (let i = 0; i < 3; i++) {
      const liveness = await checkLiveness(videoRef.current, previousDetectionRef.current);
      if (liveness.isLive) {
        livenessPass++;
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    if (livenessPass < 2) {
      setStatus('ready');
      setMessage('Jonli yuz aniqlanmadi. Boshingizni biroz qimirlatib qayta urinib ko\'ring.');
      return;
    }

    const embedding = await getFaceEmbedding(videoRef.current);

    if (!embedding) {
      setStatus('ready');
      setMessage('Yuz aniqlanmadi. Qayta urinib ko\'ring.');
      return;
    }

    if (mode === 'verify' && existingEmbedding) {
      // Import comparison function
      const { compareFaceEmbeddings } = await import('@/lib/faceApi');
      const result = compareFaceEmbeddings(existingEmbedding, embedding);

      if (!result.match) {
        setStatus('error');
        setMessage(`Yuz mos kelmadi (masofa: ${result.distance}). Ro'yxatdan o'tgan yuz bilan mos emas.`);
        stopCamera();
        onVerificationFailed?.();
        return;
      }
    }

    setStatus('success');
    setMessage(mode === 'register' ? 'Yuz muvaffaqiyatli ro\'yxatga olindi!' : 'Yuz muvaffaqiyatli tasdiqlandi!');
    stopCamera();
    onCapture(embedding);
  }, [mode, existingEmbedding, stopCamera, onCapture, onVerificationFailed]);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      setMessage('Face ID modellari yuklanmoqda...');

      const modelsLoaded = await loadFaceApiModels();

      if (!modelsLoaded) {
        setStatus('error');
        setMessage('Modellarni yuklashda xatolik');
        setIsLoading(false);
        return;
      }

      setMessage('Kamera ochilmoqda...');

      const cameraStarted = await startCamera();

      if (cameraStarted) {
        setStatus('ready');
        setMessage(mode === 'register' ? 'Yuzingizni kameraga qarating' : 'Yuzingizni tasdiqlash uchun kameraga qarating');
      }

      setIsLoading(false);
    };

    init();

    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera, mode]);

  // Face detection loop
  useEffect(() => {
    if (status !== 'ready') return;

    const interval = setInterval(processFrame, 100);
    return () => clearInterval(interval);
  }, [status, processFrame]);

  const handleRetry = useCallback(async () => {
    setStatus('loading');
    setMessage('Kamera qayta ochilmoqda...');
    previousDetectionRef.current = null;
    livenessCheckCountRef.current = 0;

    const cameraStarted = await startCamera();

    if (cameraStarted) {
      setStatus('ready');
      setMessage(mode === 'register' ? 'Yuzingizni kameraga qarating' : 'Yuzingizni tasdiqlash uchun kameraga qarating');
    }
  }, [startCamera, mode]);

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="relative w-full max-w-md aspect-[4/3] bg-black rounded-lg overflow-hidden">
        {(status === 'loading' || isLoading) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted">
            <Loader2 className="w-10 h-10 animate-spin text-primary mb-2" />
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-success/10">
            <CheckCircle className="w-16 h-16 text-success mb-2" />
            <p className="text-success font-medium">{message}</p>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-destructive/10 p-4">
            <AlertTriangle className="w-16 h-16 text-destructive mb-2" />
            <p className="text-destructive font-medium text-center">{message}</p>
            <Button onClick={handleRetry} variant="outline" className="mt-4">
              <RefreshCw className="w-4 h-4 mr-2" />
              Qayta urinish
            </Button>
          </div>
        )}

        <video
          ref={videoRef}
          className={`w-full h-full object-cover ${status !== 'ready' && status !== 'detecting' ? 'hidden' : ''}`}
          playsInline
          muted
        />

        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full ${status !== 'ready' && status !== 'detecting' ? 'hidden' : ''}`}
        />

        {/* Face detection indicator */}
        {(status === 'ready' || status === 'detecting') && (
          <div className={`absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full ${
            faceDetected ? 'bg-success/90' : 'bg-muted/90'
          }`}>
            <User className={`w-4 h-4 ${faceDetected ? 'text-success-foreground' : 'text-muted-foreground'}`} />
            <span className={`text-xs font-medium ${faceDetected ? 'text-success-foreground' : 'text-muted-foreground'}`}>
              {faceDetected ? 'Yuz aniqlandi' : 'Yuz qidirilmoqda...'}
            </span>
          </div>
        )}

        {status === 'detecting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="flex flex-col items-center">
              <Loader2 className="w-10 h-10 animate-spin text-white mb-2" />
              <p className="text-white text-sm">{message}</p>
            </div>
          </div>
        )}
      </div>

      <p className="text-sm text-muted-foreground text-center px-4">
        {status === 'ready' && (mode === 'register'
          ? 'Yuzingiz aniq ko\'rinishi uchun yaxshi yoritilgan joyda turing'
          : 'Davomat uchun yuzingizni tasdiqlang')}
      </p>

      <div className="flex gap-3 w-full max-w-md">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} className="flex-1">
            <X className="w-4 h-4 mr-2" />
            Bekor qilish
          </Button>
        )}

        <Button
          onClick={handleCapture}
          disabled={status !== 'ready' || !faceDetected}
          className="flex-1 gradient-primary text-primary-foreground"
        >
          <Camera className="w-4 h-4 mr-2" />
          {mode === 'register' ? 'Ro\'yxatga olish' : 'Tasdiqlash'}
        </Button>
      </div>
    </div>
  );
};
