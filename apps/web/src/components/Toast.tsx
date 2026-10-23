// ============================================
// Dispatch HQ — Toast compatibility shim
// Old centered toast pop-ups have been replaced by the Notification Center.
// This file re-exports the notification provider / hook under the old names
// so existing imports continue to work without hunting down every call site.
// ============================================

import { NotificationProvider, useNotifications, type NotificationType } from './NotificationCenter';

export type ToastType = NotificationType;

export interface Toast {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
  icon?: string;
  value?: string;
  service?: string;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return <NotificationProvider>{children}</NotificationProvider>;
}

export function useToast() {
  const { addNotification, removeNotification } = useNotifications();
  return {
    addToast: (toast: Omit<Toast, 'id'>) => addNotification(toast),
    removeToast: removeNotification,
  };
}
