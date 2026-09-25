-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM ('SHIPPER', 'CARRIER', 'FORWARDER');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('SHIPPER', 'CARRIER_ADMIN', 'CARRIER_DISPATCHER', 'FORWARDER', 'DRIVER');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CompanyDocumentType" AS ENUM ('REGISTRATION', 'TAX', 'LICENSE', 'OTHER');

-- CreateEnum
CREATE TYPE "VerificationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('TRACTOR_TRAILER', 'TRUCK', 'VAN', 'ROAD_TRAIN');

-- CreateEnum
CREATE TYPE "BodyType" AS ENUM ('CURTAINSIDER', 'REFRIGERATOR', 'ISOTHERMAL', 'BOX', 'FLATBED', 'CONTAINER', 'TANKER', 'LOWBED', 'OTHER');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'INACTIVE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CargoType" AS ENUM ('GENERAL', 'ELECTRONICS', 'CLOTHING', 'FOOD', 'EQUIPMENT', 'AUTOMOTIVE', 'CHEMICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "PriceType" AS ENUM ('FIXED', 'NEGOTIABLE', 'REQUEST_QUOTE');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'CNY', 'KZT', 'RUB');

-- CreateEnum
CREATE TYPE "LoadVisibility" AS ENUM ('MARKETPLACE', 'INVITE_ONLY', 'DRAFT');

-- CreateEnum
CREATE TYPE "LoadStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'BIDDING', 'CARRIER_SELECTED', 'CANCELLED', 'CONVERTED_TO_ORDER');

-- CreateEnum
CREATE TYPE "StopType" AS ENUM ('PICKUP', 'BORDER', 'DELIVERY', 'TRANSIT');

-- CreateEnum
CREATE TYPE "BidStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PartySide" AS ENUM ('CUSTOMER', 'CARRIER');

