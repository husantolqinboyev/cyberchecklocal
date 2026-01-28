-- Add face_embedding column to users table for Face ID verification
-- Using JSONB to store Float32Array as JSON array (128 values)
ALTER TABLE public.users 
ADD COLUMN face_embedding JSONB DEFAULT NULL;

-- Add comment to explain the column
COMMENT ON COLUMN public.users.face_embedding IS 'Face embedding vector (128 float values) for Face ID verification';

-- Create index for faster lookups on users with face embeddings
CREATE INDEX idx_users_face_embedding ON public.users USING GIN (face_embedding) WHERE face_embedding IS NOT NULL;