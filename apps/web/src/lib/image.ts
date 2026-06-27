// 图片压缩、上传工具 - WebP 格式

/** 验证文件是否为图片 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/** 压缩图片为 WebP Blob */
export function compressToWebP(file: File, maxWidth = 1200, quality = 0.7): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!isImageFile(file)) {
      reject(new Error('只能上传图片文件'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('图片加载失败'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;

        // Scale down if too large
        if (w > maxWidth) {
          h = Math.round(h * maxWidth / w);
          w = maxWidth;
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('浏览器不支持canvas')); return; }
        ctx.drawImage(img, 0, 0, w, h);

        // Try WebP first, fallback to JPEG
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              // Fallback to JPEG
              canvas.toBlob(
                (jb) => { if (jb) resolve(jb); else reject(new Error('压缩失败')); },
                'image/jpeg',
                quality
              );
            }
          },
          'image/webp',
          quality
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** 压缩图片为 WebP Blob（健康证专用，更高质量） */
export function compressHealthCert(file: File): Promise<Blob> {
  return compressToWebP(file, 1600, 0.8);
}

/** 上传压缩后的图片 */
export async function uploadImage(file: File, api: any, type: string, isHealthCert = false): Promise<string> {
  const compressed = isHealthCert ? await compressHealthCert(file) : await compressToWebP(file);
  
  // If output > 200KB for normal images, reduce quality and retry
  let finalBlob = compressed;
  if (!isHealthCert && compressed.size > 200 * 1024) {
    finalBlob = await compressToWebP(file, 1200, 0.5);
  }

  // If still > 900KB, reduce further
  if (finalBlob.size > 900 * 1024) {
    finalBlob = await compressToWebP(file, 800, 0.4);
  }

  const ext = finalBlob.type === 'image/webp' ? 'webp' : 'jpg';
  const uploadFile = new File([finalBlob], 'image.' + ext, { type: finalBlob.type || 'image/webp' });
  
  const formData = new FormData();
  formData.append('file', uploadFile);
  
  const result = await api.upload('/upload/' + type, formData);
  return result.url;
}

/** 压缩图片为 base64（用于内联预览，如头像选择） */
export function compressToBase64(file: File, maxWidth = 400, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!isImageFile(file)) {
      reject(new Error('只能上传图片文件'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('图片加载失败'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round(h * maxWidth / w);
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('浏览器不支持canvas')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/webp', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** 验证文件大小 (MB) */
export function validateFileSize(file: File, maxMB = 10): boolean {
  return file.size <= maxMB * 1024 * 1024;
}

/** @deprecated Use compressToBase64 instead */
export const compressImage = compressToBase64;

/** @deprecated Use uploadImage instead */
export async function handleImageFiles(files: FileList | File[], maxWidth = 600, quality = 0.6): Promise<string[]> {
  const results: string[] = [];
  for (const file of Array.from(files)) {
    if (!isImageFile(file)) continue;
    const compressed = await compressToBase64(file, maxWidth, quality);
    results.push(compressed);
  }
  return results;
}

/** 校验图片 URL 安全性，防止 XSS 和无效 URL */
export function safeImageUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('data:image/')) return url;
  if (url.startsWith('/') || url.startsWith('https://') || url.startsWith('http://')) return url;
  return '';
}