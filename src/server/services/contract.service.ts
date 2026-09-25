import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { audit, AuditAction } from "@/lib/audit/audit";
import type { Actor } from "@/lib/auth/actor";
import { prisma, type Tx } from "@/lib/db/prisma";
import { AppError, errors } from "@/lib/errors";
import { countryName } from "@/lib/geo/countries";
import { formatDate, formatDateTime, formatWeight, formatVolume } from "@/lib/format";
import { label } from "@/lib/i18n";
import { nextPublicNumber } from "@/lib/numbering";
import { renderContractPdf, type ContractData } from "@/lib/contracts/pdf";
import { signatureProvider } from "@/lib/contracts/signature-provider";
import { contentHash, DEMO_CONTRACT_TEMPLATE, DEMO_TEMPLATE_CODE, renderTemplate } from "@/lib/contracts/template";
import { requireOrderAccess } from "./access";
import { reauthenticate } from "./auth.service";
import { notify } from "./notification.service";
import { orderParticipantUserIds, performTransitionInTx } from "./order-core";

async function activeTemplate(tx: Tx) {
  const tpl = await tx.contractTemplate.findFirst({
    where: { code: DEMO_TEMPLATE_CODE, isActive: true },
    orderBy: { version: "desc" },
  });
  if (tpl) return tpl;
  return tx.contractTemplate.create({
    data: { code: DEMO_TEMPLATE_CODE, name: "Договор-заявка на международную перевозку (демо)", version: 1, body: DEMO_CONTRACT_TEMPLATE },
  });
}

function requisites(c: {
  legalName: string;
  registrationNumber: string;
  taxId: string | null;
  country: string;
  city: string;
  address: string;
  phone: string | null;
  email: string | null;
}) {
  return [
    `Рег. номер: ${c.registrationNumber}${c.taxId ? `, ИНН/БИН/TIN: ${c.taxId}` : ""}`,
    `Адрес: ${countryName(c.country)}, ${c.city}, ${c.address}`,
    [c.phone && `Тел.: ${c.phone}`, c.email && `Email: ${c.email}`].filter(Boolean).join(", ") || "Контакты не указаны",
  ];
}

/**
 * Создаёт договор по активному шаблону. Текст фиксируется (snapshot) вместе с hash —
 * последующие изменения шаблона не влияют на существующие договоры.
 */
export async function createContractInTx(tx: Tx, actor: Actor | null, orderId: string) {
  const order = await tx.transportOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      load: { include: { stops: { orderBy: { sequence: "asc" } } } },
      shipper: true,
      carrier: true,
      contracts: { select: { version: true }, orderBy: { version: "desc" }, take: 1 },
    },
  });
  const template = await activeTemplate(tx);
  const version = (order.contracts[0]?.version ?? 0) + 1;
  const documentNumber = await nextPublicNumber(tx, "contract");
  const now = new Date();
  const load = order.load;
  const routeStr = load.stops
    .map((s) => `${label("StopType", s.type)}: ${countryName(s.country)}, ${s.city}${s.fullAddress ? `, ${s.fullAddress}` : ""}`)
    .join("\n");
  const vehicleReq = [
    load.vehicleType && label("VehicleType", load.vehicleType),
    load.bodyType && label("BodyType", load.bodyType),
    load.temperatureFrom !== null && `t° ${load.temperatureFrom}…${load.temperatureTo ?? ""} °C`,
    load.requiresGps && "GPS обязателен",
    load.requirements,
  ]
    .filter(Boolean)
    .join("; ");
  const amountStr = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2 }).format(Number(order.agreedAmount));

  const vars = {
    contract_number: documentNumber,
    contract_date: formatDate(now),
    order_number: order.publicNumber,
    shipper_company_name: order.shipper.legalName,
    shipper_requisites: requisites(order.shipper).join("; "),
    carrier_company_name: order.carrier.legalName,
    carrier_requisites: requisites(order.carrier).join("; "),
    route: routeStr,
    cargo_description: `${load.title}. ${label("CargoType", load.cargoType)}${load.cargoDescription ? `. ${load.cargoDescription}` : ""}${load.packagesCount ? `. Мест: ${load.packagesCount}${load.packageType ? ` (${load.packageType})` : ""}` : ""}`,
    weight: formatWeight(Number(load.weightKg)),
    volume: load.volumeM3 ? formatVolume(Number(load.volumeM3)) : "не указан",
    vehicle_requirements: vehicleReq || "не указаны",
    amount: amountStr,
    currency: order.currency,
    loading_date: formatDate(order.loadingDate),
    delivery_date: order.deliveryDate ? formatDate(order.deliveryDate) : "по согласованию",
    documents:
      "CMR (международная товарно-транспортная накладная), инвойс, упаковочный лист, подтверждение доставки (POD). Документы размещаются в разделе «Документы» сделки.",
    additional_terms: load.additionalTerms || "Нет",
  };
  const content = renderTemplate(template.body, vars);
  const hash = contentHash(content);

  const data: ContractData = {
    contractNumber: documentNumber,
    orderNumber: order.publicNumber,
    orderId: order.id,
    version,
    createdAt: now.toISOString(),
    title: "Договор-заявка на международную перевозку груза",
    parties: [
      { role: "Заказчик", name: order.shipper.legalName, requisites: requisites(order.shipper) },
      { role: "Перевозчик", name: order.carrier.legalName, requisites: requisites(order.carrier) },
    ],
    route: load.stops.map((s) => ({
      label: label("StopType", s.type),
      address: `${countryName(s.country)}, ${s.city}${s.fullAddress ? `, ${s.fullAddress}` : ""}`,
      date: s.plannedDateFrom ? formatDateTime(s.plannedDateFrom, s.timezone ?? undefined) : "",
    })),
    cargo: [
      { label: "Наименование", value: load.title },
      { label: "Тип груза", value: label("CargoType", load.cargoType) },
      { label: "Описание", value: load.cargoDescription ?? "—" },
      { label: "Вес", value: formatWeight(Number(load.weightKg)) },
      { label: "Объём", value: load.volumeM3 ? formatVolume(Number(load.volumeM3)) : "—" },
      {
        label: "Количество мест",
        value: load.packagesCount ? `${load.packagesCount}${load.packageType ? ` (${load.packageType})` : ""}` : "—",
      },
      { label: "Транспорт", value: vehicleReq || "—" },
    ],
    amount: amountStr,
    currency: order.currency,
    loadingDate: vars.loading_date,
    deliveryDate: vars.delivery_date,
  };

  const contract = await tx.contract.create({
    data: {
      orderId,
      templateId: template.id,
      version,
      documentNumber,
      title: data.title,
      contentSnapshot: content,
      dataSnapshot: data as unknown as Prisma.InputJsonValue,
      contentHash: hash,
      status: "PENDING_SIGNATURES",
    },
  });
  await tx.contract.update({ where: { id: contract.id }, data: { pdfUrl: `/api/contracts/${contract.id}/pdf` } });
  await audit(
    actor,
    {
      action: AuditAction.CONTRACT_CREATED,
      entityType: "TransportOrder",
      entityId: orderId,
      companyId: null,
      newValue: { contractId: contract.id, documentNumber, version, hash },
    },
    tx,
  );
  return contract;
}

