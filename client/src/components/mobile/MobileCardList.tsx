import { useIsMobile } from '../../hooks/useIsMobile';

interface MobileCardListProps<T> {
  items: T[];
  renderCard: (item: T, index: number) => React.ReactNode;
  renderTable: () => React.ReactNode;
  emptyState?: React.ReactNode;
}

export function MobileCardList<T>({ items, renderCard, renderTable, emptyState }: MobileCardListProps<T>) {
  const isMobile = useIsMobile();

  if (items.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  if (!isMobile) {
    return <>{renderTable()}</>;
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => renderCard(item, index))}
    </div>
  );
}
