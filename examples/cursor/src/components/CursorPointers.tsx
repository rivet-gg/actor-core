import { type CursorState } from '../cursor-room';

interface CursorPointersProps {
  cursors: Record<string, CursorState>;
}

// Constants
const CURSOR_ANIMATION_DURATION = '16ms';
const CURSOR_SHADOW = '0 3px 6px rgba(0,0,0,0.2)';
const NAME_TAG_SHADOW = '0 3px 6px rgba(0,0,0,0.15)';

// Components
function CursorPointer({ cursor, id }: { cursor: CursorState; id: string }) {
  return (
    <div
      key={id}
      className="absolute w-8 h-8 transition-transform duration-[16ms] ease-linear"
      style={{
        left: cursor.x,
        top: cursor.y,
        transform: 'translate(0, 0)',
      }}
    >
      {/* Cursor pointer */}
      <svg
        width="40"
        height="40"
        viewBox="0 0 40 40"
        fill={cursor.color}
        style={{ 
          filter: `drop-shadow(${CURSOR_SHADOW})`,
          transform: 'translate(-8px, -8px)'
        }}
      >
        <path d="M4 4C4 4 30 16 30 16C30 16 20 20 20 20C20 20 16 30 16 30C16 30 4 4 4 4Z" />
      </svg>
      
      {/* Name label with modern styling */}
      <div
        className="absolute left-6 top-6 px-3 py-1.5 rounded-lg text-xs font-medium backdrop-blur-sm whitespace-nowrap"
        style={{
          backgroundColor: cursor.color,
          color: '#000000',
          boxShadow: NAME_TAG_SHADOW,
          transform: 'translateY(2px)'
        }}
      >
        <div style={{ opacity: 1, filter: 'none' }}>
          {cursor.name || 'Anonymous'}
        </div>
      </div>
    </div>
  );
}

export default function CursorPointers({ cursors }: CursorPointersProps) {
  return (
    <div className="fixed inset-0 pointer-events-none">
      {Object.entries(cursors).map(([id, cursor]) => (
        <CursorPointer key={id} cursor={cursor} id={id} />
      ))}
    </div>
  );
} 