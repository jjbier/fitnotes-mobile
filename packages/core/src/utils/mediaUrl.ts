/**
 * Detecta si una URL apunta a una imagen por su extensión, para decidir si
 * `Exercise.demo_url` se puede previsualizar como `<img>`/`Image` o si hay
 * que mostrarlo como un enlace externo (vídeo, YouTube, etc.).
 */
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"];

export function isImageUrl(url: string): boolean {
  const path = url.split(/[?#]/)[0]!.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => path.endsWith(ext));
}
