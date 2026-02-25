import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, X, Search } from 'lucide-react';
import { listAccountsApi } from '../api/accounts';
import type { AccountItem } from '@buchungsai/shared';

// ============================================================
// AccountSelector — Autocomplete/Combobox for Kontenplan
// ============================================================

interface AccountSelectorProps {
  value: string | null;        // Current account number (e.g., "7200")
  onChange: (accountNumber: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

interface GroupedAccounts {
  category: string;
  accounts: AccountItem[];
}

function groupByCategory(accounts: AccountItem[]): GroupedAccounts[] {
  const map = new Map<string, AccountItem[]>();

  for (const account of accounts) {
    const cat = account.category || 'Sonstige';
    if (!map.has(cat)) {
      map.set(cat, []);
    }
    map.get(cat)!.push(account);
  }

  return Array.from(map.entries()).map(([category, accs]) => ({
    category,
    accounts: accs.sort((a, b) => a.sortOrder - b.sortOrder || a.number.localeCompare(b.number)),
  }));
}

export function AccountSelector({
  value,
  onChange,
  disabled = false,
  placeholder = 'Konto suchen...',
  className = '',
}: AccountSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Fetch accounts ──────────────────────────────────────────
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts-active'],
    queryFn: () => listAccountsApi({ activeOnly: true }),
    staleTime: 5 * 60 * 1000, // 5 min — Kontenplan changes rarely
  });

  // ── Derived data ────────────────────────────────────────────
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.number === value) ?? null,
    [accounts, value],
  );

  const filteredGroups = useMemo(() => {
    const term = search.toLowerCase().trim();
    const filtered = term
      ? accounts.filter(
          (a) =>
            a.number.toLowerCase().includes(term) ||
            a.name.toLowerCase().includes(term),
        )
      : accounts;

    return groupByCategory(filtered);
  }, [accounts, search]);

  // Flat list of visible accounts for keyboard navigation
  const flatFiltered = useMemo(
    () => filteredGroups.flatMap((g) => g.accounts),
    [filteredGroups],
  );

  // ── Click outside ───────────────────────────────────────────
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset highlight when search or open state changes
  useEffect(() => {
    setHighlightIndex(0);
  }, [search, isOpen]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const highlighted = listRef.current.querySelector('[data-highlighted="true"]');
    if (highlighted) {
      highlighted.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex, isOpen]);

  // ── Handlers ────────────────────────────────────────────────
  const openDropdown = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    setSearch('');
    // Focus the input after opening
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [disabled]);

  const selectAccount = useCallback(
    (account: AccountItem) => {
      onChange(account.number);
      setIsOpen(false);
      setSearch('');
    },
    [onChange],
  );

  const clearSelection = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange(null);
      setSearch('');
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
          e.preventDefault();
          openDropdown();
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightIndex((prev) => Math.min(prev + 1, flatFiltered.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (flatFiltered[highlightIndex]) {
            selectAccount(flatFiltered[highlightIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          break;
        case 'Tab':
          setIsOpen(false);
          break;
      }
    },
    [isOpen, flatFiltered, highlightIndex, selectAccount, openDropdown],
  );

  // ── Display value for the closed state ──────────────────────
  const displayValue = selectedAccount
    ? `${selectedAccount.number} \u2014 ${selectedAccount.name}`
    : '';

  // ── Render ──────────────────────────────────────────────────
  let flatIndex = -1;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger / Display */}
      {!isOpen ? (
        <button
          type="button"
          onClick={openDropdown}
          disabled={disabled}
          className={`
            w-full px-3 py-2 text-left rounded-lg border border-gray-300
            focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500
            bg-white text-sm flex items-center gap-2
            ${disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          {selectedAccount ? (
            <>
              <span className="flex-1 truncate">
                <span className="font-mono text-gray-500">{selectedAccount.number}</span>
                {' \u2014 '}
                <span className="text-gray-900">{selectedAccount.name}</span>
              </span>
              {!disabled && (
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={clearSelection}
                  className="shrink-0 p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </span>
              )}
            </>
          ) : (
            <>
              <span className="flex-1 text-gray-400 truncate">{placeholder}</span>
              <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
            </>
          )}
        </button>
      ) : (
        /* Search input when open */
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={displayValue || placeholder}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-primary-500 ring-1 ring-primary-500 focus:outline-none text-sm bg-white"
          />
        </div>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto"
          role="listbox"
        >
          {filteredGroups.length === 0 ? (
            <div className="px-3 py-4 text-sm text-gray-400 text-center">
              Kein Konto gefunden
            </div>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.category}>
                {/* Category header */}
                <div className="px-3 py-1 text-xs font-semibold text-gray-500 bg-gray-50 sticky top-0">
                  {group.category}
                </div>

                {/* Account options */}
                {group.accounts.map((account) => {
                  flatIndex++;
                  const idx = flatIndex;
                  const isHighlighted = idx === highlightIndex;
                  const isSelected = account.number === value;

                  return (
                    <div
                      key={account.id}
                      role="option"
                      aria-selected={isSelected}
                      data-highlighted={isHighlighted}
                      onClick={() => selectAccount(account)}
                      onMouseEnter={() => setHighlightIndex(idx)}
                      className={`
                        px-3 py-2 cursor-pointer text-sm flex items-center gap-2
                        ${isHighlighted ? 'bg-primary-100' : 'hover:bg-primary-50'}
                      `}
                    >
                      <span className="font-mono text-gray-500 shrink-0 w-12">
                        {account.number}
                      </span>
                      <span className="text-gray-300">&mdash;</span>
                      <span className="flex-1 truncate text-gray-900">
                        {account.name}
                      </span>
                      {isSelected && (
                        <span className="shrink-0 text-primary-600 text-xs font-medium">
                          &#10003;
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
