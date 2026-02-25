import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listAccountsApi,
  createAccountApi,
  updateAccountApi,
  deactivateAccountApi,
  seedAccountsApi,
} from '../api/accounts';
import type { AccountItem } from '@buchungsai/shared';
import {
  Search, X, Plus, Loader2, ChevronDown, ChevronRight,
  BookOpen, Trash2, Database,
} from 'lucide-react';
import { useIsMobile } from '../hooks/useIsMobile';

// ============================================================
// Constants
// ============================================================

const typeColors: Record<string, string> = {
  EXPENSE: 'bg-red-100 text-red-700',
  REVENUE: 'bg-green-100 text-green-700',
  ASSET: 'bg-blue-100 text-blue-700',
  LIABILITY: 'bg-orange-100 text-orange-700',
  EQUITY: 'bg-purple-100 text-purple-700',
};

const typeLabels: Record<string, string> = {
  EXPENSE: 'Aufwand',
  REVENUE: 'Erlös',
  ASSET: 'Aktiva',
  LIABILITY: 'Passiva',
  EQUITY: 'Eigenkapital',
};

const typeFilterTabs = ['Alle', 'EXPENSE', 'REVENUE', 'ASSET', 'EQUITY'] as const;

// ============================================================
// Main Component
// ============================================================

