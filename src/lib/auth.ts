import DOMPurify from "dompurify";

export interface User {
  id: string;
  login: string;
  email?: string;
  full_name: string;
  role: "admin" | "teacher" | "student";
  is_active: boolean;
}

export interface Session {
  token: string;
  refresh_token?: string;
  user: User;
  expires_at: string;
}

const SESSION_KEY = "cybercheck_session";
const TOKEN_KEY = "cybercheck_token";
const REFRESH_TOKEN_KEY = "cybercheck_refresh_token";
const CSRF_TOKEN_KEY = "cybercheck_csrf_token";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Debugging
if (import.meta.env.DEV) {
  console.log("Supabase URL:", SUPABASE_URL);
}

// Secure cookie functions for enhanced security
export function setSecureCookie(name: string, value: string, days: number = 1) {
  const encodedValue = encodeURIComponent(value);
  const secureFlag = location.protocol === 'https:' ? '; Secure' : '';
  const expires = new Date(Date.now() + days * 86400000).toUTCString();
  document.cookie = `${name}=${encodedValue}; expires=${expires}; Path=/${secureFlag}; SameSite=Strict`;
}

export function getSecureCookie(name: string): string | null {
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [cookieName, cookieValue] = cookie.trim().split('=');
    if (cookieName === name && cookieValue) {
      return decodeURIComponent(cookieValue);
    }
  }
  return null;
}

// CSRF Protection
let csrfToken: string | null = null;

export function generateCSRFToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  csrfToken = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  setSecureCookie(CSRF_TOKEN_KEY, csrfToken, 1);
  return csrfToken;
}

export function getCSRFToken(): string {
  if (!csrfToken) {
    csrfToken = getSecureCookie(CSRF_TOKEN_KEY) || generateCSRFToken();
  }
  return csrfToken;
}

// Secure fetch wrapper with CSRF protection
export async function secureFetch(url: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  // Supabase auth headers
  if (SUPABASE_ANON_KEY) {
    headers['apikey'] = SUPABASE_ANON_KEY;
    headers['Authorization'] = `Bearer ${SUPABASE_ANON_KEY}`;
  }

  // Add CSRF token for non-GET requests
  if (options.method && options.method !== 'GET') {
    headers['X-XSRF-TOKEN'] = getCSRFToken();
  }

  try {
    const response = await fetch(url, { ...options, headers });
    
    // Auto-refresh token on 401
    if (response.status === 401) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        // Update authorization header with new token if it was a user session
        const session = getCurrentSession();
        if (session) {
          headers['Authorization'] = `Bearer ${session.token}`;
        }
        return fetch(url, { ...options, headers });
      }
    }
    
    return response;
  } catch (error) {
    console.error("Fetch error details:", {
      url,
      method: options.method,
      error: error instanceof Error ? error.message : error
    });
    throw error;
  }
}

// XSS Protection - Sanitize all inputs
export function sanitizeInput(input: string): string {
  if (typeof input !== "string") return "";
  return DOMPurify.sanitize(input.trim(), { ALLOWED_TAGS: [] });
}

// Generate secure random token
export function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Generate 6-digit PIN
export function generatePIN(): string {
  const array = new Uint8Array(3);
  crypto.getRandomValues(array);
  const num = ((array[0] << 16) | (array[1] << 8) | array[2]) % 1000000;
  return num.toString().padStart(6, "0");
}

// Get browser fingerprint (enhanced for device binding)
export async function getFingerprint(): Promise<string> {
  const components = [
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 0,
    navigator.maxTouchPoints || 0,
    // Additional device identifiers
    screen.pixelDepth || 0,
    (navigator as any).deviceMemory || 0,
    // Canvas fingerprint (more stable)
    await getCanvasFingerprint(),
    // Audio context fingerprint
    await getAudioFingerprint(),
  ];
  
  const data = components.join("§"); // Unique separator
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-512", encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Canvas fingerprint for more reliable device identification
async function getCanvasFingerprint(): Promise<string> {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-canvas';
    
    canvas.width = 200;
    canvas.height = 50;
    
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('DeviceID', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('DeviceID', 4, 17);
    
    return canvas.toDataURL().substring(22, 50); // Extract part of data URL
  } catch {
    return 'canvas-error';
  }
}

// Audio context fingerprint
async function getAudioFingerprint(): Promise<string> {
  try {
    // @ts-ignore - AudioContext might not be available
    const audioContext = window.AudioContext || window.webkitAudioContext;
    if (!audioContext) return 'no-audio';
    
    const context = new audioContext();
    const oscillator = context.createOscillator();
    const analyser = context.createAnalyser();
    
    oscillator.connect(analyser);
    analyser.connect(context.destination);
    
    oscillator.start();
    await new Promise(resolve => setTimeout(resolve, 10));
    oscillator.stop();
    
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    
    return Array.from(data).slice(0, 10).join('');
  } catch {
    return 'audio-error';
  }
}

// Detect if running on mobile
export function isMobileDevice(): boolean {
  const userAgent = navigator.userAgent.toLowerCase();
  const mobileKeywords = ["android", "iphone", "ipad", "ipod", "mobile", "webos"];
  return mobileKeywords.some((keyword) => userAgent.includes(keyword));
}

// Device binding for students - Only allow one device per student
export async function enforceDeviceBinding(userId: string, userRole: string, strictMode: boolean = false): Promise<boolean> {
  // Adminlar uchun majburiy, o'qituvchilar uchun ixtiyoriy
  if (userRole === 'admin') {
    // Adminlar uchun qattiq himoya
    return await checkAdminDeviceBinding(userId);
  } else if (userRole === 'teacher' && strictMode) {
    // O'qituvchilar uchun faqat qattiq rejimda
    return await checkTeacherDeviceBinding(userId);
  } else if (userRole !== 'student') {
    return true; // Boshqa rollar uchun cheklovsiz
  }
  
  const currentFingerprint = await getFingerprint();
  const storedFingerprint = localStorage.getItem(`device_fp_${userId}`);
  
  if (!storedFingerprint) {
    // First login - store device fingerprint
    localStorage.setItem(`device_fp_${userId}`, currentFingerprint);
    localStorage.setItem(`device_registered_${userId}`, Date.now().toString());
    return true;
  }
  
  // Check if device matches
  if (storedFingerprint === currentFingerprint) {
    return true;
  }
  
  // Device mismatch - check if admin can override
  console.warn(`Device binding violation for student ${userId}`);
  
  // For production, you might want to send this to your backend for logging
  try {
    await fetch('/api/log-device-mismatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, expected: storedFingerprint, actual: currentFingerprint })
    });
  } catch (error) {
    console.error('Failed to log device mismatch:', error);
  }
  
  return false;
}

