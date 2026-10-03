import { ArrowRight, MessageCircleQuestion } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CompanyBadge, DefinitionList, EmptyState, MoneyDisplay, PageHeader } from "@/components/common/misc";
import { RouteDistance } from "@/components/common/route-distance";
import { RouteChain, RouteTimeline } from "@/components/common/route-timeline";
import { StatusBadge } from "@/components/common/status-badge";
import { UrlTabs } from "@/components/common/url-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateRange, formatDateTime, formatVolume, formatWeight } from "@/lib/format";
import { label } from "@/lib/i18n";
import { toPlain } from "@/lib/serialize";
import { AuditFeed, type AuditRow } from "@/features/audit/audit-feed";
import { DocumentList } from "@/features/documents/document-list";
import { DocumentUploader } from "@/features/documents/document-uploader";
import { AnswerQuestionForm, AskQuestionDialog, BidCard, BidDialog, type BidView } from "@/features/loads/bid-components";
import { LoadOwnerActions } from "@/features/loads/load-owner-actions";
import { MapView } from "@/features/tracking/map-view";
import { routeLines, stopPoints } from "@/features/tracking/route-line";
import { guard, pageActor } from "@/server/page-context";
import { getLoadDetail } from "@/server/services/load.service";

export const metadata: Metadata = { title: "Груз" };

