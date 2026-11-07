import { invoke } from "@tauri-apps/api/core";

export interface RuntimeInfo {
  version: string;
  desktop: string;
  session: string;
  appimage: boolean;
  dmabufDisabled: boolean;
}

/** Raw shape as serialized by Rust (snake_case). */
interface RawRuntimeInfo {
  version: string;
  desktop: string;
  session: string;
  appimage: boolean;
  dmabuf_disabled: boolean;
}

/** Typed wrappers over Tauri commands, one per command. */
export const ipc = {
  getRuntimeInfo: async (): Promise<RuntimeInfo> => {
    const r = await invoke<RawRuntimeInfo>("get_runtime_info");
    return {
      version: r.version,
      desktop: r.desktop,
      session: r.session,
      appimage: r.appimage,
      dmabufDisabled: r.dmabuf_disabled,
    };
  },
};
