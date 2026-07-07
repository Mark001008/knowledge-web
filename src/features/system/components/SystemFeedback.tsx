import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "../../../components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "../../../components/ui/alert";

export type SystemNoticeState = {
  tone: "success" | "error";
  title: string;
  message?: string;
} | null;

export type ConfirmState = {
  title: string;
  description: string;
  actionLabel?: string;
  onConfirm: () => void | Promise<void>;
} | null;

export function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function SystemNotice({ notice, onClose }: { notice: SystemNoticeState; onClose: () => void }) {
  if (!notice) return null;
  return (
    <Alert variant={notice.tone === "error" ? "destructive" : "default"} className="mb-4">
      <AlertTitle>{notice.title}</AlertTitle>
      {notice.message ? <AlertDescription>{notice.message}</AlertDescription> : null}
      <button className="absolute right-3 top-3 text-xs text-muted-foreground" type="button" onClick={onClose}>
        关闭
      </button>
    </Alert>
  );
}

export function SystemConfirmDialog({
  confirm,
  onOpenChange
}: {
  confirm: ConfirmState;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog open={Boolean(confirm)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={() => confirm?.onConfirm()}>
            {confirm?.actionLabel || "确认"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
