import { useState } from "react";
import type { Account } from "../../types/models";
import { strings } from "../../lib/strings";
import { useAppStore } from "../../store/useAppStore";
import { ContextMenu } from "../ContextMenu";

interface Props {
  account: Account;
  selected: boolean;
}

/** One shared-account row (R2). Edit/Duplicate/Remove wire up in Stage 3. */
export function AccountRow({ account, selected }: Props) {
  const selectAccount = useAppStore((s) => s.selectAccount);
  const pushToast = useAppStore((s) => s.pushToast);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const soon = () => pushToast(strings.comingSoon);

  return (
    <div
      data-testid="account-row"
      data-name={account.name}
      role="button"
      tabIndex={0}
      aria-selected={selected}
      className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm ${
        selected ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--bg)]"
      }`}
      onClick={() => selectAccount(account.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{account.name}</span>
        <span className={`block truncate text-xs ${selected ? "text-white/80" : "text-[var(--muted)]"}`}>
          {account.username}
        </span>
      </span>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: strings.edit, run: soon },
            { label: strings.duplicate, run: soon },
            { label: strings.remove, run: soon },
          ]}
        />
      )}
    </div>
  );
}
