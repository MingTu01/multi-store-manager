import { Virtuoso, VirtuosoGrid } from 'react-virtuoso';
import type { ComponentProps } from 'react';

interface VirtualListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  estimateSize?: number;
  overscan?: number;
  className?: string;
  grid?: boolean;
  gridClassName?: string;
  endReached?: () => void;
  emptyContent?: React.ReactNode;
  style?: React.CSSProperties;
}

export function VirtualList<T extends { id?: number | string }>({
  items,
  renderItem,
  overscan = 5,
  className = '',
  grid = false,
  gridClassName = '',
  endReached,
  emptyContent,
  style,
}: VirtualListProps<T>) {
  if (items.length === 0 && emptyContent) {
    return <>{emptyContent}</>;
  }

  if (grid) {
    return (
      <VirtuosoGrid
        useWindowScroll
        totalCount={items.length}
        overscan={overscan}
        endReached={endReached}
        className={className}
        listClassName={gridClassName}
        itemContent={(index) => renderItem(items[index], index)}
        components={{
          ScrollSeekPlaceholder: () => (
            <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
          ),
        }}
        scrollSeekConfiguration={{
          enter: (velocity) => Math.abs(velocity) > 800,
          exit: (velocity) => Math.abs(velocity) < 100,
        }}
      />
    );
  }

  return (
    <Virtuoso
      useWindowScroll
      totalCount={items.length}
      overscan={overscan}
      endReached={endReached}
      className={className}
      style={style}
      itemContent={(index) => renderItem(items[index], index)}
      components={{
        ScrollSeekPlaceholder: () => (
          <div className="mb-2 h-16 animate-pulse rounded-xl bg-slate-100" />
        ),
      }}
      scrollSeekConfiguration={{
        enter: (velocity) => Math.abs(velocity) > 800,
        exit: (velocity) => Math.abs(velocity) < 100,
      }}
    />
  );
}
