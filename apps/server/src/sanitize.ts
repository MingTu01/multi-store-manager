import sanitizeHtml from 'sanitize-html';

/**
 * 净化文本输入，禁止所有 HTML 标签
 * @param input - 待净化的输入
 * @returns 净化后的纯文本，首尾空白已去除
 */
export function sanitizeText(input: string): string {
  if (typeof input !== 'string') return '';
  return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} }).trim();
}

/**
 * 净化备注输入，禁止所有 HTML 标签，但保留换行符
 * @param input - 待净化的输入
 * @returns 净化后的文本，保留换行，首尾空白已去除
 */
export function sanitizeNote(input: string): string {
  if (typeof input !== 'string') return '';
  // 先将换行转为占位符，净化后还原
  const placeholder = '___NEWLINE___';
  const withPlaceholder = input.replace(/\n/g, placeholder);
  const sanitized = sanitizeHtml(withPlaceholder, { allowedTags: [], allowedAttributes: {} });
  return sanitized.replace(new RegExp(placeholder, 'g'), '\n').trim();
}
