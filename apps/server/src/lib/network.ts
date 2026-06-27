import { isIPv4, isIPv6 } from 'net';

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
