export type ToastType = 'success' | 'error' | 'info';
export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

type Listener = (toast: Toast) => void;

let listeners: Listener[] = [];
let nextId = 1;

export function showToast(message: string, type: ToastType = 'info') {
  const toast: Toast = { id: nextId++, message, type };
  listeners.forEach((l) => l(toast));
}

export function subscribeToast(listener: Listener) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}