// Check if current device is registered for user
export async function isDeviceRegistered(userId: string): Promise<boolean> {
  const currentFingerprint = await getFingerprint();
  const storedFingerprint = localStorage.getItem(`device_fp_${userId}`);
  return storedFingerprint === currentFingerprint;
}

// Admin function to reset device binding
export function resetDeviceBinding(userId: string): void {
  localStorage.removeItem(`device_fp_${userId}`);
  localStorage.removeItem(`device_registered_${userId}`);
  console.log(`Device binding reset for user ${userId}`);
}

// Adminlar uchun qattiq qurilma tekshiruvi
async function checkAdminDeviceBinding(userId: string): Promise<boolean> {
  const currentFingerprint = await getFingerprint();
  const storedFingerprint = localStorage.getItem(`device_fp_${userId}`);
  
  if (!storedFingerprint) {
    // Birinchi kirish - saqlab qo'yamiz
    localStorage.setItem(`device_fp_${userId}`, currentFingerprint);
    localStorage.setItem(`device_registered_${userId}`, Date.now().toString());
    
    // Adminga xabar berish (productionda)
    console.warn(`Yangi qurilma admin ${userId} uchun ro'yxatdan o'tdi`);
    return true;
  }
  
  // Qurilma mos kelmasa, admin kirishi mumkin emas
  if (storedFingerprint !== currentFingerprint) {
    console.error(`XAVFSIZLIK: Admin ${userId} noto'g'ri qurilmadan kirishga urindi`);
    
    // Xavfsizlik log'iga yozish
    try {
      await fetch('/api/log-security-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'admin_device_mismatch',
          userId,
          expectedDevice: storedFingerprint,
          actualDevice: currentFingerprint,
          timestamp: Date.now()
        })
      });
    } catch (error) {
      console.error('Xavfsizlik logiga yozish muvaffaqiyatsiz:', error);
    }
    
    return false;
  }
  
  return true;
}

// O'qituvchilar uchun qurilma tekshiruvi (faqat monitoring)
async function checkTeacherDeviceBinding(userId: string): Promise<boolean> {
  const currentFingerprint = await getFingerprint();
  const storedFingerprint = localStorage.getItem(`device_fp_${userId}`);
  
  if (!storedFingerprint) {
    // Birinchi kirish - saqlab qo'yamiz (lekin bloklamaymiz)
    localStorage.setItem(`device_fp_${userId}`, currentFingerprint);
    localStorage.setItem(`device_registered_${userId}`, Date.now().toString());
    return true;
  }
  
  // Qurilma mos kelmasa, kirishga ruxsat beramiz lekin logga yozamiz
  if (storedFingerprint !== currentFingerprint) {
    console.warn(`Ogohlantirish: O'qituvchi ${userId} yangi qurilmadan kirdi`);
    
    // Monitoring uchun log
    try {
      await fetch('/api/log-teacher-device-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: userId,
          oldDevice: storedFingerprint,
          newDevice: currentFingerprint,
          changedAt: Date.now()
        })
      });
    } catch (error) {
      console.error('Oʻqituvchi qurilma logiga yozish muvaffaqiyatsiz:', error);
    }
    
    // Yangi qurilmani saqlaymiz
    localStorage.setItem(`device_fp_${userId}`, currentFingerprint);
    localStorage.setItem(`device_registered_${userId}`, Date.now().toString());
  }
  
  return true; // O'qituvchilar har doim kirishi mumkin
}

