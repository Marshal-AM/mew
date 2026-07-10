import { toast } from "sonner";

type NotifyOptions = {
  description?: string;
};

export const notify = {
  error(message: string, options?: NotifyOptions) {
    toast.error(message, { description: options?.description, duration: 6000 });
  },
  warning(message: string, options?: NotifyOptions) {
    toast.warning(message, { description: options?.description, duration: 5000 });
  },
  info(message: string, options?: NotifyOptions) {
    toast.info(message, { description: options?.description, duration: 4000 });
  },
  success(message: string, options?: NotifyOptions) {
    toast.success(message, { description: options?.description, duration: 4000 });
  },
};

export function isUserRejectedWallet(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  return code === "ACTION_REJECTED" || code === 4001;
}
