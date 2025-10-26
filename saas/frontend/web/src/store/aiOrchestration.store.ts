import { create } from "zustand";

export type BannerState =
  | { kind: "none" }
  | { kind: "cleanup_running"; text: string }
  | { kind: "cleanup_done"; text: string }
  | { kind: "info"; text: string };

type OrchestrationState = {
  isProcessing: boolean;     // true while generating (robot)
  isCancelling: boolean;     // true while cancelling/cleaning (sand clock/gears)


  
  taskId?: string | null;
  banner: BannerState;
  // actions
  beginProcessing: (taskId?: string | null) => void;
  beginCancelling: () => void;
  finishCleanup: () => void;
  reset: () => void;
  setBanner: (b: BannerState) => void;
};

export const useAiOrchestration = create<OrchestrationState>((set) => ({
  isProcessing: false,
  isCancelling: false,
  taskId: null,
  banner: { kind: "none" },
  beginProcessing: (taskId) =>
    set({
      isProcessing: true,
      isCancelling: false,
      taskId: taskId ?? null,
      banner: { kind: "none" },
    }),
  beginCancelling: () =>
    set({
      isProcessing: false,
      isCancelling: true,
      banner: {
        kind: "cleanup_running",
        text:
          "Cleanup is still running in the background. Please wait a few more seconds before generating a new report.",
      },
    }),
  finishCleanup: () =>
    set({
      isProcessing: false,
      isCancelling: false,
      taskId: null,
      banner: { kind: "none" },
    }),
  reset: () =>
    set({
      isProcessing: false,
      isCancelling: false,
      taskId: null,
      banner: { kind: "none" },
    }),
  setBanner: (banner) => set({ banner }),
}));