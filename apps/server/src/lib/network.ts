import { isIPv4, isIPv6 } from 'net';
import { resolve4, resolve6 } from 'dns';
import { promisify } from 'util';

const resolve4Async = promisify(resolve4);
const resolve6Async = promisify(resolve6);

/**
 * 检查 IP 地址是否为内网/私有地址
 */
export function isPrivateIp(hostname: string): boolean {
  // 移除 IPv6 方括号
  const host = hostname.replace(/^\[|\]$/g, '');
  
  // localhost
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0:0:0:0:0:0:0:1') {
    return true;
  }
  
  // IPv4 私有地址
  if (isIPv4(host)) {
    const parts = host.split('.').map(Number);
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 169.254.0.0/16 (link-local)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 127.0.0.0/8
    if (parts[0] === 127) return true;
    return false;
  }
  
  // IPv6 私有地址
  if (isIPv6(host)) {
    const lower = host.toLowerCase();
    // fc00::/7 (unique local)
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    // fe80::/10 (link-local)
    if (lower.startsWith('fe80')) return true;
    // ::1 (loopback)
    if (lower === '::1') return true;
    return false;
  }
  
  return false;
}

/**
 * 校验 webhook URL 安全性
 */
export function validateWebhookUrl(urlStr: string): { valid: boolean; error?: string } {
  try {
    const url = new URL(urlStr);
    
    // 仅允许 http/https
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { valid: false, error: '仅支持 http/https 协议' };
    }
    
    // 禁止内网地址
    if (isPrivateIp(url.hostname)) {
      return { valid: false, error: '禁止访问内网地址' };
    }
    
    // 禁止元数据地址
    const blockedHosts = ['169.254.169.254', 'metadata.google.internal', 'metadata.google.com'];
    if (blockedHosts.includes(url.hostname)) {
      return { valid: false, error: '禁止访问云服务元数据地址' };
    }
    
    return { valid: true };
  } catch {
    return { valid: false, error: 'URL 格式无效' };
  }
}

/**
 * 校验 webhook URL 安全性（异步版本，含 DNS 解析校验）
 * 先做字面量校验，再对域名做 DNS 解析，防止域名解析到内网地址绕过 SSRF 防护
 */
export async function validateWebhookUrlAsync(urlStr: string): Promise<{ valid: boolean; error?: string }> {
  // 先复用同步字面量校验
  const sync = validateWebhookUrl(urlStr);
  if (!sync.valid) return sync;

  try {
    const url = new URL(urlStr);
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    // 仅对域名做 DNS 解析；字面量 IP 已由同步校验覆盖
    if (!isIPv4(hostname) && !isIPv6(hostname) && hostname !== 'localhost') {
      try {
        const ips = await resolve4Async(hostname);
        for (const ip of ips) {
          if (isPrivateIp(ip)) return { valid: false, error: '域名解析到内网地址' };
        }
      } catch { /* IPv4 解析失败，尝试 IPv6 */ }
      try {
        const ips6 = await resolve6Async(hostname);
        for (const ip of ips6) {
          if (isPrivateIp(ip)) return { valid: false, error: '域名解析到内网地址' };
        }
      } catch { /* IPv6 也解析失败，可能是本地域名，允许通过 */ }
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'URL 格式无效' };
  }
}
