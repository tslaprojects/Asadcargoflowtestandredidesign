import { Check, Download, Eye, FileText, Minus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/common/filter-bar";
import { EmptyState, PageHeader } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { StatusBadge } from "@/components/common/status-badge";
import { formatDateTime, formatFileSize } from "@/lib/format";
import { enumOptions, label } from "@/lib/i18n";
import { toPlain } from "@/lib/serialize";
import { cn } from "@/lib/utils";
import { pageActor, pageNum, sp, type SearchParams } from "@/server/page-context";
import { listMyDocuments } from "@/server/services/document.service";

export const metadata: Metadata = { title: "Документы" };

/** Ключевой пакет документов перевозки — показывается как чек-лист в контексте рейса. */
const CORE = ["CMR", "INVOICE", "PACKING_LIST", "PROOF_OF_DELIVERY"] as const;

/**
 * Документы в контексте перевозок: по каждому рейсу — пакет (CMR, счёт, упаковочный лист, POD) и файлы.
 * Открытие, скачивание и загрузка — как раньше (загрузка и замена — в карточке перевозки).
 */
export default async function DocumentsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActor();
  const params = await searchParams;
  const type = sp(params, "type");
  const valid = enumOptions("DocumentType").some((o) => o.value === type);
  const data = toPlain(
    await listMyDocuments(actor, { page: pageNum(params), pageSize: 60, q: sp(params, "q"), type: valid ? (type as "CMR") : undefined }),
  );
  type Doc = (typeof data.items)[number];
  const groups = new Map<string, { order: Doc["order"]; docs: Doc[] }>();
  for (const d of data.items) {
    const g = groups.get(d.order.id) ?? { order: d.order, docs: [] };
    g.docs.push(d);
    groups.set(d.order.id, g);
  }

  return (
    <>
      <PageHeader title="Документы" description="Пакеты документов по перевозкам. Файлы выдаются только участникам сделки." />
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: "Имя файла или номер перевозки" },
          {
            type: "select",
            name: "type",
            label: "Тип документа",
            options: enumOptions("DocumentType").filter((o) => o.value !== "CONTRACT"),
          },
        ]}
      />
      {groups.size === 0 ? (
        <EmptyState
          icon={FileText}
          title="Документов пока нет"
          description="CMR, счёт, упаковочный лист и подтверждение доставки загружаются в карточке перевозки — во вкладке «Документы»."
        />
      ) : (
        <div className="space-y-3" data-testid="document-groups">
          {[...groups.values()].map(({ order, docs }) => {
            const present = new Set(docs.map((d) => d.type));
            return (
              <section
                key={order.id}
                className="border-border bg-card overflow-hidden rounded-lg border"
                aria-labelledby={`dg-${order.id}`}
              >
                <header className="border-border bg-surface-secondary flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-4 py-2.5">
                  <h2 id={`dg-${order.id}`} className="text-sm font-semibold">
                    <Link href={`/orders/${order.id}?tab=documents`} className="hover:text-primary">
                      <span className="id-code text-muted-foreground mr-2 text-xs font-medium">{order.publicNumber}</span>
                      {order.load.originCity} → {order.load.destinationCity}
                    </Link>
                  </h2>
                  <StatusBadge kind="OrderStatus" value={order.currentStatus} />
                  <ul className="ml-auto flex flex-wrap gap-1.5" aria-label="Пакет документов">
                    {CORE.map((t) => (
                      <li
                        key={t}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs",
                          present.has(t) ? "border-success-border bg-success-bg text-success" : "border-border text-muted-foreground",
                        )}
                      >
                        {present.has(t) ? <Check className="size-3" aria-hidden /> : <Minus className="size-3" aria-hidden />}
                        {t === "PROOF_OF_DELIVERY" ? "POD" : label("DocumentType", t)}
                        <span className="sr-only">{present.has(t) ? " — есть" : " — нет"}</span>
                      </li>
                    ))}
                  </ul>
                </header>
                <ul className="divide-border divide-y">
                  {docs.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                      <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{d.filename}</span>
                        <span className="text-meta">
                          {label("DocumentType", d.type)} · {formatFileSize(d.size)} · {formatDateTime(d.createdAt)}
                        </span>
                      </span>
                      <span className="inline-flex gap-3">
                        <a
                          className="text-primary inline-flex min-h-8 items-center gap-1 hover:underline"
                          href={`/api/documents/${d.id}/download?inline=1`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Eye className="size-4" aria-hidden /> Открыть
                        </a>
                        <a
                          className="text-primary inline-flex min-h-8 items-center gap-1 hover:underline"
                          href={`/api/documents/${d.id}/download`}
                        >
                          <Download className="size-4" aria-hidden /> Скачать
                        </a>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/documents" searchParams={params} />
    </>
  );
}
