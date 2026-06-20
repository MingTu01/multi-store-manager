export interface StoreInfo {
  id: string;
  name: string;
  address?: string;
  initial_capital?: number;
  is_open: number;
  status?: string;
  staff_count?: number;
  shareholders?: Shareholder[];
  photos?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface Shareholder {
  id: number;
  store_id: string;
  name: string;
  phone?: string;
  ratio: number;
}

export interface Entry {
  id: number;
  store_id: string;
  type: string;
  category?: string;
  amount: number;
  note?: string;
  date?: string;
  created_by?: number;
  created_at?: string;
  creator_name?: string;
}

export interface UserInfo {
  id: number;
  username: string;
  name: string;
  role: 'ADMIN' | 'STORE_ADMIN' | 'MANAGER' | 'STAFF' | 'SHAREHOLDER';
  store_id?: number | null;
  store_name?: string;
  phone?: string;
  avatar?: string;
  address?: string;
  salary?: number;
  status?: string;
  job_title?: string;
}

export interface InventoryItem {
  id: number;
  store_id: string;
  name: string;
  quantity: number;
  photo?: string;
  status: string;
  sort_order: number;
}

export interface Notification {
  id: number;
  user_id: number;
  title: string;
  link?: string;
  read: number;
  created_at: string;
}