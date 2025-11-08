import { diffWords, Change } from 'diff';

interface DiffViewerProps {
  oldText: string;
  newText: string;
}

export const DiffViewer = ({ oldText, newText }: DiffViewerProps) => {
  const diff = diffWords(oldText, newText);

  return (
    <div className="font-mono text-sm leading-relaxed">
      {diff.map((part: Change, index: number) => {
        const className = part.added
          ? 'bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-100'
          : part.removed
          ? 'bg-red-100 dark:bg-red-900/30 text-red-900 dark:text-red-100 line-through'
          : 'text-foreground';

        return (
          <span key={index} className={className}>
            {part.value}
          </span>
        );
      })}
    </div>
  );
};
