-- URL de imagen o vídeo demostrativo de cómo se realiza el ejercicio
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS demo_url TEXT;
