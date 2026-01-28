import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "http://localhost:5173",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-xsrf-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Max-Age": "86400",
};

// Generate secure random token
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Generate refresh token (long-lived)
function generateRefreshToken(): string {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Validate CSRF token
function validateCSRFToken(req: Request, body: any): boolean {
  const clientCSRF = body.csrf_token;
  const headerCSRF = req.headers.get("x-xsrf-token");
  
  // Both must match for double verification
  return clientCSRF && headerCSRF && clientCSRF === headerCSRF;
}

// Generate salt
function generateSalt(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Hash password with PBKDF2 (more compatible with Deno edge runtime)
async function hashPassword(password: string, salt?: string): Promise<string> {
  const useSalt = salt || generateSalt();
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);
  const saltData = encoder.encode(useSalt);
  
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordData,
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  
  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltData,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  
  const hashHex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  
  // Format: $pbkdf2$iterations$salt$hash
  return `$pbkdf2$100000$${useSalt}$${hashHex}`;
}

// Verify password with PBKDF2
async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  // Check if it's a PBKDF2 hash
  if (storedHash.startsWith("$pbkdf2$")) {
    const parts = storedHash.split("$");
    if (parts.length !== 5) return false;
    
    const iterations = parseInt(parts[2], 10);
    const salt = parts[3];
    const expectedHash = parts[4];
    
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password);
    const saltData = encoder.encode(salt);
    
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      passwordData,
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    
    const hash = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: saltData,
        iterations,
        hash: "SHA-256",
      },
      keyMaterial,
      256
    );
    
    const hashHex = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    
    return hashHex === expectedHash;
  }
  
  // Fallback for plain text passwords (migration)
  return password === storedHash;
}

// Sanitize input
function sanitizeInput(input: string): string {
  if (typeof input !== "string") return "";
  return input.trim().replace(/[<>]/g, "");
}

