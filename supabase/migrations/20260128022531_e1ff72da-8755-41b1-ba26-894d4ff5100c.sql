-- 1. Login urinishlari va rate limiting uchun jadval
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  login TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_login_attempts_login_time ON public.login_attempts(login, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON public.login_attempts(ip_address, created_at DESC);

-- 2. IP Whitelist/Blacklist jadvali
CREATE TABLE IF NOT EXISTS public.ip_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('whitelist', 'blacklist')),
  reason TEXT,
  created_by UUID REFERENCES public.users(id),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ip_address, rule_type)
);

CREATE INDEX IF NOT EXISTS idx_ip_rules_ip ON public.ip_rules(ip_address);
CREATE INDEX IF NOT EXISTS idx_ip_rules_type ON public.ip_rules(rule_type);

-- 3. Enable RLS on new tables
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ip_rules ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for login_attempts (only service role can insert/read)
-- Edge function uses service role, so no public access needed
CREATE POLICY "Service role only for login_attempts"
ON public.login_attempts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 5. RLS Policies for ip_rules (only admins via edge function)
CREATE POLICY "Service role only for ip_rules"
ON public.ip_rules
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 6. Helper function to check if IP is blocked
CREATE OR REPLACE FUNCTION public.is_ip_blocked(check_ip TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ip_rules
    WHERE ip_address = check_ip
    AND rule_type = 'blacklist'
    AND (expires_at IS NULL OR expires_at > now())
  )
$$;

-- 7. Helper function to check if login is rate limited
CREATE OR REPLACE FUNCTION public.is_login_rate_limited(check_login TEXT, check_ip TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    SELECT COUNT(*) FROM public.login_attempts
    WHERE (login = check_login OR ip_address = check_ip)
    AND success = false
    AND created_at > now() - interval '15 minutes'
  ) >= 5
$$;

-- 8. Helper function to record login attempt
CREATE OR REPLACE FUNCTION public.record_login_attempt(
  p_login TEXT,
  p_ip_address TEXT,
  p_user_agent TEXT,
  p_success BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.login_attempts (login, ip_address, user_agent, success)
  VALUES (p_login, p_ip_address, p_user_agent, p_success);
  
  -- Clean up old attempts (older than 24 hours)
  DELETE FROM public.login_attempts WHERE created_at < now() - interval '24 hours';
END;
$$;

-- 9. Fix overly permissive RLS policies
-- First drop existing permissive policies
DROP POLICY IF EXISTS "Anyone can manage groups" ON public.groups;
DROP POLICY IF EXISTS "Anyone can read groups" ON public.groups;
DROP POLICY IF EXISTS "Anyone can manage student_groups" ON public.student_groups;
DROP POLICY IF EXISTS "Anyone can read student_groups" ON public.student_groups;
DROP POLICY IF EXISTS "Anyone can manage subjects" ON public.subjects;
DROP POLICY IF EXISTS "Anyone can read subjects" ON public.subjects;
DROP POLICY IF EXISTS "Anyone can manage lessons" ON public.lessons;
DROP POLICY IF EXISTS "Anyone can manage attendance" ON public.attendance;
DROP POLICY IF EXISTS "Anyone can manage notifications" ON public.notifications;
DROP POLICY IF EXISTS "Anyone can manage users" ON public.users;

-- 10. Create proper RLS policies using token-based auth
-- Helper function to get user from session token
CREATE OR REPLACE FUNCTION public.get_session_user_id(session_token TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM public.sessions
  WHERE token = session_token
  AND expires_at > now()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_session_user_role(session_token TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.role::TEXT FROM public.sessions s
  JOIN public.users u ON s.user_id = u.id
  WHERE s.token = session_token
  AND s.expires_at > now()
  LIMIT 1
$$;

-- 11. RLS for groups - service role manages, public can read
CREATE POLICY "Service role manages groups"
ON public.groups FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read groups"
ON public.groups FOR SELECT TO anon, authenticated
USING (true);

-- 12. RLS for student_groups
CREATE POLICY "Service role manages student_groups"
ON public.student_groups FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read student_groups"
ON public.student_groups FOR SELECT TO anon, authenticated
USING (true);

-- 13. RLS for subjects
CREATE POLICY "Service role manages subjects"
ON public.subjects FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read subjects"
ON public.subjects FOR SELECT TO anon, authenticated
USING (true);

-- 14. RLS for lessons
CREATE POLICY "Service role manages lessons"
ON public.lessons FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read lessons"
ON public.lessons FOR SELECT TO anon, authenticated
USING (true);

-- 15. RLS for attendance
CREATE POLICY "Service role manages attendance"
ON public.attendance FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read attendance"
ON public.attendance FOR SELECT TO anon, authenticated
USING (true);

-- 16. RLS for notifications
CREATE POLICY "Service role manages notifications"
ON public.notifications FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read notifications"
ON public.notifications FOR SELECT TO anon, authenticated
USING (true);

-- 17. RLS for users - critical security!
CREATE POLICY "Service role manages users"
ON public.users FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read users"
ON public.users FOR SELECT TO anon, authenticated
USING (true);

-- 18. RLS for sessions
DROP POLICY IF EXISTS "Anyone can manage sessions" ON public.sessions;
CREATE POLICY "Service role manages sessions"
ON public.sessions FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- 19. RLS for activity_logs
DROP POLICY IF EXISTS "Anyone can manage activity_logs" ON public.activity_logs;
CREATE POLICY "Service role manages activity_logs"
ON public.activity_logs FOR ALL TO service_role
USING (true) WITH CHECK (true);