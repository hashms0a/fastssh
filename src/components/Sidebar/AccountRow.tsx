import { useState } from "react";
import type { Account } from "../../types/models";
import { strings } from "../../lib/strings";
import { duplicateAccountAction, editAccount, removeAccountAction } from "../../lib/editorActions";
import { useAppStore } from "../../store/useAppStore";
import { ContextMenu } from "../ContextMenu";

interface Props {
  account: Account;
  selected: boolean;
}

/**
 * One shared-account row (R2). Edit/Duplicate/Remove open the editors.
 * Task 12.5: `option` in the listbox, Enter opens the editor, Space selects.
 */
export function AccountRow({ account, selected }: Props) {
  const selectAccount = useAppStore((s) => s.selectAccount);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <div
      data-testid="account-row"
      data-name={account.name}
      data-id={account.id}
      role="option"
      tabIndex={0}
      aria-selected={selected}
      className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm ${
        selected ? "bg-[var(--accent)] text-[var(--on-accent)]" : "hover:bg-[var(--bg)]"
      }`}
      onClick={() => selectAccount(account.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          editAccount(account);
        } else if (e.key === " ") {
          e.preventDefault();
          selectAccount(account.id);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{account.name}</span>
        <span className={`block truncate text-xs ${selected ? "text-[var(--on-accent)]" : "text-[var(--muted)]"}`}>
          {account.username}
        </span>
      </span>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: strings.edit, run: () => editAccount(account) },
            { label: strings.duplicate, run: () => duplicateAccountAction(account) },
            { label: strings.remove, run: () => void removeAccountAction(account) },
          ]}
        />
      )}
    </div>
  );
}
