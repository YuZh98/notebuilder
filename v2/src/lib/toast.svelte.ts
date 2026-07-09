export const toastState = $state({ message: '', visible: false });

let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string, ms = 1700): void {
  toastState.message = message;
  toastState.visible = true;
  clearTimeout(timer);
  timer = setTimeout(() => (toastState.visible = false), ms);
}

export function dismissToast(): void {
  clearTimeout(timer);
  toastState.visible = false;
  toastState.message = '';
}
