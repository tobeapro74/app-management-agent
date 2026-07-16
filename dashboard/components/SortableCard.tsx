"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { AppStatus, RecheckResult } from "@/lib/api";
import AppCard from "./AppCard";

export default function SortableCard({
  s,
  availability,
  onRecheckDone,
}: {
  s: AppStatus;
  availability?: number | null;
  onRecheckDone?: (result: RecheckResult) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: s.app_name });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      {/* 드래그 핸들 — 카드 우상단에 호버 시 표시 */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 right-2 z-10 p-1 rounded cursor-grab active:cursor-grabbing
                   opacity-0 group-hover:opacity-100 transition-opacity
                   text-slate-500 hover:text-slate-300 hover:bg-slate-700/60"
      >
        <GripVertical className="w-4 h-4" />
      </div>
      <AppCard s={s} availability={availability} onRecheckDone={onRecheckDone} />
    </div>
  );
}