export async function getOrderContract(actor: Actor, orderId: string) {
  const { access } = await requireOrderAccess(actor, orderId, "CONTRACT_VIEW");
  const contract = await prisma.contract.findFirst({
    where: { orderId },
    orderBy: { version: "desc" },
    include: {
      signatures: {
        where: { signatureStatus: "SIGNED" },
        orderBy: { signedAt: "asc" },
        include: { user: { select: { firstName: true, lastName: true } }, company: { select: { legalName: true } } },
      },
    },
  });
  if (!contract) throw errors.notFound("Договор ещё не создан.");
  await audit(actor, {
    action: AuditAction.CONTRACT_VIEWED,
    entityType: "Contract",
    entityId: contract.id,
    companyId: access.membership?.companyId ?? null,
  });
  const integrityOk = contentHash(contract.contentSnapshot) === contract.contentHash;
  return { contract, integrityOk, side: access.side };
}

export async function signContract(actor: Actor, contractId: string, input: { password: string; documentHash: string }) {
  const found = await prisma.contract.findUnique({ where: { id: contractId }, select: { orderId: true } });
  if (!found) throw errors.notFound("Нельзя подписать отсутствующий договор.");
  const { access } = await requireOrderAccess(actor, found.orderId, "CONTRACT_SIGN");
  if (access.side !== "CUSTOMER" && access.side !== "CARRIER") {
    throw errors.forbidden("Подписывать договор могут только уполномоченные представители сторон сделки.");
  }
  await reauthenticate(actor, input.password);
  const companyId = access.membership!.companyId;
  const side: "CUSTOMER" | "CARRIER" = access.side;

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Contract" WHERE id = ${contractId}::uuid FOR UPDATE`;
    const contract = await tx.contract.findUniqueOrThrow({
      where: { id: contractId },
      include: { order: true, signatures: { where: { signatureStatus: "SIGNED" } } },
    });
    if (contract.status === "SIGNED") throw new AppError("CONTRACT_ALREADY_SIGNED", "Договор уже подписан.");
    if (contract.status === "CANCELLED" || contract.status === "DRAFT") {
      throw new AppError("INVALID_STATE_TRANSITION", "Этот договор недоступен для подписания.");
    }
    if (contract.signatures.some((s) => s.companyId === companyId)) {
      throw new AppError("CONTRACT_ALREADY_SIGNED", "Ваша компания уже подписала этот договор.");
    }
    if (contentHash(contract.contentSnapshot) !== contract.contentHash) {
      throw new AppError("CONFLICT", "Нарушена целостность документа: hash не совпадает. Обратитесь к администратору.");
    }
    if (input.documentHash !== contract.contentHash) {
      throw new AppError("CONFLICT", "Документ изменился после открытия. Обновите страницу и ознакомьтесь с актуальной версией.");
    }
    if (contract.order.currentStatus !== "CONTRACT_PENDING") {
      throw new AppError("INVALID_STATE_TRANSITION", "Перевозка не находится на этапе подписания договора.");
    }

    const result = await signatureProvider.sign({
      contractId,
      documentHash: contract.contentHash,
      userId: actor.userId,
      companyId,
      ipAddress: actor.ip,
      userAgent: actor.userAgent,
    });
    const signature = await tx.contractSignature.create({
      data: {
        contractId,
        userId: actor.userId,
        companyId,
        side,
        method: result.method,
        signedAt: result.signedAt,
        ipAddress: actor.ip,
        userAgent: actor.userAgent,
        documentHash: result.documentHash,
        signatureStatus: "SIGNED",
      },
    });
    await audit(
      actor,
      {
        action: AuditAction.CONTRACT_SIGNED,
        entityType: "TransportOrder",
        entityId: contract.orderId,
        companyId,
        newValue: {
          contractId,
          documentNumber: contract.documentNumber,
          version: contract.version,
          hash: contract.contentHash,
          method: result.method,
        },
      },
      tx,
    );

    const order = contract.order;
    const required = new Set([order.shipperCompanyId, order.carrierCompanyId]);
    const signedCompanies = new Set([...contract.signatures.map((s) => s.companyId), companyId]);
    const fullySigned = [...required].every((id) => signedCompanies.has(id));

    if (fullySigned) {
      await tx.contract.update({ where: { id: contractId }, data: { status: "SIGNED", signedAt: new Date() } });
      await performTransitionInTx(tx, {
        orderId: order.id,
        to: "CONTRACT_SIGNED",
        side: "SYSTEM",
        actor,
        source: "SYSTEM",
        comment: `Договор ${contract.documentNumber} подписан всеми сторонами`,
        silent: true,
      });
      await tx.load.update({ where: { id: order.loadId }, data: { status: "CONVERTED_TO_ORDER" } });
      await audit(
        actor,
        {
          action: AuditAction.CONTRACT_FULLY_SIGNED,
          entityType: "TransportOrder",
          entityId: order.id,
          companyId: null,
          newValue: { contractId },
        },
        tx,
      );
      await notify(tx, {
        userIds: await orderParticipantUserIds(tx, order, { customer: true, carrier: true }),
        type: "CONTRACT_SIGNED",
        title: `Договор ${contract.documentNumber} подписан`,
        body: `Сделка ${order.publicNumber}: договор подписан всеми сторонами. Перевозчик может назначать транспорт.`,
        entityType: "TransportOrder",
        entityId: order.id,
        link: `/orders/${order.id}?tab=contract`,
      });
    } else {
      await tx.contract.update({ where: { id: contractId }, data: { status: "PARTIALLY_SIGNED" } });
      const otherIsCarrier = access.side === "CUSTOMER";
      await notify(tx, {
        userIds: await orderParticipantUserIds(tx, order, { customer: !otherIsCarrier, carrier: otherIsCarrier }),
        type: "CONTRACT_READY",
        title: `Подпишите договор ${contract.documentNumber}`,
        body: `${access.membership!.company.legalName} подписал(а) договор по сделке ${order.publicNumber}. Ожидается ваша подпись.`,
        entityType: "TransportOrder",
        entityId: order.id,
        link: `/orders/${order.id}?tab=contract`,
      });
    }
    return { signatureId: signature.id, fullySigned, documentHash: signature.documentHash };
  });
}

