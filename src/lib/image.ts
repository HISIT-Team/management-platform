/* Client-side image compression → JPEG data URL. Port of the original
   compressImage() used by the device check-in/out forms. */
export function compressImage(file: File, maxWidth = 1200, quality = 0.75): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const c = document.createElement('canvas');
      c.width = img.width * scale;
      c.height = img.height * scale;
      const cx = c.getContext('2d');
      if (!cx) {
        URL.revokeObjectURL(url);
        resolve(null);
        return;
      }
      cx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
