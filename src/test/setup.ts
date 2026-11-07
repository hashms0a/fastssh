import "@testing-library/jest-dom/vitest";
import { installIpcMock } from "./ipcMock";

/** Fresh recording IPC mock (in-memory backend) before each test. */
installIpcMock();
