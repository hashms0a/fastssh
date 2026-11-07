/** ALL user-visible strings. Components must not hard-code UI text. */
export const strings = {
  appName: "FastSSH",
  runtimeLine: (version: string, desktop: string, session: string, appimage: boolean, dmabuf: boolean) =>
    `FastSSH ${version} - ${desktop}/${session} - AppImage: ${appimage ? "yes" : "no"} - DMABUF disabled: ${dmabuf ? "yes" : "no"}`,
  sidebarHosts: "Hosts",
  sidebarAccounts: "Accounts",
} as const;
