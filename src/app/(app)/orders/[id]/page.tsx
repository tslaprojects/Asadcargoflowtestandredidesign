import { MessageSquare, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { InsetGroup, InsetList, ListRow } from "@/components/common/inset-group";
import { CompanyBadge, MoneyDisplay, PageHeader } from "@/components/common/misc";
import { RouteTimeline } from "@/components/common/route-timeline";
import { StatusBadge } from "@/components/common/status-badge";
import { UrlTabs } from "@/components/common/url-tabs";
import { Button } from "@/components/ui/button";
import { contentHash } from "@/lib/contracts/template";
import { countryName } from "@/lib/geo/countries";
import { formatDate, formatDateTime, formatRelative, formatTime, formatVolume, formatWeight } from "@/lib/format";
import { label } from "@/lib/i18n";
import type { Permission } from "@/lib/permissions";
import { toPlain } from "@/lib/serialize";
import { FINAL_STATUSES } from "@/lib/state-machine/order-state-machine";
import { AuditFeed, type AuditRow } from "@/features/audit/audit-feed";
import { ChatPanel } from "@/features/chat/chat-panel";
import { DocumentList, type DocItem } from "@/features/documents/document-list";
import { DocumentUploader } from "@/features/documents/document-uploader";
import { ContractPanel, type ContractView } from "@/features/orders/contract-panel";
import { DisputePanel } from "@/features/orders/dispute-panel";
import { FinancePanel } from "@/features/orders/finance-panel";
import { SecureDealPanel, type SecureDealPanelView } from "@/features/orders/secure-deal-panel";
import { OrderActions } from "@/features/orders/order-actions";
import { OrderStatusTimeline, type HistoryEntry } from "@/features/orders/order-status-timeline";
import { OrderTrackingHeader } from "@/features/orders/order-tracking-header";
import { JourneyTimeline } from "@/features/operations/journey-timeline";
import { orderProgress } from "@/lib/state-machine/order-progress";
import { MapView, type MapPoint } from "@/features/tracking/map-view";
import { routeLines } from "@/features/tracking/route-line";
import { RouteDistance } from "@/components/common/route-distance";
import { guard, pageActor } from "@/server/page-context";
import { unreadForOrder } from "@/server/services/chat.service";
import { DRIVER_DOCUMENT_TYPES, listOrderDocuments } from "@/server/services/document.service";
import { getOrderAuditTrail, getOrderDetail } from "@/server/services/order.service";
import { getSecureDealView } from "@/server/services/secure-deal.service";
import { tripFuelReport } from "@/server/services/fuel-report.service";
import { TripFuelReport } from "@/features/fuel/trip-fuel-report";
import { listTracking } from "@/server/services/tracking.service";

export const metadata: Metadata = { title: "Перевозка" };

const ALL_UPLOAD_TYPES = [
  "CMR",
  "INVOICE",
  "PACKING_LIST",
  "APPLICATION",
  "CARGO_PHOTO",
  "SEAL_PHOTO",
  "PROOF_OF_DELIVERY",
  "VEHICLE_DOCUMENT",
  "DRIVER_DOCUMENT",
  "OTHER",
];

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await pageActor();
  const detail = toPlain(await guard(getOrderDetail(actor, id)));
  const { order, contract, access, finance, payments, ratings, userNames, lastLocation } = detail;
  const perms = access.permissions as Permission[];
  const can = (p: Permission) => perms.includes(p);
  const side = access.side;
  const isDriver = side === "DRIVER";

  const showFuel = (side === "CARRIER" && can("FUEL_VIEW")) || (side === "ADMIN" && actor.permissions.has("FUEL_VIEW"));
  const [docs, tracking, unread, audit, secureDeal, fuel] = await Promise.all([
    listOrderDocuments(actor, id, { includeHistory: true }).then(toPlain),
    listTracking(actor, id, { limit: 30 }).then(toPlain),
    unreadForOrder(actor, id),
    isDriver ? Promise.resolve(null) : getOrderAuditTrail(actor, id, { page: 1, pageSize: 100 }).then(toPlain),
    finance ? getSecureDealView(actor, id).then((v) => toPlain(v) as unknown as SecureDealPanelView) : Promise.resolve(null),
    showFuel ? tripFuelReport(actor, id).then(toPlain) : Promise.resolve(null),
  ]);
  const secureStatus = secureDeal?.payment?.status ?? null;
  const secureLive = !!secureStatus && !["PAYMENT_CANCELLED", "PAYMENT_FAILED"].includes(secureStatus);

  const stops = order.load.stops;
  const routeText = stops.map((s) => `${s.city} (${countryName(s.country)})`).join(" → ");
  const myCompanyId = access.companyId;
  const contractSignedByMe = !!contract?.signatures.some((s) => s.companyId === myCompanyId);
  const reviewedByMe = order.reviews.some((r) => r.fromCompanyId === myCompanyId);
  const counterpart = side === "CUSTOMER" ? order.carrier.legalName : order.shipper.legalName;
  const counterpartPhone = side === "CUSTOMER" ? order.carrier.phone : side === "CARRIER" ? order.shipper.phone : null;
  const docNames = Object.fromEntries(docs.items.map((d) => [d.id, d.filename]));
  const final = FINAL_STATUSES.includes(order.currentStatus);

  const points: MapPoint[] = [
    ...stops
      .filter((s) => s.latitude !== null && s.longitude !== null)
      .map((s) => ({
        lat: s.latitude!,
        lng: s.longitude!,
        label: `${label("StopType", s.type)}: ${s.city}`,
        kind: s.type as MapPoint["kind"],
      })),
    ...(lastLocation?.latitude != null && lastLocation.longitude != null
      ? [
          {
            lat: lastLocation.latitude,
            lng: lastLocation.longitude,
            label: `Автомобиль · ${formatDateTime(lastLocation.createdAt)}`,
            kind: "VEHICLE" as const,
          },
        ]
      : []),
  ];

  const summary = (
    <InsetGroup header="Условия и участники">
      <div data-testid="order-summary">
        {order.agreedAmount !== null && (
          <div className="hairline-b px-4 py-3">
            <p className="text-footnote text-muted-foreground">Стоимость перевозки</p>
            <MoneyDisplay amount={order.agreedAmount} currency={order.currency} className="text-title1 font-semibold" />
          </div>
        )}
        <InsetList>
          {secureDeal && (
            <ListRow
              title="Безопасная сделка"
              value={
                secureLive ? (
                  <Link href={`/orders/${order.id}?tab=finance`} scroll={false} data-testid="summary-secure-deal">
                    <StatusBadge kind="PaymentStatus" value={secureStatus!} />
                  </Link>
                ) : (
                  "Не оформлена"
                )
              }
            />
          )}
          {order.load.routeDistanceKm != null && <ListRow title="Расстояние" value={<RouteDistance route={order.load} />} />}
          <ListRow
            title="Заказчик"
            subtitle={
              <CompanyBadge
                id={order.shipper.id}
                name={order.shipper.legalName}
                verification={order.shipper.verificationStatus}
                rating={ratings[order.shipper.id]}
              />
            }
          />
          <ListRow
            title="Перевозчик"
            subtitle={
              <CompanyBadge
                id={order.carrier.id}
                name={order.carrier.legalName}
                verification={order.carrier.verificationStatus}
                rating={ratings[order.carrier.id]}
              />
            }
          />
          <ListRow
            title="Автомобиль"
            subtitle={
              <span data-testid="summary-vehicle" className="text-foreground">
                {order.vehicle ? `${order.vehicle.make} ${order.vehicle.model} · ${order.vehicle.plateNumber}` : "Не назначен"}
              </span>
            }
          />
          <ListRow
            title="Водитель"
            subtitle={
              <span data-testid="summary-driver" className="text-foreground">
                {order.driver ? (
                  <>
                    {order.driver.fullName}{" "}
                    <a href={`tel:${order.driver.phone}`} className="text-link hover:underline">
                      {order.driver.phone}
                    </a>
                  </>
                ) : (
                  "Не назначен"
                )}
              </span>
            }
          />
          <ListRow title="Статус обновлён" value={<span className="num">{formatDateTime(order.statusChangedAt)}</span>} />
        </InsetList>
      </div>
    </InsetGroup>
  );

  const overview = (
    <div className="grid gap-6 xl:grid-cols-2">
      <InsetGroup header="Этапы перевозки">
        <div className="p-2">
          <OrderStatusTimeline
            history={order.statusHistory as HistoryEntry[]}
            current={order.currentStatus}
            createdAt={order.createdAt}
            userNames={userNames}
            documents={docNames}
          />
        </div>
      </InsetGroup>
      <div className="space-y-6">
        <InsetGroup header="Груз и транспорт">
          <InsetList>
            <ListRow title="Груз" value={`${order.load.title} (${label("CargoType", order.load.cargoType)})`} />
            <ListRow
              title="Вес / объём"
              value={
                <span className="num">
                  {formatWeight(order.load.weightKg)}
                  {order.load.volumeM3 ? ` · ${formatVolume(order.load.volumeM3)}` : ""}
                </span>
              }
            />
            <ListRow title="Места" value={order.load.packagesCount ? `${order.load.packagesCount} ${order.load.packageType ?? ""}` : "—"} />
            <ListRow title="Кузов" value={order.load.bodyType ? label("BodyType", order.load.bodyType) : "Любой"} />
            <ListRow title="Дата загрузки" value={<span className="num">{formatDate(order.loadingDate)}</span>} />
            <ListRow title="Дата доставки" value={<span className="num">{formatDate(order.deliveryDate)}</span>} />
            <ListRow
              title="Автомобиль"
              value={order.vehicle ? `${order.vehicle.make} ${order.vehicle.model}, ${order.vehicle.plateNumber}` : "Не назначен"}
            />
            <ListRow
              title="Водитель"
              value={order.driver ? `${order.driver.fullName}, кат. ${order.driver.licenseCategory}` : "Не назначен"}
            />
            {order.load.clientName && !isDriver && <ListRow title="Клиент экспедитора" value={order.load.clientName} />}
          </InsetList>
        </InsetGroup>
        <InsetGroup header="Контакты участников">
          <InsetList>
            {[order.shipper, order.carrier].map((c) => (
              <ListRow
                key={c.id}
                title={c.legalName}
                subtitle={c.email ?? undefined}
                value={
                  c.phone ? (
                    <a className="text-link inline-flex items-center gap-1 hover:underline" href={`tel:${c.phone}`}>
                      <Phone className="size-3.5" aria-hidden /> {c.phone}
                    </a>
                  ) : undefined
                }
              />
            ))}
          </InsetList>
        </InsetGroup>
        {order.reviews.length > 0 && (
          <InsetGroup header="Отзывы">
            <InsetList>
              {order.reviews.map((r) => (
                <ListRow
                  key={r.id}
                  title={
                    <span>
                      {r.fromCompany.legalName}{" "}
                      <span className="text-rating" aria-label={`Оценка ${r.rating} из 5`}>
                        {"★".repeat(r.rating)}
                        <span className="text-fill">{"★".repeat(5 - r.rating)}</span>
                      </span>
                    </span>
                  }
                  subtitle={r.comment ?? undefined}
                />
              ))}
            </InsetList>
          </InsetGroup>
        )}
      </div>
    </div>
  );

  const routeTab = (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <InsetGroup
        header="Карта"
        action={
          <span className="text-muted-foreground" data-testid="last-location">
            {lastLocation
              ? `Последнее обновление: ${formatTime(lastLocation.createdAt)} (${formatRelative(lastLocation.createdAt)})`
              : "Последнее местоположение не получено"}
          </span>
        }
        footer="Позиция передаётся водителем из приложения (геолокация браузера) — это не непрерывный GPS-трекинг."
      >
        <MapView points={points} lines={routeLines(order.load)} className="h-[420px] w-full" />
      </InsetGroup>
      <div className="space-y-6">
        <InsetGroup header="Точки маршрута">
          <div className="px-4 py-3.5">
            <RouteTimeline stops={stops} />
          </div>
        </InsetGroup>
        <InsetGroup header="События трекинга">
          {tracking.items.length === 0 ? (
            <p className="text-subheadline text-muted-foreground px-4 py-3">Событий пока нет</p>
          ) : (
            <InsetList>
              {tracking.items.map((t) => (
                <ListRow
                  key={t.id}
                  title={label("TrackingEventType", t.type)}
                  subtitle={
                    t.note || t.latitude !== null ? (
                      <>
                        {t.note}
                        {t.note && t.latitude !== null && " · "}
                        {t.latitude !== null && (
                          <span className="num">
                            {t.latitude.toFixed(4)}, {t.longitude?.toFixed(4)}
                            {t.accuracy ? ` ±${Math.round(t.accuracy)} м` : ""}
                          </span>
                        )}
                      </>
                    ) : undefined
                  }
                  value={<span className="text-footnote num">{formatDateTime(t.createdAt)}</span>}
                />
              ))}
            </InsetList>
          )}
        </InsetGroup>
      </div>
    </div>
  );

  const docItems: DocItem[] = docs.items.map((d) => ({ ...d, canReplace: d.canDelete }));
  const uploadTypes: string[] = isDriver ? [...DRIVER_DOCUMENT_TYPES] : ALL_UPLOAD_TYPES;
  const documentsTab = (
    <div className="space-y-5">
      {contract && !isDriver && (
        <div className="bg-card flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-3">
          <span>
            <span className="font-medium">Договор {contract.documentNumber}</span> (версия {contract.version}) ·{" "}
            <StatusBadge kind="ContractStatus" value={contract.status} />
          </span>
          <a className="text-link hover:underline" href={`/api/contracts/${contract.id}/pdf`} target="_blank" rel="noopener noreferrer">
            Открыть PDF
          </a>
        </div>
      )}
      <DocumentList docs={docItems} replaceUrl={`/api/orders/${id}/documents`} replaceTypes={uploadTypes} />
      {can("DOCUMENT_UPLOAD") && (!final || side === "ADMIN") && (
        <InsetGroup header="Загрузить документ">
          <div className="p-4">
            <DocumentUploader url={`/api/orders/${id}/documents`} types={uploadTypes} defaultType="CMR" />
          </div>
        </InsetGroup>
      )}
      {final && side !== "ADMIN" && (
        <p className="text-subheadline text-muted-foreground px-4">Перевозка завершена — загрузка документов недоступна.</p>
      )}
    </div>
  );

  const contractTab = contract ? (
    <ContractPanel
      contract={contract as unknown as ContractView}
      canSign={can("CONTRACT_SIGN") && (side === "CUSTOMER" || side === "CARRIER")}
      signedByMe={contractSignedByMe}
      signerName={actor.fullName}
      signerCompany={actor.memberships.find((m) => m.companyId === myCompanyId)?.company.legalName ?? ""}
      amount={order.agreedAmount}
      currency={order.currency}
      route={routeText}
      integrityOk={contentHash(contract.contentSnapshot) === contract.contentHash}
    />
  ) : (
    <p className="text-subheadline text-muted-foreground px-4">Договор ещё не создан.</p>
  );

  return (
    <>
      <PageHeader
        back={{ href: isDriver ? "/driver" : "/orders", label: isDriver ? "Мой рейс" : "Перевозки" }}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span>
              Перевозка <span className="id-code">{order.publicNumber}</span>
            </span>
            <StatusBadge kind="OrderStatus" value={order.currentStatus} size="lg" />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-foreground">{order.load.title}</span>
            <span aria-hidden>·</span>
            <span className="num">{formatWeight(order.load.weightKg)}</span>
            <span aria-hidden>·</span>
            <Link href={`/loads/${order.load.id}`} className="text-link hover:underline">
              Груз <span className="id-code">{order.load.publicNumber}</span>
            </Link>
          </span>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <OrderTrackingHeader
            progress={orderProgress(order.statusHistory, order.currentStatus)}
            stops={stops}
            lastLocation={lastLocation}
            loadingDate={order.loadingDate}
            deliveryDate={order.deliveryDate}
            vehicle={order.vehicle}
            driver={order.driver}
            points={points}
            lines={routeLines(order.load)}
          />
          <InsetGroup header="Действия">
            <div className="p-4">
              <OrderActions
                counterpart={counterpart}
                ctx={{
                  orderId: order.id,
                  status: order.currentStatus,
                  previousStatus: order.previousStatus,
                  side,
                  permissions: perms,
                  hasVehicle: !!order.vehicleId,
                  hasDriver: !!order.driverId,
                  contractSignedByMe,
                  podCount: detail.podCount,
                  requirePod: detail.requirePod,
                  reviewedByMe,
                  weightKg: order.load.weightKg,
                  secureDealStatus: secureStatus,
                  receiptConfirmedAt: order.receiptConfirmedAt,
                  confirmationDueAt: order.confirmationDueAt,
                  vehicleId: order.vehicleId,
                }}
              />
              {final && order.currentStatus === "CANCELLED" && <p className="text-danger text-subheadline">Перевозка отменена.</p>}
              {!final && !isDriver && (
                <div className="hairline-t mt-4 flex flex-wrap items-center gap-2 pt-4">
                  <span className="text-subheadline text-muted-foreground mr-1">Связаться:</span>
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/orders/${order.id}?tab=chat`} scroll={false}>
                      <MessageSquare /> Чат по перевозке{unread ? ` (${unread})` : ""}
                    </Link>
                  </Button>
                  {counterpartPhone && (
                    <Button asChild variant="secondary" size="sm">
                      <a href={`tel:${counterpartPhone}`}>
                        <Phone /> {side === "CUSTOMER" ? "Перевозчику" : "Заказчику"}
                      </a>
                    </Button>
                  )}
                  {order.driver && (
                    <Button asChild variant="ghost" size="sm">
                      <a href={`tel:${order.driver.phone}`}>
                        <Phone /> Водителю
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </InsetGroup>
          <UrlTabs
            defaultTab="overview"
            tabs={[
              { value: "overview", label: "Обзор", content: overview },
              { value: "route", label: "Маршрут", content: routeTab },
              {
                value: "documents",
                label: `Документы${docs.items.length ? ` (${docs.items.filter((d) => d.status === "ACTIVE").length})` : ""}`,
                content: documentsTab,
              },
              { value: "contract", label: "Договор", content: contractTab, hidden: isDriver },
              {
                value: "chat",
                label: unread ? `Чат (${unread})` : "Чат",
                content: <ChatPanel orderId={order.id} canSend={can("CHAT_SEND") && order.currentStatus !== "CANCELLED"} />,
              },
              {
                value: "finance",
                label: "Финансы",
                hidden: !finance,
                content: finance && (
                  <div className="space-y-5">
                    {secureDeal && <SecureDealPanel orderId={order.id} view={secureDeal} />}
                    {!secureLive && (
                      <FinancePanel
                        orderId={order.id}
                        summary={finance}
                        payments={payments.filter((p) => p.type !== "SECURE_DEAL")}
                        canEdit={can("PAYMENT_EDIT") && !secureLive}
                        canConfirmPaid={side === "CARRIER" || side === "ADMIN"}
                        closedOrCancelled={order.currentStatus === "CANCELLED"}
                        secureDeal={secureLive}
                      />
                    )}
                  </div>
                ),
              },
              {
                value: "fuel",
                label: "Топливо",
                hidden: !fuel,
                content: fuel && <TripFuelReport r={fuel} canFinance={side === "ADMIN" || can("FUEL_FINANCE_VIEW")} />,
              },
              {
                value: "history",
                label: "История",
                hidden: isDriver,
                content: (
                  <InsetGroup header="История изменений">
                    <div className="p-4">
                      <AuditFeed rows={(audit?.items ?? []) as unknown as AuditRow[]} />
                    </div>
                  </InsetGroup>
                ),
              },
              {
                value: "dispute",
                label: order.disputes.some((d) => d.status === "OPEN" || d.status === "IN_REVIEW") ? "Спор ●" : "Спор",
                hidden: isDriver,
                content: (
                  <DisputePanel
                    orderId={order.id}
                    disputes={order.disputes}
                    userNames={userNames}
                    isAdmin={side === "ADMIN"}
                    secureDeal={
                      secureLive && secureDeal?.payment
                        ? { status: secureDeal.payment.status, held: secureDeal.held ?? 0, currency: secureDeal.order.currency }
                        : null
                    }
                    canOpen={
                      (side === "CUSTOMER" || side === "CARRIER") &&
                      can("DISPUTE_CREATE") &&
                      !final &&
                      order.currentStatus !== "CARRIER_SELECTED"
                    }
                    canComment={side !== "DRIVER"}
                  />
                ),
              },
            ]}
          />
        </div>
        <aside className="space-y-6 xl:sticky xl:top-20 xl:self-start">
          <InsetGroup header="Этапы рейса">
            <div className="px-4 py-3.5">
              <JourneyTimeline
                status={order.currentStatus}
                stops={stops}
                history={order.statusHistory.map((h) => ({ status: h.toStatus, at: String(h.createdAt) }))}
              />
            </div>
          </InsetGroup>
          {summary}
        </aside>
      </div>
    </>
  );
}