export async function getContractPdf(actor: Actor, contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      signatures: {
        where: { signatureStatus: "SIGNED" },
        orderBy: { signedAt: "asc" },
        include: { user: { select: { firstName: true, lastName: true } }, company: { select: { legalName: true } } },
      },
    },
  });
  if (!contract) throw errors.notFound("Договор не найден.");
  const { access } = await requireOrderAccess(actor, contract.orderId, "CONTRACT_VIEW");
  const bytes = await renderContractPdf({
    data: contract.dataSnapshot as unknown as ContractData,
    content: contract.contentSnapshot,
    contentHash: contract.contentHash,
    status: label("ContractStatus", contract.status),
    signatures: contract.signatures.map((s) => ({
      signerName: `${s.user.firstName} ${s.user.lastName}`,
      companyName: s.company.legalName,
      side: s.side === "CUSTOMER" ? "Заказчик" : "Перевозчик",
      signedAt: s.signedAt.toISOString().replace("T", " ").slice(0, 19),
      method: "Внутреннее электронное подтверждение (INTERNAL_ACCEPTANCE)",
      documentHash: s.documentHash,
      ipAddress: s.ipAddress,
    })),
  });
  await audit(actor, {
    action: AuditAction.CONTRACT_VIEWED,
    entityType: "Contract",
    entityId: contract.id,
    companyId: access.membership?.companyId ?? null,
    newValue: { format: "pdf" },
  });
  return { bytes, filename: `${contract.documentNumber}_v${contract.version}.pdf` };
}
