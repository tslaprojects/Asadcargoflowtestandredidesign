import { MapPin, MessageSquare, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CompanyBadge, DefinitionList, MoneyDisplay, PageHeader } from "@/components/common/misc";
import { RouteTimeline } from "@/components/common/route-timeline";
import { StatusBadge } from "@/components/common/status-badge";
import { UrlTabs } from "@/components/common/url-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { orderProgress } from "@/lib/state-machine/order-progress";
import { MapView, type MapPoint } from "@/features/tracking/map-view";
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
    <Card className="lg:sticky lg:top-20" data-testid="order-summary">
      <CardHeader>
        <CardTitle>Условия и участники</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3.5 text-sm">
        {order.agreedAmount !== null && (
          <div>
            <p className="text-muted-foreground text-xs">Стоимость перевозки</p>
            <MoneyDisplay amount={order.agreedAmount} currency={order.currency} className="text-xl font-semibold" />
          </div>
        )}
        {secureDeal && (
          <div>
            <p className="text-muted-foreground text-xs">Безопасная сделка</p>
            {secureLive ? (
              <Link href={`/orders/${order.id}?tab=finance`} scroll={false} data-testid="summary-secure-deal">
                <StatusBadge kind="PaymentStatus" value={secureStatus!} />
              </Link>
            ) : (
              <p className="text-muted-foreground">Не оформлена</p>
            )}
          </div>
        )}
        <div>
          <p className="text-muted-foreground text-xs">Заказчик</p>
          <CompanyBadge
            id={order.shipper.id}
            name={order.shipper.legalName}
            verification={order.shipper.verificationStatus}
            rating={ratings[order.shipper.id]}
          />
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Перевозчик</p>
          <CompanyBadge
            id={order.carrier.id}
            name={order.carrier.legalName}
            verification={order.carrier.verificationStatus}
            rating={ratings[order.carrier.id]}
          />
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Автомобиль</p>
          <p data-testid="summary-vehicle">
            {order.vehicle ? `${order.vehicle.make} ${order.vehicle.model} · ${order.vehicle.plateNumber}` : "Не назначен"}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Водитель</p>
          <p data-testid="summary-driver">
            {order.driver ? (
              <>
                {order.driver.fullName}{" "}
                <a href={`tel:${order.driver.phone}`} className="text-primary hover:underline">
                  {order.driver.phone}
                </a>
              </>
            ) : (
              "Не назначен"
            )}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Статус обновлён</p>
          <p className="num">{formatDateTime(order.statusChangedAt)}</p>
        </div>
      </CardContent>
    </Card>
  );

  const overview = (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Этапы перевозки</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderStatusTimeline
            history={order.statusHistory as HistoryEntry[]}
            current={order.currentStatus}
            createdAt={order.createdAt}
            userNames={userNames}
            documents={docNames}
          />
        </CardContent>
      </Card>
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Груз и транспорт</CardTitle>
          </CardHeader>
          <CardContent>
            <DefinitionList
              items={[
                { label: "Груз", value: `${order.load.title} (${label("CargoType", order.load.cargoType)})` },
                {
                  label: "Вес / объём",
                  value: `${formatWeight(order.load.weightKg)}${order.load.volumeM3 ? ` · ${formatVolume(order.load.volumeM3)}` : ""}`,
                },
                { label: "Места", value: order.load.packagesCount ? `${order.load.packagesCount} ${order.load.packageType ?? ""}` : "—" },
                { label: "Кузов", value: order.load.bodyType ? label("BodyType", order.load.bodyType) : "Любой" },
                { label: "Дата загрузки", value: formatDate(order.loadingDate) },
                { label: "Дата доставки", value: formatDate(order.deliveryDate) },
                {
                  label: "Автомобиль",
                  value: order.vehicle ? `${order.vehicle.make} ${order.vehicle.model}, ${order.vehicle.plateNumber}` : "Не назначен",
                },
                {
                  label: "Водитель",
                  value: order.driver ? `${order.driver.fullName}, кат. ${order.driver.licenseCategory}` : "Не назначен",
                },
                ...(order.load.clientName && !isDriver ? [{ label: "Клиент экспедитора", value: order.load.clientName }] : []),
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Контакты участников</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[order.shipper, order.carrier].map((c) => (
              <p key={c.id} className="flex flex-wrap items-center gap-x-2">
                <span className="font-medium">{c.legalName}</span>
                {c.phone && (
                  <a className="text-primary inline-flex items-center gap-1 hover:underline" href={`tel:${c.phone}`}>
                    <Phone className="size-3.5" aria-hidden /> {c.phone}
                  </a>
                )}
                {c.email && <span className="text-muted-foreground">{c.email}</span>}
              </p>
            ))}
          </CardContent>
        </Card>
        {order.reviews.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Отзывы</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {order.reviews.map((r) => (
                <div key={r.id}>
                  <p className="font-medium">
                    {r.fromCompany.legalName}: {"★".repeat(r.rating)}
                    <span className="text-muted-foreground">{"★".repeat(5 - r.rating)}</span>
                  </p>
                  {r.comment && <p className="text-muted-foreground">{r.comment}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );

  const routeTab = (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <MapPin className="size-4" aria-hidden /> Карта
          </CardTitle>
          <p className="text-muted-foreground text-sm" data-testid="last-location">
            {lastLocation
              ? `Последнее обновление: ${formatTime(lastLocation.createdAt)} (${formatRelative(lastLocation.createdAt)})`
              : "Последнее местоположение не получено"}
          </p>
        </CardHeader>
        <CardContent>
          <MapView points={points} className="h-[420px] w-full overflow-hidden rounded-xl" />
          <p className="text-muted-foreground mt-2 text-xs">
            Позиция передаётся водителем из приложения (геолокация браузера) — это не непрерывный GPS-трекинг.
          </p>
        </CardContent>
      </Card>
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Точки маршрута</CardTitle>
          </CardHeader>
          <CardContent>
            <RouteTimeline stops={stops} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>События трекинга</CardTitle>
          </CardHeader>
          <CardContent>
            {tracking.items.length === 0 ? (
              <p className="text-muted-foreground text-sm">Событий пока нет</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {tracking.items.map((t) => (
                  <li key={t.id} className="flex justify-between gap-3">
                    <span>
                      {label("TrackingEventType", t.type)}
                      {t.note && <span className="text-muted-foreground block text-xs">{t.note}</span>}
                      {t.latitude !== null && (
                        <span className="text-muted-foreground block text-xs">
                          {t.latitude.toFixed(4)}, {t.longitude?.toFixed(4)}
                          {t.accuracy ? ` ±${Math.round(t.accuracy)} м` : ""}
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs">{formatDateTime(t.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const docItems: DocItem[] = docs.items.map((d) => ({ ...d, canReplace: d.canDelete }));
  const uploadTypes: string[] = isDriver ? [...DRIVER_DOCUMENT_TYPES] : ALL_UPLOAD_TYPES;
  const documentsTab = (
    <div className="space-y-5">
      {contract && !isDriver && (
        <div className="border-border bg-card flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
          <span>
            <span className="font-medium">Договор {contract.documentNumber}</span> (версия {contract.version}) ·{" "}
            <StatusBadge kind="ContractStatus" value={contract.status} />
          </span>
          <a className="text-primary hover:underline" href={`/api/contracts/${contract.id}/pdf`} target="_blank" rel="noopener noreferrer">
            Открыть PDF
          </a>
        </div>
      )}
      <DocumentList docs={docItems} replaceUrl={`/api/orders/${id}/documents`} replaceTypes={uploadTypes} />
      {can("DOCUMENT_UPLOAD") && (!final || side === "ADMIN") && (
        <Card>
          <CardHeader>
            <CardTitle>Загрузить документ</CardTitle>
          </CardHeader>
          <CardContent>
            <DocumentUploader url={`/api/orders/${id}/documents`} types={uploadTypes} defaultType="CMR" />
          </CardContent>
        </Card>
      )}
      {final && side !== "ADMIN" && <p className="text-muted-foreground text-sm">Перевозка завершена — загрузка документов недоступна.</p>}
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
    <p className="text-muted-foreground text-sm">Договор ещё не создан.</p>
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
            <Link href={`/loads/${order.load.id}`} className="text-primary hover:underline">
              Груз <span className="id-code">{order.load.publicNumber}</span>
            </Link>
          </span>
        }
      />
      <div className="mb-5">
        <OrderTrackingHeader
          progress={orderProgress(order.statusHistory, order.currentStatus)}
          stops={stops}
          lastLocation={lastLocation}
          loadingDate={order.loadingDate}
          deliveryDate={order.deliveryDate}
          vehicle={order.vehicle}
          driver={order.driver}
          points={points}
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Действия</CardTitle>
            </CardHeader>
            <CardContent>
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
              {final && order.currentStatus === "CANCELLED" && <p className="text-danger text-sm">Перевозка отменена.</p>}
              {!final && !isDriver && (
                <div className="border-border mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
                  <span className="text-muted-foreground mr-1 text-sm">Связаться:</span>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/orders/${order.id}?tab=chat`} scroll={false}>
                      <MessageSquare /> Чат по перевозке{unread ? ` (${unread})` : ""}
                    </Link>
                  </Button>
                  {counterpartPhone && (
                    <Button asChild variant="outline" size="sm">
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
            </CardContent>
          </Card>
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
                  <Card>
                    <CardHeader>
                      <CardTitle>История изменений</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <AuditFeed rows={(audit?.items ?? []) as unknown as AuditRow[]} />
                    </CardContent>
                  </Card>
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
        <aside>{summary}</aside>
      </div>
    </>
  );
}
