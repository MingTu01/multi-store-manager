// 图片压缩、验证、转 base64 工具

/** 验证文件是否为图片 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/** 压缩图片，返回 base64 dataURL */
export function compressImage(file: File, maxWidth = 800, quality = 0.6): Promise<string> {
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

/** 处理文件输入变化，返回压缩后的 base64 数组 */
export async function handleImageFiles(files: FileList | File[], maxWidth = 800, quality = 0.6): Promise<string[]> {
  const results: string[] = [];
  for (const file of Array.from(files)) {
    if (!isImageFile(file)) continue;
    const compressed = await compressImage(file, maxWidth, quality);
    results.push(compressed);
  }
  return results;
}