export default async function LoadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await pageActor();
  const detail = toPlain(await guard(getLoadDetail(actor, id)));
  const { load, bids, ratings, relation, history } = detail;
  const isOwner = relation === "OWNER";
  const isCarrier = relation === "CARRIER";
  const canBid = isCarrier && actor.permissions.has("BID_CREATE") && (load.status === "PUBLISHED" || load.status === "BIDDING");
  const myActiveBid = isCarrier ? bids.find((b) => b.status === "PENDING") : null;
  const pendingBids = bids.filter((b) => b.status === "PENDING").length;
  const priceText =
    load.priceType === "REQUEST_QUOTE" || load.targetPrice === null ? (
      "Запрос цены"
    ) : (
      <MoneyDisplay amount={load.targetPrice} currency={load.currency} />
    );

  const overview = (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader>
          <CardTitle>Кратко</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <RouteChain stops={load.stops} className="text-base font-medium" />
          <DefinitionList
            items={[
              { label: "Загрузка", value: formatDateRange(load.loadingDateFrom, load.loadingDateTo) },
              { label: "Доставка", value: formatDateRange(load.deliveryDateFrom, load.deliveryDateTo) },
              ...(load.routeDistanceKm != null ? [{ label: "Расстояние", value: <RouteDistance route={load} /> }] : []),
              { label: "Груз", value: `${load.title} · ${label("CargoType", load.cargoType)}` },
              { label: "Вес / объём", value: `${formatWeight(load.weightKg)}${load.volumeM3 ? ` · ${formatVolume(load.volumeM3)}` : ""}` },
              { label: "Кузов", value: load.bodyType ? label("BodyType", load.bodyType) : "Любой" },
              {
                label: "Цена",
                value: (
                  <>
                    {priceText} · {label("PriceType", load.priceType)}
                  </>
                ),
              },
              ...(load.clientName ? [{ label: "Клиент", value: load.clientName }] : []),
              { label: "Видимость", value: label("LoadVisibility", load.visibility) },
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Заказчик</CardTitle>
        </CardHeader>
        <CardContent className="text-body space-y-2">
          <CompanyBadge
            id={load.company.id}
            name={load.company.legalName}
            verification={load.company.verificationStatus}
            rating={ratings[load.company.id]}
          />
          <p className="text-muted-foreground">
            {load.company.city}
            {isOwner && ` · создал ${load.createdBy.firstName} ${load.createdBy.lastName}`}
          </p>
          {load.publishedAt && <p className="text-muted-foreground">Опубликован: {formatDateTime(load.publishedAt)}</p>}
        </CardContent>
      </Card>
    </div>
  );

  const cargo = (
    <Card>
      <CardContent className="pt-5">
        <DefinitionList
          items={[
            { label: "Название", value: load.title },
            { label: "Тип груза", value: label("CargoType", load.cargoType) },
            { label: "Описание", value: load.cargoDescription ?? "—" },
            { label: "Вес", value: formatWeight(load.weightKg) },
            { label: "Объём", value: formatVolume(load.volumeM3) },
            { label: "Количество мест", value: load.packagesCount ?? "—" },
            { label: "Упаковка", value: load.packageType ?? "—" },
            { label: "Тип транспорта", value: load.vehicleType ? label("VehicleType", load.vehicleType) : "Любой" },
            { label: "Тип кузова", value: load.bodyType ? label("BodyType", load.bodyType) : "Любой" },
            { label: "Температура", value: load.temperatureFrom !== null ? `${load.temperatureFrom}…${load.temperatureTo ?? ""} °C` : "—" },
            { label: "GPS", value: load.requiresGps ? "Обязателен" : "Не требуется" },
            { label: "Требования", value: load.requirements ?? "—" },
          ]}
        />
      </CardContent>
    </Card>
  );

  const conditions = (
    <div className="space-y-5">
      <Card>
        <CardContent className="pt-5">
          <DefinitionList
            items={[
              { label: "Тип цены", value: label("PriceType", load.priceType) },
              { label: "Целевая стоимость", value: priceText },
              { label: "Валюта", value: label("Currency", load.currency) },
              { label: "Дополнительные условия", value: load.additionalTerms ?? "—" },
              ...(isOwner ? [{ label: "Заметки (видны только вам)", value: load.notes ?? "—" }] : []),
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircleQuestion className="size-4" aria-hidden /> Вопросы перевозчиков
          </CardTitle>
        </CardHeader>
        <CardContent>
          {load.questions.length === 0 ? (
            <p className="text-muted-foreground text-body">Вопросов пока нет.</p>
          ) : (
            <ul className="space-y-3">
              {load.questions.map((q) => (
                <li key={q.id} className="bg-fill-quaternary text-body rounded-lg p-3">
                  <p>
                    <span className="font-medium">{q.company.legalName}:</span> {q.question}
                  </p>
                  {q.answer ? (
                    <p className="text-muted-foreground mt-1">Ответ заказчика: {q.answer}</p>
                  ) : isOwner ? (
                    <AnswerQuestionForm questionId={q.id} />
                  ) : (
                    <p className="text-muted-foreground text-footnote mt-1">Ожидает ответа</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const bidsTab = (
    <div className="space-y-3">
      {canBid && !myActiveBid && (
        <div className="bg-info-bg flex flex-wrap items-center justify-between gap-3 rounded-lg p-4">
          <p className="text-info text-body">Предложите свою цену — заказчик получит уведомление.</p>
          <BidDialog loadId={load.id} currency={load.currency} targetPrice={load.targetPrice} />
        </div>
      )}
      {bids.length === 0 ? (
        <EmptyState
          title="Предложений пока нет"
          description={isOwner ? "Перевозчики увидят груз на бирже и предложат цену. Вы получите уведомление." : undefined}
        />
      ) : (
        bids.map((b) => (
          <BidCard
            key={b.id}
            bid={b as unknown as BidView}
            perspective={isOwner ? "owner" : "carrier"}
            targetPrice={load.targetPrice}
            rating={ratings[b.carrier.id]}
            canAct={(isOwner && actor.permissions.has("BID_ACCEPT")) || (isCarrier && actor.permissions.has("BID_CREATE"))}
          />
        ))
      )}
    </div>
  );

  const docs = (
    <div className="space-y-4">
      <DocumentList
        docs={load.documents.map((d) => ({ ...d, version: 1, status: "ACTIVE", canDelete: isOwner }))}
        downloadBase="/api/load-documents"
        deleteBase="/api/load-documents"
      />
      {isOwner && load.status !== "CANCELLED" && (
        <Card>
          <CardHeader>
            <CardTitle>Загрузить документ</CardTitle>
          </CardHeader>
          <CardContent>
            <DocumentUploader
              url={`/api/loads/${load.id}/documents`}
              types={["APPLICATION", "PACKING_LIST", "INVOICE", "CARGO_PHOTO", "OTHER"]}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        back={{ href: isOwner ? "/loads" : "/marketplace", label: isOwner ? "Мои грузы" : "Биржа грузов" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {load.publicNumber} · {load.title} <StatusBadge kind="LoadStatus" value={load.status} size="lg" />
          </span>
        }
        description={<RouteChain stops={load.stops} />}
        actions={
          <>
            {load.order && (
              <Button asChild>
                <Link href={`/orders/${load.order.id}`}>
                  Перевозка {load.order.publicNumber} <ArrowRight />
                </Link>
              </Button>
            )}
            {isOwner && actor.permissions.has("LOAD_EDIT") && (
              <LoadOwnerActions loadId={load.id} status={load.status} pendingBids={pendingBids} />
            )}
            {canBid && !myActiveBid && <BidDialog loadId={load.id} currency={load.currency} targetPrice={load.targetPrice} />}
            {isCarrier && (load.status === "PUBLISHED" || load.status === "BIDDING") && <AskQuestionDialog loadId={load.id} />}
          </>
        }
      />
      {load.status === "CANCELLED" && (
        <p className="bg-danger-bg text-danger text-body mb-4 rounded-lg px-3 py-2">
          Груз отменён{load.cancelReason ? `: ${load.cancelReason}` : ""}.
        </p>
      )}
      <UrlTabs
        defaultTab="overview"
        tabs={[
          { value: "overview", label: "Обзор", content: overview },
          {
            value: "route",
            label: "Маршрут",
            content: (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <Card>
                  <CardContent className="space-y-4 pt-5">
                    {load.routeDistanceKm != null && <RouteDistance route={load} className="text-body font-medium" />}
                    <RouteTimeline stops={load.stops} showContacts={isOwner || !!load.order} />
                  </CardContent>
                </Card>
                <MapView points={stopPoints(load.stops)} lines={routeLines(load)} className="h-[380px] w-full overflow-hidden rounded-lg" />
              </div>
            ),
          },
          { value: "cargo", label: "Груз", content: cargo },
          { value: "conditions", label: "Условия", content: conditions },
          { value: "bids", label: `Предложения${bids.length ? ` (${bids.length})` : ""}`, content: bidsTab },
          { value: "documents", label: "Документы", content: docs },
          {
            value: "history",
            label: "История",
            content: (
              <Card>
                <CardContent className="pt-4">
                  <AuditFeed rows={history as unknown as AuditRow[]} />
                </CardContent>
              </Card>
            ),
            hidden: !isOwner && relation !== "ADMIN",
          },
        ]}
      />
    </>
  );
}
