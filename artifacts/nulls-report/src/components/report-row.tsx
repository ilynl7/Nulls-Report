import { Link } from 'wouter';
import { ChevronRight } from 'lucide-react';
import type { ReportSummary } from '@workspace/api-client-react';
import { CATEGORIES, priorityInfo } from '@/lib/catalog';
import { CategoryMark, GameBadge, StatusBadge } from '@/components/portal-ui';
import { timeAgo } from '@/lib/format';

export function ReportRow({ report }: { report: ReportSummary }) {
  const category = CATEGORIES[report.category];
  const priority = priorityInfo(report.priority);
  return (
    <Link
      href={`/reports/${report.id}`}
      className="group grid w-full grid-cols-[1fr_auto] gap-4 px-4 py-4 text-left transition hover:bg-[#fffcf5] sm:grid-cols-[minmax(250px,1.5fr)_150px_150px_120px_auto_24px] sm:items-center sm:px-5"
    >
      <div className="flex min-w-0 items-center gap-3">
        <CategoryMark category={report.category} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-medium text-[#a0a7af]">{report.ticketNumber}</span>
            <GameBadge game={report.game} small />
            <span className={`hidden rounded px-1.5 py-0.5 text-[9px] font-bold sm:inline-block ${priority.cls}`}>
              {priority.label}
            </span>
          </div>
          <p className="mt-1 truncate text-[13px] font-bold text-[#2d394b] group-hover:text-[#ef6358]">{report.title}</p>
          <p className="mt-0.5 truncate text-[11px] text-[#89929f]">
            {report.subtype} · {timeAgo(report.createdAt)}
          </p>
        </div>
      </div>
      <div className="hidden text-xs sm:block">
        <span className="block font-medium text-[#536174]">{category?.label ?? report.category}</span>
        <span className="mt-1 block text-[10px] text-[#a0a7af]">{report.ownerName}</span>
      </div>
      <div className="hidden text-xs sm:block">
        <span className="block text-[10px] uppercase tracking-wider text-[#a0a7af]">Updated</span>
        <span className="mt-1 block text-[11px] font-semibold text-[#596677]">{timeAgo(report.updatedAt)}</span>
      </div>
      <span className="self-start sm:self-auto">
        <StatusBadge status={report.status} />
      </span>
      {report.allowUserMessages && (
        <span className="hidden rounded-md bg-[#fff6df] px-1.5 py-0.5 text-[9px] font-bold text-[#936b16] sm:inline-block">
          Reply open
        </span>
      )}
      <ChevronRight size={16} className="hidden text-[#b4bbc4] transition group-hover:translate-x-0.5 group-hover:text-[#ef6358] sm:block" />
    </Link>
  );
}
