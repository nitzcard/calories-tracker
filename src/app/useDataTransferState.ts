import { ref } from "vue";
import { exportAppData, importAppData } from "../storage/repository";
import { localIsoDate } from "../domain/dates";

export function useDataTransferState(refreshState: () => Promise<void>) {
  const dataTransferStatus = ref<"idle" | "exported" | "imported" | "failed">("idle");
  const isTransferringData = ref(false);

  async function exportData(options?: { filename?: string }) {
    isTransferringData.value = true;
    dataTransferStatus.value = "idle";
    try {
      const snapshot = await exportAppData();
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        options?.filename ?? `calorie-tracker-backup-${localIsoDate()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      dataTransferStatus.value = "exported";
    } catch {
      dataTransferStatus.value = "failed";
    } finally {
      isTransferringData.value = false;
    }
  }

  async function importData(payload: string) {
    isTransferringData.value = true;
    dataTransferStatus.value = "idle";
    try {
      await importAppData(JSON.parse(payload));
      await refreshState();
      dataTransferStatus.value = "imported";
    } catch {
      dataTransferStatus.value = "failed";
    } finally {
      isTransferringData.value = false;
    }
  }

  return {
    dataTransferStatus,
    isTransferringData,
    exportData,
    importData,
  };
}