-- CreateEnum
CREATE TYPE "BidMessageType" AS ENUM ('OFFER', 'COUNTER', 'COMMENT', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CARRIER_SELECTION', 'CARRIER_SELECTED', 'CONTRACT_PENDING', 'CONTRACT_SIGNED', 'VEHICLE_ASSIGNED', 'DRIVER_ASSIGNED', 'WAITING_FOR_LOADING', 'AT_LOADING', 'LOADED', 'IN_TRANSIT', 'AT_BORDER', 'CUSTOMS', 'BORDER_CLEARED', 'AT_DELIVERY', 'DELIVERED', 'CLOSED', 'CANCELLED', 'DISPUTED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'DRIVER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ActionSource" AS ENUM ('WEB', 'DRIVER_APP', 'API', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('SHIPPER', 'CARRIER', 'FORWARDER', 'DRIVER');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'PENDING_SIGNATURES', 'PARTIALLY_SIGNED', 'SIGNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SignatureMethod" AS ENUM ('INTERNAL_ACCEPTANCE');

-- CreateEnum
CREATE TYPE "SignatureStatus" AS ENUM ('SIGNED', 'REVOKED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CONTRACT', 'APPLICATION', 'CMR', 'INVOICE', 'PACKING_LIST', 'VEHICLE_DOCUMENT', 'DRIVER_DOCUMENT', 'CARGO_PHOTO', 'SEAL_PHOTO', 'PROOF_OF_DELIVERY', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'DELETED');

-- CreateEnum
CREATE TYPE "TrackingEventType" AS ENUM ('MANUAL_LOCATION', 'ARRIVED_LOADING', 'LOADED', 'DEPARTED', 'BORDER_ARRIVED', 'BORDER_CLEARED', 'DELIVERY_ARRIVED', 'DELIVERED');

-- CreateEnum
CREATE TYPE "TrackingSource" AS ENUM ('DRIVER_APP', 'WEB', 'GPS_PROVIDER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_BID', 'BID_ACCEPTED', 'BID_REJECTED', 'BID_COUNTERED', 'CONTRACT_READY', 'CONTRACT_SIGNED', 'VEHICLE_ASSIGNED', 'DRIVER_ASSIGNED', 'STATUS_CHANGED', 'NEW_DOCUMENT', 'NEW_MESSAGE', 'DELIVERY_CONFIRMED', 'DISPUTE_CREATED', 'DISPUTE_UPDATED', 'LOAD_PUBLISHED', 'LOAD_QUESTION', 'VERIFICATION_UPDATED', 'PAYMENT_UPDATED', 'REVIEW_RECEIVED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('PREPAYMENT', 'FINAL_PAYMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PLANNED', 'INVOICED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DisputeReason" AS ENUM ('DELAY', 'DAMAGE', 'MISSING_DOCUMENTS', 'CARGO_MISMATCH', 'PAYMENT_ISSUE', 'OTHER');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "locale" TEXT NOT NULL DEFAULT 'ru-RU',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Almaty',
    "lastLoginAt" TIMESTAMPTZ(3),
    "blockedAt" TIMESTAMPTZ(3),
    "blockReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "activeCompanyId" UUID,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "type" "CompanyType" NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "registrationNumber" TEXT NOT NULL,
    "taxId" TEXT,
    "country" TEXT NOT NULL,
    "region" TEXT,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "postalCode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "description" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "suspendedAt" TIMESTAMPTZ(3),
    "suspendReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyMember" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "MemberRole" NOT NULL,
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CompanyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyInvite" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedByUserId" UUID NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedByUserId" UUID,
    "acceptedAt" TIMESTAMPTZ(3),
    "driverProfileId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CompanyInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyDocument" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "uploadedByUserId" UUID NOT NULL,
    "verificationRequestId" UUID,
    "type" "CompanyDocumentType" NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CompanyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationRequest" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "submittedByUserId" UUID NOT NULL,
    "status" "VerificationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "reviewerUserId" UUID,
    "reviewComment" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VerificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER,
    "vehicleType" "VehicleType" NOT NULL,
    "bodyType" "BodyType" NOT NULL,
    "capacityKg" DECIMAL(12,2) NOT NULL,
    "volumeM3" DECIMAL(10,2),
    "vin" TEXT,
    "status" "VehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "gpsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverProfile" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "companyId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "licenseCategory" TEXT NOT NULL,
    "licenseExpiry" TIMESTAMPTZ(3),
    "passportNumber" TEXT,
    "status" "DriverStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DriverProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Load" (
    "id" UUID NOT NULL,
    "publicNumber" TEXT NOT NULL,
    "companyId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "clientName" TEXT,
    "title" TEXT NOT NULL,
    "cargoType" "CargoType" NOT NULL,
    "cargoDescription" TEXT,
    "weightKg" DECIMAL(12,2) NOT NULL,
    "volumeM3" DECIMAL(10,2),
    "packagesCount" INTEGER,
    "packageType" TEXT,
    "vehicleType" "VehicleType",
    "bodyType" "BodyType",
    "temperatureFrom" DECIMAL(5,1),
    "temperatureTo" DECIMAL(5,1),
    "requiresGps" BOOLEAN NOT NULL DEFAULT false,
    "requirements" TEXT,
    "priceType" "PriceType" NOT NULL,
    "targetPrice" DECIMAL(14,2),
    "currency" "Currency" NOT NULL,
    "additionalTerms" TEXT,
    "loadingDateFrom" TIMESTAMPTZ(3) NOT NULL,
    "loadingDateTo" TIMESTAMPTZ(3),
    "deliveryDateFrom" TIMESTAMPTZ(3),
    "deliveryDateTo" TIMESTAMPTZ(3),
    "status" "LoadStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "LoadVisibility" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "originCountry" TEXT,
    "originCity" TEXT,
    "destinationCountry" TEXT,
    "destinationCity" TEXT,
    "publishedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Load_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoadStop" (
    "id" UUID NOT NULL,
    "loadId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" "StopType" NOT NULL,
    "country" TEXT NOT NULL,
    "region" TEXT,
    "city" TEXT NOT NULL,
    "street" TEXT,
    "building" TEXT,
    "postalCode" TEXT,
    "fullAddress" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "plannedDateFrom" TIMESTAMPTZ(3),
    "plannedDateTo" TIMESTAMPTZ(3),
    "timezone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LoadStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoadInvitation" (
    "id" UUID NOT NULL,
    "loadId" UUID NOT NULL,
    "carrierCompanyId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LoadInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoadDocument" (
    "id" UUID NOT NULL,
    "loadId" UUID NOT NULL,
    "uploadedByUserId" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "LoadDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoadQuestion" (
    "id" UUID NOT NULL,
    "loadId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "askedByUserId" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "answeredByUserId" UUID,
    "answeredAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LoadQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" UUID NOT NULL,
    "loadId" UUID NOT NULL,
    "carrierCompanyId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "comment" TEXT,
    "terms" TEXT,
    "readyDate" TIMESTAMPTZ(3),
    "status" "BidStatus" NOT NULL DEFAULT 'PENDING',
    "counterAmount" DECIMAL(14,2),
    "awaitingSide" "PartySide" NOT NULL DEFAULT 'CUSTOMER',
    "validUntil" TIMESTAMPTZ(3),
    "decidedAt" TIMESTAMPTZ(3),
    "decidedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidMessage" (
    "id" UUID NOT NULL,
    "bidId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "authorCompanyId" UUID NOT NULL,
    "side" "PartySide" NOT NULL,
    "type" "BidMessageType" NOT NULL,
    "amount" DECIMAL(14,2),
    "currency" "Currency",
    "message" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BidMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportOrder" (
    "id" UUID NOT NULL,
    "publicNumber" TEXT NOT NULL,
    "loadId" UUID NOT NULL,
    "shipperCompanyId" UUID NOT NULL,
    "carrierCompanyId" UUID NOT NULL,
    "forwarderCompanyId" UUID,
    "acceptedBidId" UUID NOT NULL,
    "agreedAmount" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "currentStatus" "OrderStatus" NOT NULL,
    "previousStatus" "OrderStatus",
    "statusChangedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loadingDate" TIMESTAMPTZ(3),
    "deliveryDate" TIMESTAMPTZ(3),
    "vehicleId" UUID,
    "driverId" UUID,
    "deliveredAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TransportOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportOrderStatusHistory" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "actorUserId" UUID,
    "actorType" "ActorType" NOT NULL,
    "source" "ActionSource" NOT NULL,
    "comment" TEXT,
    "trackingEventId" UUID,
    "documentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TransportOrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportOrderParticipant" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "companyId" UUID,
    "userId" UUID,
    "role" "ParticipantRole" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TransportOrderParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractTemplate" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentSnapshot" TEXT NOT NULL,
    "dataSnapshot" JSONB NOT NULL,
    "pdfUrl" TEXT,
    "contentHash" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'PENDING_SIGNATURES',
    "signedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractSignature" (
    "id" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "side" "PartySide" NOT NULL,
    "method" "SignatureMethod" NOT NULL,
    "signedAt" TIMESTAMPTZ(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "documentHash" TEXT NOT NULL,
    "signatureStatus" "SignatureStatus" NOT NULL DEFAULT 'SIGNED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ContractSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderDocument" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "uploadedByUserId" UUID NOT NULL,
    "uploadedCompanyId" UUID,
    "type" "DocumentType" NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "groupId" UUID NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "deletedAt" TIMESTAMPTZ(3),
    "deletedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrderDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingEvent" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "userId" UUID,
    "type" "TrackingEventType" NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "note" TEXT,
    "source" "TrackingSource" NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "senderUserId" UUID NOT NULL,
    "senderCompanyId" UUID,
    "message" TEXT NOT NULL,
    "attachmentId" UUID,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatReadState" (
    "id" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lastReadAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChatReadState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "payerCompanyId" UUID NOT NULL,
    "payeeCompanyId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "type" "PaymentType" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PLANNED',
    "dueDate" TIMESTAMPTZ(3),
    "paidAt" TIMESTAMPTZ(3),
    "note" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "fromCompanyId" UUID NOT NULL,
    "toCompanyId" UUID NOT NULL,
    "fromUserId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "punctuality" INTEGER,
    "communication" INTEGER,
    "documentation" INTEGER,
    "comment" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "openedByUserId" UUID NOT NULL,
    "openedByCompanyId" UUID,
    "reason" "DisputeReason" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "orderStatusBefore" "OrderStatus" NOT NULL,
    "resolution" TEXT,
    "resolvedByUserId" UUID,
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeComment" (
    "id" UUID NOT NULL,
    "disputeId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DisputeComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "companyId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "Company_type_idx" ON "Company"("type");

-- CreateIndex
CREATE INDEX "Company_verificationStatus_idx" ON "Company"("verificationStatus");

-- CreateIndex
CREATE INDEX "Company_legalName_idx" ON "Company"("legalName");

-- CreateIndex
CREATE UNIQUE INDEX "Company_country_registrationNumber_key" ON "Company"("country", "registrationNumber");

-- CreateIndex
CREATE INDEX "CompanyMember_userId_idx" ON "CompanyMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyMember_companyId_userId_key" ON "CompanyMember"("companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyInvite_tokenHash_key" ON "CompanyInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "CompanyInvite_companyId_idx" ON "CompanyInvite"("companyId");

-- CreateIndex
CREATE INDEX "CompanyInvite_email_idx" ON "CompanyInvite"("email");

-- CreateIndex
CREATE INDEX "CompanyDocument_companyId_idx" ON "CompanyDocument"("companyId");

-- CreateIndex
CREATE INDEX "VerificationRequest_companyId_idx" ON "VerificationRequest"("companyId");

-- CreateIndex
CREATE INDEX "VerificationRequest_status_idx" ON "VerificationRequest"("status");

-- CreateIndex
CREATE INDEX "Vehicle_companyId_status_idx" ON "Vehicle"("companyId", "status");

-- CreateIndex
CREATE INDEX "Vehicle_plateNumber_idx" ON "Vehicle"("plateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_country_plateNumber_key" ON "Vehicle"("country", "plateNumber");

-- CreateIndex
CREATE INDEX "DriverProfile_companyId_status_idx" ON "DriverProfile"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DriverProfile_companyId_userId_key" ON "DriverProfile"("companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Load_publicNumber_key" ON "Load"("publicNumber");

-- CreateIndex
CREATE INDEX "Load_status_idx" ON "Load"("status");

-- CreateIndex
CREATE INDEX "Load_createdAt_idx" ON "Load"("createdAt");

-- CreateIndex
CREATE INDEX "Load_loadingDateFrom_idx" ON "Load"("loadingDateFrom");

-- CreateIndex
CREATE INDEX "Load_originCountry_originCity_idx" ON "Load"("originCountry", "originCity");

-- CreateIndex
CREATE INDEX "Load_destinationCountry_destinationCity_idx" ON "Load"("destinationCountry", "destinationCity");

-- CreateIndex
CREATE INDEX "Load_companyId_status_idx" ON "Load"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LoadStop_loadId_sequence_key" ON "LoadStop"("loadId", "sequence");

-- CreateIndex
CREATE INDEX "LoadInvitation_carrierCompanyId_idx" ON "LoadInvitation"("carrierCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "LoadInvitation_loadId_carrierCompanyId_key" ON "LoadInvitation"("loadId", "carrierCompanyId");

-- CreateIndex
CREATE INDEX "LoadDocument_loadId_idx" ON "LoadDocument"("loadId");

-- CreateIndex
CREATE INDEX "LoadQuestion_loadId_idx" ON "LoadQuestion"("loadId");

-- CreateIndex
CREATE INDEX "Bid_loadId_idx" ON "Bid"("loadId");

-- CreateIndex
CREATE INDEX "Bid_carrierCompanyId_status_idx" ON "Bid"("carrierCompanyId", "status");

-- CreateIndex
CREATE INDEX "BidMessage_bidId_createdAt_idx" ON "BidMessage"("bidId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TransportOrder_publicNumber_key" ON "TransportOrder"("publicNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TransportOrder_loadId_key" ON "TransportOrder"("loadId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportOrder_acceptedBidId_key" ON "TransportOrder"("acceptedBidId");

-- CreateIndex
CREATE INDEX "TransportOrder_currentStatus_idx" ON "TransportOrder"("currentStatus");

-- CreateIndex
CREATE INDEX "TransportOrder_carrierCompanyId_idx" ON "TransportOrder"("carrierCompanyId");

-- CreateIndex
CREATE INDEX "TransportOrder_shipperCompanyId_idx" ON "TransportOrder"("shipperCompanyId");

-- CreateIndex
CREATE INDEX "TransportOrder_forwarderCompanyId_idx" ON "TransportOrder"("forwarderCompanyId");

-- CreateIndex
CREATE INDEX "TransportOrder_driverId_idx" ON "TransportOrder"("driverId");

-- CreateIndex
CREATE INDEX "TransportOrder_vehicleId_idx" ON "TransportOrder"("vehicleId");

-- CreateIndex
CREATE INDEX "TransportOrder_createdAt_idx" ON "TransportOrder"("createdAt");

-- CreateIndex
CREATE INDEX "TransportOrderStatusHistory_orderId_createdAt_idx" ON "TransportOrderStatusHistory"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "TransportOrderParticipant_companyId_idx" ON "TransportOrderParticipant"("companyId");

-- CreateIndex
CREATE INDEX "TransportOrderParticipant_userId_idx" ON "TransportOrderParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportOrderParticipant_orderId_role_companyId_userId_key" ON "TransportOrderParticipant"("orderId", "role", "companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractTemplate_code_version_key" ON "ContractTemplate"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_documentNumber_key" ON "Contract"("documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_orderId_version_key" ON "Contract"("orderId", "version");

-- CreateIndex
CREATE INDEX "ContractSignature_contractId_idx" ON "ContractSignature"("contractId");

-- CreateIndex
CREATE INDEX "OrderDocument_orderId_createdAt_idx" ON "OrderDocument"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderDocument_groupId_idx" ON "OrderDocument"("groupId");

-- CreateIndex
CREATE INDEX "TrackingEvent_orderId_createdAt_idx" ON "TrackingEvent"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatThread_orderId_key" ON "ChatThread"("orderId");

-- CreateIndex
CREATE INDEX "ChatMessage_threadId_createdAt_idx" ON "ChatMessage"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatReadState_threadId_userId_key" ON "ChatReadState"("threadId", "userId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentRecord_orderId_idx" ON "PaymentRecord"("orderId");

-- CreateIndex
CREATE INDEX "Review_toCompanyId_idx" ON "Review"("toCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_orderId_fromCompanyId_key" ON "Review"("orderId", "fromCompanyId");

-- CreateIndex
CREATE INDEX "Dispute_orderId_idx" ON "Dispute"("orderId");

-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");

-- CreateIndex
CREATE INDEX "DisputeComment_disputeId_createdAt_idx" ON "DisputeComment"("disputeId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_userId_scope_key_key" ON "IdempotencyKey"("userId", "scope", "key");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMember" ADD CONSTRAINT "CompanyMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMember" ADD CONSTRAINT "CompanyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyInvite" ADD CONSTRAINT "CompanyInvite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDocument" ADD CONSTRAINT "CompanyDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDocument" ADD CONSTRAINT "CompanyDocument_verificationRequestId_fkey" FOREIGN KEY ("verificationRequestId") REFERENCES "VerificationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverProfile" ADD CONSTRAINT "DriverProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverProfile" ADD CONSTRAINT "DriverProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Load" ADD CONSTRAINT "Load_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Load" ADD CONSTRAINT "Load_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadStop" ADD CONSTRAINT "LoadStop_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadInvitation" ADD CONSTRAINT "LoadInvitation_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadInvitation" ADD CONSTRAINT "LoadInvitation_carrierCompanyId_fkey" FOREIGN KEY ("carrierCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadDocument" ADD CONSTRAINT "LoadDocument_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadQuestion" ADD CONSTRAINT "LoadQuestion_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadQuestion" ADD CONSTRAINT "LoadQuestion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_carrierCompanyId_fkey" FOREIGN KEY ("carrierCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidMessage" ADD CONSTRAINT "BidMessage_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidMessage" ADD CONSTRAINT "BidMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidMessage" ADD CONSTRAINT "BidMessage_authorCompanyId_fkey" FOREIGN KEY ("authorCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOrder" ADD CONSTRAINT "TransportOrder_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOrder" ADD CONSTRAINT "TransportOrder_shipperCompanyId_fkey" FOREIGN KEY ("shipperCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOrder" ADD CONSTRAINT "TransportOrder_carrierCompanyId_fkey" FOREIGN KEY ("carrierCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOrder" ADD CONSTRAINT "TransportOrder_forwarderCompanyId_fkey" FOREIGN KEY ("forwarderCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOrder" ADD CONSTRAINT "TransportOrder_acceptedBidId_fkey" FOREIGN KEY ("acceptedBidId") REFERENCES "Bid"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOrder" ADD CONSTRAINT "TransportOrder_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOrder" ADD CONSTRAINT "TransportOrder_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DriverProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOrderStatusHistory" ADD CONSTRAINT "TransportOrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TransportOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOrderParticipant" ADD CONSTRAINT "TransportOrderParticipant_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TransportOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOrderParticipant" ADD CONSTRAINT "TransportOrderParticipant_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TransportOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDocument" ADD CONSTRAINT "OrderDocument_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TransportOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TransportOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TransportOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "OrderDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReadState" ADD CONSTRAINT "ChatReadState_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReadState" ADD CONSTRAINT "ChatReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TransportOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_payerCompanyId_fkey" FOREIGN KEY ("payerCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_payeeCompanyId_fkey" FOREIGN KEY ("payeeCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TransportOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_fromCompanyId_fkey" FOREIGN KEY ("fromCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_toCompanyId_fkey" FOREIGN KEY ("toCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TransportOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeComment" ADD CONSTRAINT "DisputeComment_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────── CargoFlow: custom constraints (not expressible in Prisma schema) ─────────────

-- Человекочитаемые номера: CF-L-000001, CF-O-000001, CF-C-000001
CREATE SEQUENCE IF NOT EXISTS "load_number_seq" START 1;
CREATE SEQUENCE IF NOT EXISTS "order_number_seq" START 1;
CREATE SEQUENCE IF NOT EXISTS "contract_number_seq" START 1;

-- Одна активная (PENDING) ставка перевозчика на груз
CREATE UNIQUE INDEX "Bid_one_active_per_carrier" ON "Bid" ("loadId", "carrierCompanyId") WHERE "status" = 'PENDING';
-- Только одна принятая ставка на груз
CREATE UNIQUE INDEX "Bid_one_accepted_per_load" ON "Bid" ("loadId") WHERE "status" = 'ACCEPTED';
-- Одна действующая подпись компании на версии договора
CREATE UNIQUE INDEX "ContractSignature_one_active_per_company" ON "ContractSignature" ("contractId", "companyId") WHERE "signatureStatus" = 'SIGNED';
-- Одна активная версия документа в группе версий
CREATE UNIQUE INDEX "OrderDocument_one_active_per_group" ON "OrderDocument" ("groupId") WHERE "status" = 'ACTIVE';
-- Один открытый спор на заказ
CREATE UNIQUE INDEX "Dispute_one_open_per_order" ON "Dispute" ("orderId") WHERE "status" IN ('OPEN', 'IN_REVIEW');

-- Бизнес-валидация на уровне БД
ALTER TABLE "Load" ADD CONSTRAINT "Load_weight_positive" CHECK ("weightKg" > 0);
ALTER TABLE "Load" ADD CONSTRAINT "Load_volume_positive" CHECK ("volumeM3" IS NULL OR "volumeM3" > 0);
ALTER TABLE "Load" ADD CONSTRAINT "Load_target_price_non_negative" CHECK ("targetPrice" IS NULL OR "targetPrice" >= 0);
ALTER TABLE "Load" ADD CONSTRAINT "Load_dates_order" CHECK ("deliveryDateFrom" IS NULL OR "loadingDateFrom" <= "deliveryDateFrom");
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_capacity_positive" CHECK ("capacityKg" > 0);
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "TransportOrder" ADD CONSTRAINT "TransportOrder_amount_positive" CHECK ("agreedAmount" > 0);
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_range" CHECK ("rating" BETWEEN 1 AND 5
  AND ("punctuality" IS NULL OR "punctuality" BETWEEN 1 AND 5)
  AND ("communication" IS NULL OR "communication" BETWEEN 1 AND 5)
  AND ("documentation" IS NULL OR "documentation" BETWEEN 1 AND 5));
ALTER TABLE "Review" ADD CONSTRAINT "Review_not_self" CHECK ("fromCompanyId" <> "toCompanyId");
