export default function imageLoader({ src, width }: { src: string; width: number }): string {
  if (src.startsWith("/api/photos/")) return `${src}?w=${width}`;
  return src;
}