// Get device registration info
export function getDeviceInfo(userId: string): { fingerprint: string | null, registeredAt: number | null } {
  const fingerprint = localStorage.getItem(`device_fp_${userId}`);
  const registeredAt = localStorage.getItem(`device_registered_${userId}`);
  
  return {
    fingerprint,
    registeredAt: registeredAt ? parseInt(registeredAt) : null
  };
}

// Detect if browser is allowed
export function isAllowedBrowser(role: "admin" | "teacher" | "student"): boolean {
  const userAgent = navigator.userAgent.toLowerCase();
  const isChrome = userAgent.includes("chrome") && !userAgent.includes("edg");
  const isSafari = userAgent.includes("safari") && !userAgent.includes("chrome");
  const isMobile = isMobileDevice();

  if (role === "student") {
    // Students: Only mobile Chrome or Safari
    return isMobile && (isChrome || isSafari);
  } else {
    // Teachers and Admin: Desktop Chrome, or Mobile Chrome/Safari
    return isChrome || (isMobile && isSafari);
  }
}

// Get current session from storage
export function getCurrentSession(): Session | null {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) return null;
    
    const session = JSON.parse(stored) as Session;
    if (new Date(session.expires_at) < new Date()) {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
}

// Get token from storage (secure cookie)
export function getToken(): string | null {
  return getSecureCookie(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

// Refresh access token using refresh token
export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/auth/refresh`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-XSRF-TOKEN': getCSRFToken()
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    const result = await response.json();
    
    if (result.success && result.access_token) {
      setSecureCookie(TOKEN_KEY, result.access_token, 1);
      return result.access_token;
    }
  } catch (error) {
    console.error('Token refresh failed:', error);
  }
  
  // If refresh fails, logout the user
  clearSession();
  return null;
}

// Save session to storage with enhanced security
export function saveSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    user: session.user,
    expires_at: session.expires_at
  }));
  
  if (session.token) {
    // Store access token in secure cookie (short-lived)
    setSecureCookie(TOKEN_KEY, session.token, 1); // 1 day
    
    // Store refresh token in localStorage (long-lived)
    if (session.refresh_token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, session.refresh_token);
    }
  }
}

// Clear session
export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

// Login function with token-based auth
export async function login(
  loginInput: string,
  password: string,
  fingerprint: string
): Promise<{ success: boolean; session?: Session; error?: string }> {
  const sanitizedLogin = sanitizeInput(loginInput);
  const sanitizedPassword = password; // Don't sanitize passwords as they can have special chars

  if (!sanitizedLogin || !sanitizedPassword) {
    return { success: false, error: "Login va parol to'ldirilishi shart" };
  }

  try {
    const response = await secureFetch(`${SUPABASE_URL}/functions/v1/auth/login`, {
      method: "POST",
      body: JSON.stringify({
        login: sanitizedLogin,
        password: sanitizedPassword,
        fingerprint,
        userAgent: navigator.userAgent,
        csrf_token: getCSRFToken(),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { 
        success: false, 
        error: errorData.error || `Server xatosi: ${response.status}` 
      };
    }

    const result = await response.json();

    // Check browser compatibility after getting role
    if (!isAllowedBrowser(result.user.role)) {
      // Logout since we already logged in
      await fetch(`${SUPABASE_URL}/functions/v1/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: result.token }),
      });
      return { 
        success: false, 
        error: result.user.role === "student" 
          ? "Talabalar faqat mobil brauzerdan (Chrome/Safari) foydalanishlari mumkin"
          : "Ruxsat berilmagan brauzer"
      };
    }

    const session: Session = {
      token: result.token,
      user: result.user,
      expires_at: result.expires_at,
    };

    // Save to localStorage
    saveSession(session);
    
    return { success: true, session };
  } catch (error) {
    console.error("Login error:", error);
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      return { 
        success: false, 
        error: "Serverga ulanib bo'lmadi. Internet aloqasini yoki Edge Function holatini tekshiring." 
      };
    }
    return { success: false, error: "Tizim xatosi: " + (error instanceof Error ? error.message : "Noma'lum") };
  }
}

// Logout function
export async function logout(): Promise<void> {
  const token = getToken();
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch (error) {
    console.error("Logout error:", error);
  }
  clearSession();
}

// Validate current session
export async function validateSession(): Promise<{ valid: boolean; user?: User; expires_at?: string }> {
  const token = getToken();
  
  if (!token) {
    clearSession();
    return { valid: false };
  }

  try {
    const response = await secureFetch(`${SUPABASE_URL}/functions/v1/auth/validate`, {
      method: "POST",
      body: JSON.stringify({ token }),
    });

    const result = await response.json();
    if (!response.ok || !result.valid) {
      clearSession();
      return { valid: false };
    }

    return { 
      valid: true, 
      user: result.user, 
      expires_at: result.expires_at 
    };
  } catch (error) {
    console.error("Session validation error:", error);
    // Offline mode or network error - trust local session if it exists
    const session = getCurrentSession();
    if (session && new Date(session.expires_at) > new Date()) {
      return { valid: true, user: session.user, expires_at: session.expires_at };
    }
    return { valid: false };
  }
}
