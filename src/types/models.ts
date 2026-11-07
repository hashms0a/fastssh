/** Mirror of the Rust models (IPC shape, spec 6.1-6.4). */

export interface Host {
  id: string;
  name: string;
  group: string;
  host: string;
  port: number;
  username: string;
  password: string;
  identity_file: string;
  account: string;
  color: string;
  font: string;
  tunnels: string;
  extra_arguments: string;
  ssh_config: string;
  /** True only for the built-in in-memory Localhost (never saved). */
  local?: boolean;
}

export interface Account {
  id: string;
  name: string;
  username: string;
  password: string;
  identity_file: string;
}

export interface Bookmark {
  id: string;
  name: string;
  command: string;
}

export interface OpenedHostState {
  hostName: string;
  tabCount: number;
}

/** camelCase: Rust AppSettings uses #[serde(rename_all = "camelCase")]. */
export interface AppSettings {
  schemaVersion: number;
  windowWidth: number;
  windowHeight: number;
  windowMaximized: boolean;
  panelSize: number;
  hostsFolder: string;
  openedHosts: OpenedHostState[];
  terminalBackgroundColor: string;
  terminalFont: string;
  terminalFontSize: number;
  useDarkTheme: boolean;
  restoreHosts: boolean;
  syncSshConfig: boolean;
  encryptData: boolean;
  scrollbackLines: number;
  audibleBell: boolean;
  collapsedGroups: string[];
}

/** Must match AppSettings::default() in src-tauri/src/settings.rs. */
export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: 1,
  windowWidth: 1100,
  windowHeight: 640,
  windowMaximized: false,
  panelSize: 240,
  hostsFolder: "~/.config/fastssh",
  openedHosts: [],
  terminalBackgroundColor: "#1e1e1e",
  terminalFont: "Ubuntu Mono, Noto Sans Mono, monospace",
  terminalFontSize: 13,
  useDarkTheme: true,
  restoreHosts: false,
  syncSshConfig: false,
  encryptData: false,
  scrollbackLines: -1,
  audibleBell: true,
  collapsedGroups: [],
};

/** The built-in in-memory host of the local shell (R8). */
export const LOCALHOST_ID = "local-localhost";

/** Injected at the front of the library after load; never saved to disk
 *  (Rust save_hosts drops local === true). */
export const LOCALHOST_HOST: Host = {
  id: LOCALHOST_ID,
  name: "Localhost",
  group: "Local",
  host: "",
  port: 22,
  username: "",
  password: "",
  identity_file: "",
  account: "",
  color: "",
  font: "",
  tunnels: "",
  extra_arguments: "",
  ssh_config: "",
  local: true,
};
