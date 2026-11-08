import { useEffect, useRef, useState } from "react";
import { ipc } from "../lib/ipc";
import { logError } from "../lib/log";
import { useAppStore } from "../store/useAppStore";
import type { PassModalMode } from "../store/slices/uiSlice";

/**
 * Task 10.5: the Preferences "Encrypt data" switch (R6, R18).
 *
 * Ticking it opens the set-passphrase modal, unticking it opens the
 * confirm-current modal; `cryptoActions` writes the flag only after Rust has
 * encrypted or decrypted the files. `available` is false when the host has no
 * `gpg`, which disables the switch with the plan's tooltip. `tick` re-mounts
 * the controlled checkbox once the modal closes, so a cancelled or failed
 * attempt shows the stored value again (the same trick `useSyncToggle` uses).
 */
export function useEncryptToggle(): {
  tick: number;
  available: boolean;
  run: (on: boolean) => void;
} {
  const passModal = useAppStore((s) => s.passModal);
  const openPassModal = useAppStore((s) => s.openPassModal);
  const [tick, setTick] = useState(0);
  const [available, setAvailable] = useState(true);
  const previous = useRef<PassModalMode | null>(passModal);

  useEffect(() => {
    // A failed probe says nothing about gpg; assume it exists so the switch
    // stays usable, but say in the log why the tooltip may be wrong (12.1).
    ipc
      .cryptoInfo()
      .then((info) => setAvailable(info.available))
      .catch((e) => {
        logError("crypto_info failed", e);
        setAvailable(true);
      });
  }, []);

  useEffect(() => {
    if (previous.current !== null && passModal === null) setTick((n) => n + 1);
    previous.current = passModal;
  }, [passModal]);

  return { tick, available, run: (on) => openPassModal(on ? "set" : "disable") };
}
