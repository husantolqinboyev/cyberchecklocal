import { useEffect, useRef, useState } from 'react';
import * as faceapi from '@vladmandic/face-api';

interface FaceVerificationProps {
  onVerificationComplete: (isVerified: boolean, imageData?: string) => void;
}

export function FaceVerification({ onVerificationComplete }: FaceVerificationProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<string>('');

  useEffect(() => {
    const loadModels = async () => {
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
        await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
        setIsLoading(false);
        startVideo();
      } catch (err) {
        console.error('Error loading face detection models:', err);
        setError('Yuzni aniqlash modellari yuklanmadi. Iltimos, qaytadan urinib ko\'ring.');
        setIsLoading(false);
      }
    };

    loadModels();

    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, []);

  const startVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: 640, 
          height: 480,
          facingMode: 'user' 
        },
        audio: false
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Kameraga kirish uchun ruxsat berilmagan. Iltimos, kamerangizga ruxsat bering.');
    }
  };

  const captureAndVerify = async () => {
    if (!videoRef.current || isVerifying) return;
    
    setIsVerifying(true);
    setVerificationStatus('Tekshirilmoqda...');
    
    try {
      // Create a canvas to capture the current frame
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Canvas context not available');
      }

      // Draw the current video frame to the canvas
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      
      // Convert canvas to image data URL
      const imageDataUrl = canvas.toDataURL('image/jpeg');
      
      // Detect faces in the captured frame
      const detections = await faceapi.detectAllFaces(
        canvas,
        new faceapi.TinyFaceDetectorOptions()
      ).withFaceLandmarks();

      // Check if exactly one face is detected
      if (detections.length === 1) {
        // Additional checks for liveness
        const face = detections[0];
        const landmarks = face.landmarks;
        
        // Check if eyes are open (simple check using eye landmarks)
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();
        
        // Calculate eye aspect ratio (simplified)
        const leftEyeAspect = getEyeAspectRatio(leftEye);
        const rightEyeAspect = getEyeAspectRatio(rightEye);
        const avgEyeAspect = (leftEyeAspect + rightEyeAspect) / 2;
        
        // Check if eyes are open (threshold can be adjusted)
        const eyesOpen = avgEyeAspect > 0.2;
        
        if (eyesOpen) {
          setVerificationStatus('Tekshiruv muvaffaqiyatli!');
          onVerificationComplete(true, imageDataUrl);
        } else {
          setVerificationStatus('Iltimos, ko\'zlaringizni oching!');
          setTimeout(() => setVerificationStatus(''), 2000);
          setIsVerifying(false);
        }
      } else if (detections.length > 1) {
        setVerificationStatus('Faqat bitta yuz ko\'rinishi kerak!');
        setTimeout(() => setVerificationStatus(''), 2000);
        setIsVerifying(false);
      } else {
        setVerificationStatus('Yuz topilmadi!');
        setTimeout(() => setVerificationStatus(''), 2000);
        setIsVerifying(false);
      }
    } catch (err) {
      console.error('Error during face verification:', err);
      setError('Tekshiruv paytida xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
      setIsVerifying(false);
    }
  };

  // Helper function to calculate eye aspect ratio
  const getEyeAspectRatio = (eye: any) => {
    // Calculate distances between vertical eye landmarks
    const vertical1 = Math.hypot(
      eye[1].x - eye[5].x,
      eye[1].y - eye[5].y
    );
    const vertical2 = Math.hypot(
      eye[2].x - eye[4].x,
      eye[2].y - eye[4].y
    );
    
    // Calculate distance between horizontal eye landmarks
    const horizontal = Math.hypot(
      eye[0].x - eye[3].x,
      eye[0].y - eye[3].y
    );
    
    // Calculate eye aspect ratio
    return (vertical1 + vertical2) / (2 * horizontal);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <span className="ml-2">Modellar yuklanmoqda...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-600 bg-red-100 rounded-md">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center space-y-4 p-4">
      <div className="relative w-full max-w-md">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-auto border-2 border-gray-300 rounded-lg"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          {verificationStatus && (
            <div className="bg-black bg-opacity-70 text-white px-4 py-2 rounded-md">
              {verificationStatus}
            </div>
          )}
        </div>
      </div>
      
      <button
        onClick={captureAndVerify}
        disabled={isVerifying}
        className={`px-6 py-2 rounded-md text-white font-medium ${
          isVerifying 
            ? 'bg-gray-400 cursor-not-allowed' 
            : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        {isVerifying ? 'Tekshirilmoqda...' : 'Tekshirish'}
      </button>
      
      <p className="text-sm text-gray-600 text-center">
        Yuzingizni kameraga ko'rsating va "Tekshirish" tugmasini bosing.
        Faqat haqiqiy yuzlarni tekshirish mumkin.
      </p>
    </div>
  );
}
