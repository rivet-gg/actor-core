import React from 'react';
import { type CursorState } from '../cursor-room';

interface CursorListProps {
  cursors: Record<string, CursorState>;
}

function UserListItem({ cursor }: { cursor: CursorState }) {
  return (
    <li className="flex items-center gap-2 text-white">
      <div
        className="w-2 h-2 rounded-full ring-2 ring-white/20"
        style={{ backgroundColor: cursor.color }}
      />
      <span className="text-xs font-medium">
        {cursor.name || 'Anonymous'} 
        <span className="text-white/70 ml-1.5 text-[10px]">
          ({Math.round(cursor.x)}, {Math.round(cursor.y)})
        </span>
      </span>
    </li>
  );
}

export default function CursorList({ cursors }: CursorListProps) {
  return (
    <div className="fixed bottom-6 right-6 bg-white/5 backdrop-blur-sm border border-white/10 p-4 rounded-2xl shadow-lg z-50">
      <h2 className="text-xs font-semibold text-white mb-2">Connected Users</h2>
      <ul className="space-y-2">
        {Object.entries(cursors).map(([id, cursor]) => (
          <UserListItem key={id} cursor={cursor} />
        ))}
      </ul>
    </div>
  );
} 