"use client";

interface UserTagProps {
  id: string;
  color: string;
}

export const UserTag = ({ id, color }: UserTagProps) => {
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-xs text-white"
      style={{ backgroundColor: color }}
    >
      {id.slice(0, 8)}
    </span>
  );
};
