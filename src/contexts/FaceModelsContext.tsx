import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { loadFaceApiModels } from '../lib/faceApi';

interface FaceModelsContextType {
  modelsLoaded: boolean;
  loading: boolean;
  error: string | null;
  loadModels: () => Promise<void>;
}

const FaceModelsContext = createContext<FaceModelsContextType | undefined>(undefined);

interface FaceModelsProviderProps {
  children: ReactNode;
  autoLoad?: boolean;
}

export const FaceModelsProvider: React.FC<FaceModelsProviderProps> = ({ 
  children, 
  autoLoad = true 
}) => {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadModels = async () => {
    if (modelsLoaded || loading) return;
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('Face API modellari yuklanmoqda...');
      const success = await loadFaceApiModels();
      
      if (success) {
        setModelsLoaded(true);
        console.log('Face API modellari muvaffaqiyatli yuklandi!');
      } else {
        setError('Modellarni yuklab bo\'lmadi');
      }
    } catch (err) {
      console.error('Model yuklash xatosi:', err);
      setError(err instanceof Error ? err.message : 'Noma\'lum xatolik');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoLoad) {
      // Backgroundda yuklash - 2 soniyadan keyin boshlaymiz
      const timer = setTimeout(() => {
        loadModels();
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [autoLoad]);

  const value: FaceModelsContextType = {
    modelsLoaded,
    loading,
    error,
    loadModels,
  };

  return (
    <FaceModelsContext.Provider value={value}>
      {children}
    </FaceModelsContext.Provider>
  );
};

export const useFaceModels = () => {
  const context = useContext(FaceModelsContext);
  if (context === undefined) {
    throw new Error('useFaceModels must be used within a FaceModelsProvider');
  }
  return context;
};

// Progress ko'rsatish komponenti
export const FaceModelsLoader: React.FC = () => {
  const { loading, error, modelsLoaded } = useFaceModels();
  
  if (!loading && !error && modelsLoaded) return null;
  
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      opacity: loading ? 1 : 0,
      transition: 'opacity 0.3s ease',
      pointerEvents: loading ? 'auto' : 'none'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        textAlign: 'center',
        minWidth: '300px'
      }}>
        {loading && (
          <>
            <div style={{ marginBottom: '10px' }}>
              Yuzni tanib olish modellari yuklanmoqda...
            </div>
            <div style={{ 
              width: '100%', 
              height: '4px', 
              backgroundColor: '#e0e0e0', 
              borderRadius: '2px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: '66%',
                height: '100%',
                backgroundColor: '#007bff',
                animation: 'loading 1.5s infinite ease-in-out'
              }} />
            </div>
            <style>
              {`
                @keyframes loading {
                  0% { transform: translateX(-100%); }
                  100% { transform: translateX(200%); }
                }
              `}
            </style>
          </>
        )}
        
        {error && (
          <div style={{ color: '#dc3545', marginBottom: '10px' }}>
            Xatolik: {error}
          </div>
        )}
        
        {modelsLoaded && (
          <div style={{ color: '#28a745' }}>
            ✅ Modellar yuklandi!
          </div>
        )}
      </div>
    </div>
  );
};