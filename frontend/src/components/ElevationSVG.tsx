import { useRef, useCallback } from 'react';

interface ElevationSVGProps {
  svg: string;
  onTapCabinet?: (sectionId: string) => void;
}

export default function ElevationSVG({ svg, onTapCabinet }: ElevationSVGProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onTapCabinet) return;

      // Walk up from click target to find a .tappable element with data-section-id
      let target = e.target as HTMLElement | null;
      while (target && target !== containerRef.current) {
        const sectionId = target.getAttribute('data-section-id');
        if (sectionId && target.classList.contains('tappable')) {
          onTapCabinet(sectionId);
          return;
        }
        target = target.parentElement;
      }
    },
    [onTapCabinet]
  );

  return (
    <div
      ref={containerRef}
      className="w-full overflow-x-auto bg-white rounded-xl border border-gray-200 p-2"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: svg }}
      style={{ cursor: onTapCabinet ? 'pointer' : 'default' }}
    />
  );
}