// Get client IP from request headers
function getClientIP(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
         req.headers.get("x-real-ip") ||
         req.headers.get("cf-connecting-ip") ||
         "unknown";
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const clientIP = getClientIP(req);
  const userAgent = req.headers.get("user-agent") || "";

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const action = pathParts[pathParts.length - 1];

    console.log(`Auth action: ${action}, IP: ${clientIP}`);

    // Check if IP is blocked (for all actions)
    const { data: isBlocked } = await supabase.rpc("is_ip_blocked", { check_ip: clientIP });
    if (isBlocked) {
      console.log(`Blocked IP attempted access: ${clientIP}`);
      return new Response(
        JSON.stringify({ success: false, error: "Bu IP manzildan kirish bloklangan" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "login") {
      const body = await req.json();
      const { login, password, fingerprint } = body;
      
      // Validate CSRF token for login requests
      if (!validateCSRFToken(req, body)) {
        console.log("CSRF validation failed for login attempt");
        return new Response(
          JSON.stringify({ success: false, error: "Xavfsizlik xatosi. Sahifani yangilang." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const sanitizedLogin = sanitizeInput(login);
      const sanitizedPassword = sanitizeInput(password);

      if (!sanitizedLogin || !sanitizedPassword) {
        return new Response(
          JSON.stringify({ success: false, error: "Login va parol to'ldirilishi shart" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check rate limiting
      const { data: isRateLimited } = await supabase.rpc("is_login_rate_limited", { 
        check_login: sanitizedLogin, 
        check_ip: clientIP 
      });
      
      if (isRateLimited) {
        console.log(`Rate limited: login=${sanitizedLogin}, IP=${clientIP}`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Juda ko'p noto'g'ri urinish. 15 daqiqadan so'ng qayta urinib ko'ring." 
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Find user
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("*")
        .eq("login", sanitizedLogin)
        .eq("is_active", true)
        .maybeSingle();

      if (userError || !user) {
        // Record failed attempt
        await supabase.rpc("record_login_attempt", {
          p_login: sanitizedLogin,
          p_ip_address: clientIP,
          p_user_agent: userAgent,
          p_success: false
        });
        
        console.log("User not found:", sanitizedLogin);
        return new Response(
          JSON.stringify({ success: false, error: "Login yoki parol noto'g'ri" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify password
      const passwordValid = await verifyPassword(sanitizedPassword, user.password_hash);
      if (!passwordValid) {
        // Record failed attempt
        await supabase.rpc("record_login_attempt", {
          p_login: sanitizedLogin,
          p_ip_address: clientIP,
          p_user_agent: userAgent,
          p_success: false
        });

        await supabase.from("activity_logs").insert({
          user_id: user.id,
          action: "login_failed",
          details: { reason: "wrong_password" },
          user_agent: userAgent,
          ip_address: clientIP,
        });
        
        console.log("Wrong password for user:", sanitizedLogin);
        return new Response(
          JSON.stringify({ success: false, error: "Login yoki parol noto'g'ri" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // If password was plain text, upgrade to PBKDF2
      if (!user.password_hash.startsWith("$pbkdf2$")) {
        const hashedPassword = await hashPassword(sanitizedPassword);
        await supabase
          .from("users")
          .update({ password_hash: hashedPassword })
          .eq("id", user.id);
        console.log("Password upgraded to PBKDF2 for user:", sanitizedLogin);
      }

      // Check device binding for students
      if (user.role === "student") {
        const deviceFingerprint = user.device_fingerprint;
        if (deviceFingerprint && deviceFingerprint !== fingerprint) {
          // Record failed attempt
          await supabase.rpc("record_login_attempt", {
            p_login: sanitizedLogin,
            p_ip_address: clientIP,
            p_user_agent: userAgent,
            p_success: false
          });

          await supabase.from("activity_logs").insert({
            user_id: user.id,
            action: "login_failed",
            details: { reason: "device_mismatch", attempted_fingerprint: fingerprint },
            user_agent: userAgent,
            ip_address: clientIP,
          });
          
          console.log("Device mismatch for student:", sanitizedLogin);
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: "Bu qurilmadan kirish mumkin emas. Qurilmani o'zgartirish uchun admin bilan bog'laning." 
            }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Bind device if not set
        if (!deviceFingerprint) {
          await supabase
            .from("users")
            .update({ device_fingerprint: fingerprint })
            .eq("id", user.id);
          console.log("Device bound for student:", sanitizedLogin);
        }
      }

      // Record successful login
      await supabase.rpc("record_login_attempt", {
        p_login: sanitizedLogin,
        p_ip_address: clientIP,
        p_user_agent: userAgent,
        p_success: true
      });

      // Generate tokens
      const token = generateToken(); // Short-lived access token (12 hours)
      const refreshToken = generateRefreshToken(); // Long-lived refresh token (7 days)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 12);
      const refreshExpiresAt = new Date();
      refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 7);

      // Delete old sessions for this user (single session policy)
      await supabase.from("sessions").delete().eq("user_id", user.id);

      // Create session in database with refresh token
      const { error: sessionError } = await supabase.from("sessions").insert({
        user_id: user.id,
        token,
        refresh_token: refreshToken,
        fingerprint,
        user_agent: userAgent,
        ip_address: clientIP,
        expires_at: expiresAt.toISOString(),
        refresh_expires_at: refreshExpiresAt.toISOString(),
      });

      if (sessionError) {
        console.error("Session creation error:", sessionError);
        return new Response(
          JSON.stringify({ success: false, error: "Sessiya yaratishda xatolik" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Log successful login
      await supabase.from("activity_logs").insert({
        user_id: user.id,
        action: "login_success",
        user_agent: userAgent,
        ip_address: clientIP,
      });

      console.log("Login successful for user:", sanitizedLogin);

      // Return tokens in response body
      return new Response(
        JSON.stringify({
          success: true,
          token, // Short-lived access token (for secure cookie)
          refresh_token: refreshToken, // Long-lived refresh token (for localStorage)
          user: {
            id: user.id,
            login: user.login,
            full_name: user.full_name,
            role: user.role,
            is_active: user.is_active,
          },
          expires_at: expiresAt.toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "logout") {
      const body = await req.json().catch(() => ({}));
      const token = body.token;

      if (token) {
        const { data: session } = await supabase
          .from("sessions")
          .select("user_id")
          .eq("token", token)
          .maybeSingle();

        if (session) {
          await supabase.from("sessions").delete().eq("token", token);
          await supabase.from("activity_logs").insert({
            user_id: session.user_id,
            action: "logout",
            user_agent: userAgent,
            ip_address: clientIP,
          });
          console.log("Logout successful for user_id:", session.user_id);
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "refresh") {
      const body = await req.json().catch(() => ({}));
      const { refresh_token } = body;

      if (!refresh_token) {
        return new Response(
          JSON.stringify({ success: false, error: "Refresh token talab qilinadi" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate refresh token
      const { data: session, error } = await supabase
        .from("sessions")
        .select("*, users(*)")
        .eq("refresh_token", refresh_token)
        .gte("refresh_expires_at", new Date().toISOString())
        .maybeSingle();

      if (error || !session) {
        return new Response(
          JSON.stringify({ success: false, error: "Yaroqsiz refresh token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const user = session.users as any;

      // Generate new access token
      const newToken = generateToken();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 12);

      // Update session with new access token
      const { error: updateError } = await supabase
        .from("sessions")
        .update({ 
          token: newToken,
          expires_at: expiresAt.toISOString()
        })
        .eq("refresh_token", refresh_token);

      if (updateError) {
        console.error("Token refresh error:", updateError);
        return new Response(
          JSON.stringify({ success: false, error: "Token yangilashda xatolik" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Token refreshed for user:", user.login);

      return new Response(
        JSON.stringify({
          success: true,
          access_token: newToken,
          expires_at: expiresAt.toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "validate") {
      const body = await req.json().catch(() => ({}));
      const token = body.token;

      if (!token) {
        return new Response(
          JSON.stringify({ valid: false }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate session in database
      const { data: session, error } = await supabase
        .from("sessions")
        .select("*, users(*)")
        .eq("token", token)
        .gte("expires_at", new Date().toISOString())
        .maybeSingle();

      if (error || !session) {
        return new Response(
          JSON.stringify({ valid: false }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const user = session.users as any;

      return new Response(
        JSON.stringify({
          valid: true,
          user: {
            id: user.id,
            login: user.login,
            full_name: user.full_name,
            role: user.role,
            is_active: user.is_active,
          },
          expires_at: session.expires_at,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "hash-password") {
      const body = await req.json();
      const { password } = body;
      
      if (!password) {
        return new Response(
          JSON.stringify({ error: "Password required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const hash = await hashPassword(password);
      return new Response(
        JSON.stringify({ hash }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // IP Management endpoints (admin only - validated by session token)
    if (action === "block-ip" || action === "unblock-ip") {
      const body = await req.json();
      const { token, targetIP, reason, expiresIn } = body;

      // Validate admin session
      const { data: sessionRole } = await supabase.rpc("get_user_role_from_token", { session_token: token });
      if (sessionRole !== "admin") {
        return new Response(
          JSON.stringify({ success: false, error: "Faqat admin ushbu amalni bajara oladi" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: userId } = await supabase.rpc("get_user_id_from_token", { session_token: token });

      if (action === "block-ip") {
        const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 60000).toISOString() : null;
        
        const { error } = await supabase.from("ip_rules").upsert({
          ip_address: targetIP,
          rule_type: "blacklist",
          reason: reason || "Admin tomonidan bloklangan",
          created_by: userId,
          expires_at: expiresAt,
        }, { onConflict: "ip_address,rule_type" });

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: "IP bloklashda xatolik" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await supabase.from("activity_logs").insert({
          user_id: userId,
          action: "ip_blocked",
          details: { target_ip: targetIP, reason, expires_at: expiresAt },
          ip_address: clientIP,
        });

        return new Response(
          JSON.stringify({ success: true, message: `IP ${targetIP} bloklandi` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (action === "unblock-ip") {
        await supabase.from("ip_rules").delete()
          .eq("ip_address", targetIP)
          .eq("rule_type", "blacklist");

        await supabase.from("activity_logs").insert({
          user_id: userId,
          action: "ip_unblocked",
          details: { target_ip: targetIP },
          ip_address: clientIP,
        });

        return new Response(
          JSON.stringify({ success: true, message: `IP ${targetIP} blokdan chiqarildi` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "list-blocked-ips") {
      const body = await req.json();
      const { token } = body;

      // Validate admin session
      const { data: sessionRole } = await supabase.rpc("get_user_role_from_token", { session_token: token });
      if (sessionRole !== "admin") {
        return new Response(
          JSON.stringify({ success: false, error: "Faqat admin ushbu amalni bajara oladi" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: blockedIPs } = await supabase
        .from("ip_rules")
        .select("*, users:created_by(full_name)")
        .eq("rule_type", "blacklist")
        .order("created_at", { ascending: false });

      return new Response(
        JSON.stringify({ success: true, data: blockedIPs || [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "login-attempts") {
      const body = await req.json();
      const { token, login, limit = 50 } = body;

      // Validate admin session
      const { data: sessionRole } = await supabase.rpc("get_user_role_from_token", { session_token: token });
      if (sessionRole !== "admin") {
        return new Response(
          JSON.stringify({ success: false, error: "Faqat admin ushbu amalni bajara oladi" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let query = supabase
        .from("login_attempts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (login) {
        query = query.eq("login", login);
      }

      const { data: attempts } = await query;

      return new Response(
        JSON.stringify({ success: true, data: attempts || [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Auth function error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Tizim xatosi" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