export function AccountsPage() {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  // --- State ---
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('Alle');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);

  // --- Queries ---
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => listAccountsApi(),
  });

  // --- Mutations ---
  const createMutation = useMutation({
    mutationFn: createAccountApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setShowAddDialog(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateAccountApi>[1] }) =>
      updateAccountApi(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setEditingId(null);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateAccountApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setConfirmDeactivateId(null);
    },
  });

  const seedMutation = useMutation({
    mutationFn: seedAccountsApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  // --- Filtering ---
  const filtered = useMemo(() => {
    let result = accounts;
    if (typeFilter !== 'Alle') {
      result = result.filter((a) => a.type === typeFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (a) =>
          a.number.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q),
      );
    }
    return result;
  }, [accounts, typeFilter, search]);

  // --- Type counts ---
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { Alle: accounts.length };
    for (const a of accounts) {
      counts[a.type] = (counts[a.type] || 0) + 1;
    }
    return counts;
  }, [accounts]);

  // --- Grouping by category ---
  const grouped = useMemo(() => {
    const groups = new Map<string, AccountItem[]>();
    for (const account of filtered) {
      const cat = account.category || 'Ohne Kategorie';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(account);
    }
    // Sort groups by first account's sortOrder
    const sorted = [...groups.entries()].sort((a, b) => {
      const aSort = a[1][0]?.sortOrder ?? 0;
      const bSort = b[1][0]?.sortOrder ?? 0;
      return aSort - bSort;
    });
    return sorted;
  }, [filtered]);

  // --- Group toggle ---
  function toggleGroup(category: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 lg:mb-6">
        <div className="flex items-center gap-3">
          {!isMobile && <BookOpen className="text-primary-600" size={28} />}
          <div>
            <h1 className={isMobile ? 'text-lg font-bold' : 'text-2xl font-bold'}>Kontenplan</h1>
            <p className="text-sm text-gray-500">
              {accounts.length} Konten
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {accounts.length === 0 && (
            <button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              {seedMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Database size={14} />
              )}
              Standard-Konten laden
            </button>
          )}
          <button
            onClick={() => setShowAddDialog(true)}
            className="btn-primary flex items-center gap-1.5"
          >
            <Plus size={16} />
            <span className={isMobile ? 'sr-only' : ''}>Konto hinzufügen</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche: Kontonummer, Bezeichnung..."
            className="input-field pl-10 pr-10"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Type Filter Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {typeFilterTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setTypeFilter(tab)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              typeFilter === tab
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab === 'Alle' ? 'Alle' : typeLabels[tab] || tab}
            <span className="ml-1.5 text-xs opacity-75">
              {typeCounts[tab] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className={isMobile ? '' : 'card'}>
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="animate-spin text-primary-600" size={32} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <BookOpen size={48} className="mb-3 opacity-50" />
            <p>Keine Konten gefunden</p>
            {accounts.length === 0 && (
              <p className="text-xs mt-1">Laden Sie die Standard-Konten oder legen Sie ein neues Konto an</p>
            )}
          </div>
        ) : (
          <div>
            {grouped.map(([category, items]) => (
              <AccountGroup
                key={category}
                category={category}
                accounts={items}
                isCollapsed={collapsedGroups.has(category)}
                onToggle={() => toggleGroup(category)}
                isMobile={isMobile}
                editingId={editingId}
                onStartEdit={setEditingId}
                onSaveEdit={(id, data) => updateMutation.mutate({ id, data })}
                onCancelEdit={() => setEditingId(null)}
                confirmDeactivateId={confirmDeactivateId}
                onConfirmDeactivate={setConfirmDeactivateId}
                onDeactivate={(id) => deactivateMutation.mutate(id)}
                isSaving={updateMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Account Dialog */}
      {showAddDialog && (
        <AddAccountDialog
          onClose={() => setShowAddDialog(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isPending={createMutation.isPending}
          error={createMutation.isError ? (createMutation.error as Error).message : null}
        />
      )}
    </div>
  );
}

// ============================================================
// Account Group (collapsible category)
// ============================================================

function AccountGroup({
  category,
  accounts,
  isCollapsed,
  onToggle,
  isMobile,
  editingId,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  confirmDeactivateId,
  onConfirmDeactivate,
  onDeactivate,
  isSaving,
}: {
  category: string;
  accounts: AccountItem[];
  isCollapsed: boolean;
  onToggle: () => void;
  isMobile: boolean;
  editingId: string | null;
  onStartEdit: (id: string) => void;
  onSaveEdit: (id: string, data: { name?: string; category?: string | null; taxCode?: string | null }) => void;
  onCancelEdit: () => void;
  confirmDeactivateId: string | null;
  onConfirmDeactivate: (id: string | null) => void;
  onDeactivate: (id: string) => void;
  isSaving: boolean;
}) {
  return (
    <div className="mt-4 first:mt-0">
      {/* Category header */}
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full text-left px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
      >
        {isCollapsed ? (
          <ChevronRight size={16} className="text-gray-400" />
        ) : (
          <ChevronDown size={16} className="text-gray-400" />
        )}
        <span className="text-sm font-semibold text-gray-600">{category}</span>
        <span className="text-xs text-gray-400">({accounts.length})</span>
      </button>

      {/* Content */}
      {!isCollapsed && (
        isMobile ? (
          <div className="space-y-2 mt-2">
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                isEditing={editingId === account.id}
                onStartEdit={() => onStartEdit(account.id)}
                onSaveEdit={(data) => onSaveEdit(account.id, data)}
                onCancelEdit={onCancelEdit}
                isConfirmingDeactivate={confirmDeactivateId === account.id}
                onConfirmDeactivate={() => onConfirmDeactivate(account.id)}
                onCancelDeactivate={() => onConfirmDeactivate(null)}
                onDeactivate={() => onDeactivate(account.id)}
                isSaving={isSaving}
              />
            ))}
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 mt-1">
            <thead>
              <tr className="text-left text-gray-500 text-xs uppercase tracking-wider">
                <th className="px-4 py-2">Kontonr.</th>
                <th className="px-4 py-2">Bezeichnung</th>
                <th className="px-4 py-2">Typ</th>
                <th className="px-4 py-2">Steuercode</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {accounts.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  isEditing={editingId === account.id}
                  onStartEdit={() => onStartEdit(account.id)}
                  onSaveEdit={(data) => onSaveEdit(account.id, data)}
                  onCancelEdit={onCancelEdit}
                  isConfirmingDeactivate={confirmDeactivateId === account.id}
                  onConfirmDeactivate={() => onConfirmDeactivate(account.id)}
                  onCancelDeactivate={() => onConfirmDeactivate(null)}
                  onDeactivate={() => onDeactivate(account.id)}
                  isSaving={isSaving}
                />
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}

// ============================================================
// Desktop: Table Row (view + inline edit)
// ============================================================

function AccountRow({
  account,
  isEditing,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  isConfirmingDeactivate,
  onConfirmDeactivate,
  onCancelDeactivate,
  onDeactivate,
  isSaving,
}: {
  account: AccountItem;
  isEditing: boolean;
  onStartEdit: () => void;
  onSaveEdit: (data: { name?: string; category?: string | null; taxCode?: string | null }) => void;
  onCancelEdit: () => void;
  isConfirmingDeactivate: boolean;
  onConfirmDeactivate: () => void;
  onCancelDeactivate: () => void;
  onDeactivate: () => void;
  isSaving: boolean;
}) {
  const [editName, setEditName] = useState(account.name);
  const [editCategory, setEditCategory] = useState(account.category || '');
  const [editTaxCode, setEditTaxCode] = useState(account.taxCode || '');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setEditName(account.name);
      setEditCategory(account.category || '');
      setEditTaxCode(account.taxCode || '');
      // Focus name field after a tick
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [isEditing, account.name, account.category, account.taxCode]);

  function handleSave() {
    onSaveEdit({
      name: editName.trim() || account.name,
      category: editCategory.trim() || null,
      taxCode: editTaxCode.trim() || null,
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onCancelEdit();
  }

  if (isEditing) {
    return (
      <tr className="bg-primary-50">
        <td className="px-4 py-2">
          <span className="font-mono text-sm text-gray-700">{account.number}</span>
        </td>
        <td className="px-4 py-2">
          <input
            ref={nameRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            className="input-field text-sm py-1 px-2"
          />
        </td>
        <td className="px-4 py-2">
          <TypeBadge type={account.type} />
        </td>
        <td className="px-4 py-2">
          <input
            type="text"
            value={editTaxCode}
            onChange={(e) => setEditTaxCode(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="z.B. V20"
            className="input-field text-sm py-1 px-2 w-24"
          />
        </td>
        <td className="px-4 py-2">
          <StatusBadge isActive={account.isActive} />
        </td>
        <td className="px-4 py-2">
          <button
            onClick={(e) => { e.stopPropagation(); onCancelEdit(); }}
            className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600"
            title="Abbrechen"
          >
            <X size={14} />
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr
      onClick={onStartEdit}
      className={`hover:bg-gray-50 cursor-pointer transition-colors ${
        !account.isActive ? 'opacity-50' : ''
      }`}
    >
      <td className="px-4 py-2">
        <span className="font-mono text-sm text-gray-700">{account.number}</span>
      </td>
      <td className="px-4 py-2">
        <span className="text-sm text-gray-900">{account.name}</span>
      </td>
      <td className="px-4 py-2">
        <TypeBadge type={account.type} />
      </td>
      <td className="px-4 py-2">
        {account.taxCode ? (
          <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{account.taxCode}</span>
        ) : (
          <span className="text-gray-300 text-xs">&mdash;</span>
        )}
      </td>
      <td className="px-4 py-2">
        <StatusBadge isActive={account.isActive} />
      </td>
      <td className="px-4 py-2">
        {isConfirmingDeactivate ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onDeactivate}
              className="text-xs text-red-600 hover:text-red-800 font-medium"
            >
              Ja
            </button>
            <span className="text-gray-300 text-xs">/</span>
            <button
              onClick={onCancelDeactivate}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Nein
            </button>
          </div>
        ) : (
          account.isActive && (
            <button
              onClick={(e) => { e.stopPropagation(); onConfirmDeactivate(); }}
              className="p-1 hover:bg-red-50 rounded text-gray-300 hover:text-red-500 transition-colors"
              title="Deaktivieren"
            >
              <Trash2 size={14} />
            </button>
          )
        )}
      </td>
    </tr>
  );
}

// ============================================================
// Mobile: Card (view + inline edit)
// ============================================================

function AccountCard({
  account,
  isEditing,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  isConfirmingDeactivate,
  onConfirmDeactivate,
  onCancelDeactivate,
  onDeactivate,
  isSaving,
}: {
  account: AccountItem;
  isEditing: boolean;
  onStartEdit: () => void;
  onSaveEdit: (data: { name?: string; category?: string | null; taxCode?: string | null }) => void;
  onCancelEdit: () => void;
  isConfirmingDeactivate: boolean;
  onConfirmDeactivate: () => void;
  onCancelDeactivate: () => void;
  onDeactivate: () => void;
  isSaving: boolean;
}) {
  const [editName, setEditName] = useState(account.name);
  const [editCategory, setEditCategory] = useState(account.category || '');
  const [editTaxCode, setEditTaxCode] = useState(account.taxCode || '');

  useEffect(() => {
    if (isEditing) {
      setEditName(account.name);
      setEditCategory(account.category || '');
      setEditTaxCode(account.taxCode || '');
    }
  }, [isEditing, account.name, account.category, account.taxCode]);

  function handleSave() {
    onSaveEdit({
      name: editName.trim() || account.name,
      category: editCategory.trim() || null,
      taxCode: editTaxCode.trim() || null,
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onCancelEdit();
  }

  if (isEditing) {
    return (
      <div className="rounded-lg border-2 border-primary-300 bg-primary-50 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-sm font-medium text-gray-700">{account.number}</span>
          <TypeBadge type={account.type} />
        </div>
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-0.5">Bezeichnung</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="input-field text-sm py-1 px-2"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-0.5">Kategorie</label>
            <input
              type="text"
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
              onKeyDown={handleKeyDown}
              className="input-field text-sm py-1 px-2"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-0.5">Steuercode</label>
            <input
              type="text"
              value={editTaxCode}
              onChange={(e) => setEditTaxCode(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="z.B. V20"
              className="input-field text-sm py-1 px-2"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn-primary text-xs flex-1 py-1.5"
          >
            {isSaving ? <Loader2 size={12} className="animate-spin mx-auto" /> : 'Speichern'}
          </button>
          <button
            onClick={onCancelEdit}
            className="btn-secondary text-xs flex-1 py-1.5"
          >
            Abbrechen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onStartEdit}
      className={`rounded-lg border border-gray-200 p-3 cursor-pointer hover:bg-gray-50 transition-colors ${
        !account.isActive ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium text-gray-700">{account.number}</span>
            <TypeBadge type={account.type} />
            <StatusBadge isActive={account.isActive} />
          </div>
          <div className="text-sm text-gray-900 mt-0.5 truncate">{account.name}</div>
          {account.taxCode && (
            <span className="font-mono text-[10px] bg-gray-100 px-1.5 py-0.5 rounded mt-1 inline-block">
              {account.taxCode}
            </span>
          )}
        </div>
        {account.isActive && (
          isConfirmingDeactivate ? (
            <div className="flex items-center gap-2 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={onDeactivate}
                className="text-xs text-red-600 hover:text-red-800 font-medium"
              >
                Ja
              </button>
              <span className="text-gray-300 text-xs">/</span>
              <button
                onClick={onCancelDeactivate}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Nein
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onConfirmDeactivate(); }}
              className="p-1 hover:bg-red-50 rounded text-gray-300 hover:text-red-500 transition-colors shrink-0 ml-2"
              title="Deaktivieren"
            >
              <Trash2 size={14} />
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ============================================================
// Add Account Dialog
// ============================================================

function AddAccountDialog({
  onClose,
  onSubmit,
  isPending,
  error,
}: {
  onClose: () => void;
  onSubmit: (data: { number: string; name: string; type: string; category?: string | null; taxCode?: string | null }) => void;
  isPending: boolean;
  error: string | null;
}) {
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('EXPENSE');
  const [category, setCategory] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);

    if (!/^\d{4}$/.test(number)) {
      setValidationError('Kontonummer muss genau 4 Ziffern haben');
      return;
    }
    if (!name.trim()) {
      setValidationError('Bezeichnung ist erforderlich');
      return;
    }

    onSubmit({
      number,
      name: name.trim(),
      type,
      category: category.trim() || null,
      taxCode: taxCode.trim() || null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Konto hinzufügen</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Kontonummer <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="z.B. 5000"
              maxLength={4}
              className="input-field font-mono"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-0.5">Genau 4 Ziffern</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bezeichnung <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Betriebsausgaben allgemein"
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Typ</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="input-field"
            >
              {Object.entries(typeLabels).map(([key, label]) => (
                <option key={key} value={key}>{label} ({key})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kategorie</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="z.B. Betriebsausgaben"
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Steuercode</label>
            <input
              type="text"
              value={taxCode}
              onChange={(e) => setTaxCode(e.target.value)}
              placeholder="z.B. V20, V13, V10"
              className="input-field"
            />
          </div>

          {/* Errors */}
          {(validationError || error) && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {validationError || error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="btn-primary flex-1 flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              Anlegen
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="btn-secondary flex-1"
            >
              Abbrechen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Shared Sub-Components
// ============================================================

function TypeBadge({ type }: { type: string }) {
  const colors = typeColors[type] || 'bg-gray-100 text-gray-600';
  const label = typeLabels[type] || type;
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors}`}>
      {label}
    </span>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
      Aktiv
    </span>
  ) : (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">
      Inaktiv
    </span>
  );
}
