import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { StudentLayout } from "@/components/layouts/StudentLayout";
import { getCurrentLocation, calculateDistance, detectFakeGPS } from "@/lib/geolocation";
import { getFingerprint, isMobileDevice, isAllowedBrowser } from "@/lib/auth";
import { FaceCapture } from "@/components/FaceCapture";
import {
  Loader2,
  MapPin,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Smartphone,
  ScanFace,
} from "lucide-react";

type CheckinStep = 'pin' | 'face' | 'result';

interface LessonData {
  id: string;
  latitude: number;
  longitude: number;
  radius_meters: number | null;
  pin_expires_at: string;
}

interface CheckResult {
  success: boolean;
  message: string;
  status?: string;
}

const StudentCheckin = () => {
  const { user } = useAuth();
  const [pin, setPin] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [isMobile, setIsMobile] = useState(true);
  const [step, setStep] = useState<CheckinStep>('pin');
  const [lessonData, setLessonData] = useState<LessonData | null>(null);
  const [locationData, setLocationData] = useState<{
    latitude: number;
    longitude: number;
    distance: number;
    fakeCheck: { isFake: boolean; reasons: string[] };
  } | null>(null);
  const [userFaceEmbedding, setUserFaceEmbedding] = useState<number[] | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const mobile = isMobileDevice();
    const allowed = isAllowedBrowser("student");
    setIsMobile(mobile && allowed);

    // Fetch user's face embedding
    const fetchFaceEmbedding = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from("users")
        .select("face_embedding")
        .eq("id", user.id)
        .single();
      
      if (data?.face_embedding) {
        setUserFaceEmbedding(data.face_embedding as number[]);
      }
    };

    fetchFaceEmbedding();
  }, [user]);

  const handlePinChange = (value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 6);
    setPin(cleaned);

    if (cleaned.length === 6) {
      handlePinSubmit(cleaned);
    }
  };

  const handlePinSubmit = async (pinCode: string) => {
    if (!user || pinCode.length !== 6) return;

    setIsChecking(true);
    setCheckResult(null);

    try {
      if (!isMobileDevice()) {
        setCheckResult({
          success: false,
          message: "Faqat mobil qurilmadan foydalaning!",
        });
        setStep('result');
        return;
      }

      // Find active lesson with this PIN
      const { data: lesson, error: lessonError } = await supabase
        .from("lessons")
        .select("id, latitude, longitude, radius_meters, pin_expires_at")
        .eq("pin_code", pinCode)
        .eq("is_active", true)
        .gte("pin_expires_at", new Date().toISOString())
        .maybeSingle();

      if (lessonError || !lesson) {
        setCheckResult({
          success: false,
          message: "PIN kod noto'g'ri yoki muddati o'tgan",
        });
        setStep('result');
        setIsChecking(false);
        return;
      }

      setLessonData(lesson);

      // Get radius from lesson (teacher-configured)
      const radiusMeters = lesson.radius_meters || 120;

      // Check for fake GPS
      const fakeCheck = await detectFakeGPS();

      // Get current location
      let location;
      try {
        location = await getCurrentLocation();
      } catch (error) {
        setCheckResult({
          success: false,
          message: error instanceof Error ? error.message : "GPS xatosi",
        });
        setStep('result');
        setIsChecking(false);
        return;
      }

      // Calculate distance
      const distance = calculateDistance(
        location.latitude,
        location.longitude,
        lesson.latitude,
        lesson.longitude
      );

      setLocationData({
        latitude: location.latitude,
        longitude: location.longitude,
        distance,
        fakeCheck,
      });

      // Check if user has face embedding - if yes, require face verification
      if (userFaceEmbedding) {
        setStep('face');
        setIsChecking(false);
      } else {
        // No face ID registered - mark as suspicious and don't allow attendance
        setCheckResult({
          success: false,
          message: "Face ID ro'yxatdan o'tmagan. Admin bilan bog'laning.",
          status: "suspicious",
        });
        setStep('result');
        
        // Log this attempt as suspicious
        await supabase.from("activity_logs").insert({
          user_id: user.id,
          action: "checkin_failed",
          details: {
            lesson_id: lesson.id,
            reason: "no_face_id",
            distance,
          },
          user_agent: navigator.userAgent,
        });
        
        setIsChecking(false);
      }
    } catch (error) {
      setCheckResult({
        success: false,
        message: "Tizim xatosi yuz berdi",
      });
      setStep('result');
    } finally {
      setIsChecking(false);
    }
  };

  const handleFaceVerified = async () => {
    if (!lessonData || !locationData) return;

    setIsChecking(true);
    const radiusMeters = lessonData.radius_meters || 120;

    await completeCheckin(
      lessonData,
      { latitude: locationData.latitude, longitude: locationData.longitude },
      locationData.distance,
      locationData.fakeCheck,
      radiusMeters,
      true // Face verified successfully
    );
  };

  const handleFaceFailed = async () => {
    if (!lessonData || !locationData || !user) return;

    // Face verification failed - mark as suspicious
    setCheckResult({
      success: false,
      message: "Yuz tasdiqlanmadi. Shubhali holat qayd etildi.",
      status: "suspicious",
    });
    setStep('result');

    // Log as suspicious attendance
    await supabase.from("attendance").upsert({
      lesson_id: lessonData.id,
      student_id: user.id,
      status: "suspicious",
      check_in_time: new Date().toISOString(),
      latitude: locationData.latitude,
      longitude: locationData.longitude,
      distance_meters: locationData.distance,
      is_fake_gps: locationData.fakeCheck.isFake,
      suspicious_reason: "Face ID tasdiqlanmadi",
      fingerprint: await getFingerprint(),
      user_agent: navigator.userAgent,
    }, { onConflict: "lesson_id,student_id" });

    // Log activity
    await supabase.from("activity_logs").insert({
      user_id: user.id,
      action: "checkin_suspicious",
      details: {
        lesson_id: lessonData.id,
        reason: "face_verification_failed",
        distance: locationData.distance,
      },
      user_agent: navigator.userAgent,
    });
  };

  const completeCheckin = async (
    lesson: LessonData,
    location: { latitude: number; longitude: number },
    distance: number,
    fakeCheck: { isFake: boolean; reasons: string[] },
    radiusMeters: number,
    faceVerified: boolean
  ) => {
    if (!user) return;

    try {
      const isWithinRadius = distance <= radiusMeters;
      const fingerprint = await getFingerprint();

      // If GPS is fake or outside radius - don't mark attendance at all
      if (fakeCheck.isFake || !isWithinRadius) {
        const reason = fakeCheck.isFake 
          ? `Soxta GPS aniqlandi: ${fakeCheck.reasons.join(", ")}`
          : `Darsdan ${Math.round(distance)}m uzoqda (ruxsat: ${radiusMeters}m)`;

        setCheckResult({
          success: false,
          message: reason,
          status: "rejected",
        });

        // Log the rejected attempt but don't create attendance record
        await supabase.from("activity_logs").insert({
          user_id: user.id,
          action: "checkin_rejected",
          details: {
            lesson_id: lesson.id,
            distance,
            radius: radiusMeters,
            is_fake_gps: fakeCheck.isFake,
            fake_reasons: fakeCheck.reasons,
            face_verified: faceVerified,
          },
          user_agent: navigator.userAgent,
        });

        setStep('result');
        setPin("");
        setIsChecking(false);
        return;
      }

      // All checks passed - mark as present
      const { data: existingRecord } = await supabase
        .from("attendance")
        .select("id")
        .eq("lesson_id", lesson.id)
        .eq("student_id", user.id)
        .maybeSingle();

      const attendanceData = {
        lesson_id: lesson.id,
        student_id: user.id,
        status: "present" as const,
        check_in_time: new Date().toISOString(),
        latitude: location.latitude,
        longitude: location.longitude,
        distance_meters: distance,
        is_fake_gps: false,
        suspicious_reason: null,
        fingerprint,
        user_agent: navigator.userAgent,
      };

      if (existingRecord) {
        await supabase
          .from("attendance")
          .update(attendanceData)
          .eq("id", existingRecord.id);
      } else {
        await supabase.from("attendance").insert(attendanceData);
      }

      // Log activity
      await supabase.from("activity_logs").insert({
        user_id: user.id,
        action: "checkin_success",
        details: {
          lesson_id: lesson.id,
          distance,
          radius: radiusMeters,
          face_verified: faceVerified,
        },
        user_agent: navigator.userAgent,
      });

      setCheckResult({
        success: true,
        message: `Davomat muvaffaqiyatli qayd etildi! (${Math.round(distance)}m)`,
        status: "present",
      });

      setStep('result');
      setPin("");
    } catch (error) {
      setCheckResult({
        success: false,
        message: "Tizim xatosi yuz berdi",
      });
      setStep('result');
    } finally {
      setIsChecking(false);
    }
  };

  const handleRetry = () => {
    setCheckResult(null);
    setStep('pin');
    setPin("");
    setLessonData(null);
    setLocationData(null);
  };

  if (!isMobile) {
    return (
      <StudentLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
            <Smartphone className="w-10 h-10 text-destructive" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">
            Faqat mobil brauzer!
          </h2>
          <p className="text-muted-foreground max-w-xs">
            CyberCheck talabalari faqat mobil qurilmadagi Chrome yoki Safari brauzeridan
            foydalanishlari mumkin.
          </p>
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        {/* PIN Entry Step */}
        {step === 'pin' && (
          <div className="w-full max-w-xs text-center">
            <div className="w-16 h-16 rounded-2xl gradient-cyber flex items-center justify-center mx-auto mb-6">
              <MapPin className="w-8 h-8 text-primary-foreground" />
            </div>

            <h2 className="text-xl font-bold text-foreground mb-2">PIN kodni kiriting</h2>
            <p className="text-muted-foreground text-sm mb-6">
              O'qituvchi bergan 6 xonali kodni kiriting
            </p>

            <div className="relative mb-6">
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pin}
                onChange={(e) => handlePinChange(e.target.value)}
                className="h-16 text-center font-mono text-3xl tracking-[0.5em] pl-6"
                placeholder="______"
                maxLength={6}
                disabled={isChecking}
                autoFocus
              />
            </div>

            {isChecking && (
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Tekshirilmoqda...</span>
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-6">
              <MapPin className="w-3 h-3 inline mr-1" />
              GPS joylashuvingiz tekshiriladi
              <br />
              <ScanFace className="w-3 h-3 inline mr-1 mt-1" />
              Face ID tekshiruvi majburiy
            </p>
          </div>
        )}

        {/* Face Verification Step */}
        {step === 'face' && (
          <div className="w-full max-w-md text-center">
            <div className="w-16 h-16 rounded-2xl gradient-cyber flex items-center justify-center mx-auto mb-6">
              <ScanFace className="w-8 h-8 text-primary-foreground" />
            </div>

            <h2 className="text-xl font-bold text-foreground mb-2">Yuzni tasdiqlang</h2>
            <p className="text-muted-foreground text-sm mb-6">
              Davomat uchun yuzingizni kameraga qarating
            </p>

            <FaceCapture
              mode="verify"
              existingEmbedding={userFaceEmbedding}
              onCapture={handleFaceVerified}
              onCancel={handleRetry}
              onVerificationFailed={handleFaceFailed}
            />
          </div>
        )}

        {/* Result Step */}
        {step === 'result' && checkResult && (
          <div className="text-center fade-in">
            <div
              className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 mx-auto ${
                checkResult.success
                  ? "bg-success/10"
                  : checkResult.status === "suspicious"
                  ? "bg-suspicious/10"
                  : "bg-destructive/10"
              }`}
            >
              {checkResult.success ? (
                <CheckCircle className="w-12 h-12 text-success" />
              ) : checkResult.status === "suspicious" ? (
                <AlertTriangle className="w-12 h-12 text-suspicious" />
              ) : (
                <XCircle className="w-12 h-12 text-destructive" />
              )}
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">
              {checkResult.success ? "Muvaffaqiyat!" : "Diqqat!"}
            </h2>
            <p className="text-muted-foreground mb-6">{checkResult.message}</p>
            <Button onClick={handleRetry}>Qayta urinish</Button>
          </div>
        )}
      </div>
    </StudentLayout>
  );
};

export default StudentCheckin;
