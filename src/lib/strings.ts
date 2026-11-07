import type { Host } from "../types/models";
import { LOCALHOST_ID } from "../types/models";

/** ALL user-visible strings. Components must not hard-code UI text. */
export const strings = {
  appName: "FastSSH",
  runtimeLine: (version: string, desktop: string, session: string, appimage: boolean, dmabuf: boolean) =>
    `FastSSH ${version} - ${desktop}/${session} - AppImage: ${appimage ? "yes" : "no"} - DMABUF disabled: ${dmabuf ? "yes" : "no"}`,
  sidebarHosts: "Hosts",
  sidebarAccounts: "Accounts",
  bootErrorTitle: "FastSSH could not load its library",
  quit: "Quit",
  dismiss: "Dismiss",
  loading: "Loading\u2026",
  comingSoon: "Coming soon",
  // Header bar (Stage 2)
  newConnection: "New Connection",
  localShell: "Local Shell",
  bookmarks: "Bookmarks",
  filterPlaceholder: "Filter connections\u2026",
  menu: "Menu",
  preferences: "Preferences",
  importEasyssh: "Import from EasySSH",
  about: "About",
  // Sidebar (Stage 2)
  groupCount: (n: number) => `${n}`,
  hostSubtitle: (host: Host) =>
    host.id === LOCALHOST_ID ? "local shell" : `${host.username ? `${host.username}@` : ""}${host.host}:${host.port}`,
  // Workspace (Stage 2)
  noConnections: "No connections yet",
  noAccounts: "No shared accounts",
  newAccount: "New Account",
  connect: "Connect",
  edit: "Edit",
  duplicate: "Duplicate",
  remove: "Remove",
  collapseGroup: (name: string) => `${name} (collapse/expand group)`,
} as const;
