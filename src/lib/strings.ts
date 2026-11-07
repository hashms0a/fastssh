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
  // Editors (Stage 3)
  editorNewConnection: "New Connection",
  editorEditConnection: "Edit Connection",
  editorNewAccount: "New Account",
  editorEditAccount: "Edit Account",
  sectionBasic: "Basic",
  sectionAppearance: "Appearance",
  sectionTunnels: "Tunnels",
  sectionAdvanced: "Advanced",
  labelName: "Name",
  labelGroup: "Group",
  labelHost: "Host",
  labelPort: "Port",
  labelAccount: "Account",
  accountNone: "(no account)",
  labelUsername: "Username",
  labelPassword: "Password",
  labelIdentity: "Identity File",
  labelColor: "Color",
  labelFont: "Font",
  labelExtraArgs: "Extra arguments",
  labelSshConfig: "ssh_config block",
  useDefault: "use default",
  browse: "Browse\u2026",
  show: "show",
  hide: "hide",
  addTunnel: "Add tunnel",
  save: "Save",
  cancel: "Cancel",
  confirmOk: "OK",
  passwordHint: "Passwords are stored unencrypted. Enable encryption in Preferences.",
  newTabsNote: "Open tabs keep the session they connected with; changes apply to new tabs.",
  savedConnection: (name: string) => `Saved ${name}`,
  savedAccount: (name: string) => `Saved ${name}`,
  removedConnection: (name: string) => `Removed ${name}`,
  removedAccount: (name: string) => `Removed ${name}`,
  removeConnectionConfirm: (name: string) => `Remove ${name}?`,
  removeAccountConfirm: (n: number) =>
    n === 1
      ? "1 host uses this account. It will keep the current credentials and be unlinked."
      : `${n} hosts use this account. They will keep the current credentials and be unlinked.`,
  // Validation (validateHost message keys)
  validation: {
    nameRequired: "Name is required",
    nameTaken: "Name is already taken",
    nameChars: "Name may not contain * ? ! # , or quotes",
    hostRequired: "Host is required",
    portRange: "Port must be between 1 and 65535",
    tunnelsInvalid: 'Tunnel must look like "-L 8080:localhost:80"',
    accountNameRequired: "Name is required",
  },
} as const;

/** Key of a message shown next to an invalid editor field. */
export type ValidationKey = keyof typeof strings.validation;
