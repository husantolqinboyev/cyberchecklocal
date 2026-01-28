import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FaceCapture } from './FaceCapture';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserCheck, Camera, Trash2 } from 'lucide-react';

interface FaceRegistrationProps {
  userId: string;
  userName: string;
  existingEmbedding?: number[] | null;
  onComplete: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const FaceRegistration = ({
  userId,
  userName,
  existingEmbedding,
  onComplete,
  open,
  onOpenChange,
}: FaceRegistrationProps) => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const handleCapture = async (embedding: number[]) => {
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('users')
        .update({ face_embedding: embedding })
        .eq('id', userId);

      if (error) throw error;

      toast({
        title: 'Muvaffaqiyat',
        description: `${userName} uchun Face ID ro'yxatga olindi`,
      });

      onComplete();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Xatolik',
        description: 'Face ID saqlashda xatolik yuz berdi',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
      setIsCapturing(false);
    }
  };

  const handleRemoveFace = async () => {
    if (!confirm(`${userName} uchun Face ID ni o'chirishni xohlaysizmi?`)) return;

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('users')
        .update({ face_embedding: null })
        .eq('id', userId);

      if (error) throw error;

      toast({
        title: 'Muvaffaqiyat',
        description: `${userName} uchun Face ID o'chirildi`,
      });

      onComplete();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Xatolik',
        description: 'Face ID o\'chirishda xatolik yuz berdi',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="w-5 h-5" />
            {userName} - Face ID
          </DialogTitle>
        </DialogHeader>

        {isSaving ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Saqlanmoqda...</p>
          </div>
        ) : isCapturing ? (
          <FaceCapture
            mode="register"
            onCapture={handleCapture}
            onCancel={() => setIsCapturing(false)}
          />
        ) : (
          <div className="space-y-4">
            {existingEmbedding ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                  <UserCheck className="w-8 h-8 text-success" />
                </div>
                <p className="font-medium text-foreground mb-1">Face ID ro'yxatga olingan</p>
                <p className="text-sm text-muted-foreground mb-6">
                  Bu talaba uchun Face ID allaqachon mavjud
                </p>

                <div className="flex gap-3 justify-center">
                  <Button variant="outline" onClick={handleRemoveFace}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    O'chirish
                  </Button>
                  <Button onClick={() => setIsCapturing(true)} className="gradient-primary text-primary-foreground">
                    <Camera className="w-4 h-4 mr-2" />
                    Yangilash
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <Camera className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="font-medium text-foreground mb-1">Face ID ro'yxatga olinmagan</p>
                <p className="text-sm text-muted-foreground mb-6">
                  Talaba yuzini ro'yxatga olish uchun kamerani oching
                </p>

                <Button onClick={() => setIsCapturing(true)} className="gradient-primary text-primary-foreground">
                  <Camera className="w-4 h-4 mr-2" />
                  Face ID ro'yxatga olish
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
