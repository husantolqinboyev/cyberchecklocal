import { useState } from 'react';

export function useFaceVerification() {
  const [isVerified, setIsVerified] = useState(false);
  const [verificationImage, setVerificationImage] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleVerificationComplete = (verified: boolean, imageData?: string) => {
    setIsVerified(verified);
    if (verified && imageData) {
      setVerificationImage(imageData);
    }
    setIsModalOpen(false);
  };

  const resetVerification = () => {
    setIsVerified(false);
    setVerificationImage(null);
  };

  return {
    isVerified,
    verificationImage,
    isModalOpen,
    openVerification: () => setIsModalOpen(true),
    closeVerification: () => setIsModalOpen(false),
    handleVerificationComplete,
    resetVerification,
  };
}
