// 图片压缩、验证、预览工具

/** 验证文件是否为图片 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/** 压缩图片，返回 Blob (用于FormData上传) */
export function compressImageToBlob(file: File, maxWidth = 1200, quality = 0.7): Promise<Blob> {
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
        canvas.toBlob(
          (blob) => { if (blob) resolve(blob); else reject(new Error('压缩失败')); },
          'image/jpeg',
          quality
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** 压缩图片，返回 base64 dataURL (用于预览和内联显示) */
export function compressImageToBase64(file: File, maxWidth = 600, quality = 0.6): Promise<string> {
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
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** 上传压缩后的图片文件 */
export async function uploadCompressedImage(file: File, api: any, url: string): Promise<any> {
  const compressed = await compressImageToBlob(file, 1200, 0.7);
  const formData = new FormData();
  // 保持原文件名，但用压缩后的blob
  const compressedFile = new File([compressed], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
  formData.append('file', compressedFile);
  return api.upload(url, formData);
}

/** 处理文件输入变化，返回压缩后的base64数组 (用于内联预览) */
export async function handleImageFiles(files: FileList | File[], maxWidth = 600, quality = 0.6): Promise<string[]> {
  const results: string[] = [];
  for (const file of Array.from(files)) {
    if (!isImageFile(file)) continue;
    const compressed = await compressImageToBase64(file, maxWidth, quality);
    results.push(compressed);
  }
  return results;
}

/** 验证文件大小 (MB) */
export function validateFileSize(file: File, maxMB = 10): boolean {
  return file.size <= maxMB * 1024 * 1024;
}

/** @deprecated Use compressImageToBase64 instead */
export const compressImage = compressImageToBase64;
